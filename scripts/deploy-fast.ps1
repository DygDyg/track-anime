# Быстрый деплой: WSL build → upload через PowerShell/SSH → restart на сервере
$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\GitHub\ta_new"
$Remote = "root@195.26.230.35"
$RemoteDir = "/var/www/ta_new"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa"
$BuildDirWsl = "/home/dygdyg/.cache/ta_new-build"
$TarPath = Join-Path $env:TEMP "ta_fast_deploy.tar.gz"

function Invoke-Ssh([string]$Command) {
  ssh -i $SshKey $Remote $Command
}

Write-Host "[deploy-fast] WSL build..."
wsl -e bash -lc "bash /mnt/d/GitHub/ta_new/scripts/deploy-fast-build.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[deploy-fast] pack artifact from WSL build dir..."
wsl -e bash -lc @"
set -e
cd '$BuildDirWsl'
tar -czf '/mnt/c/Users/dygdy/AppData/Local/Temp/ta_fast_deploy.tar.gz' \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.env \
  --exclude='*.tar.gz' \
  --exclude=.cursor \
  .
"@

if (-not (Test-Path $TarPath)) {
  throw "Archive not found: $TarPath"
}

$lockChanged = 0
$schemaChanged = 0

try {
  $localLock = (Get-FileHash "$ProjectRoot\package-lock.json" -Algorithm SHA256).Hash.ToLower()
  $remoteLock = (Invoke-Ssh "sha256sum $RemoteDir/package-lock.json 2>/dev/null | awk '{print `$1}'").Trim()
  if ($localLock -ne $remoteLock) { $lockChanged = 1 }
} catch {
  $lockChanged = 1
}

try {
  $localSchema = (Get-FileHash "$ProjectRoot\prisma\schema.prisma" -Algorithm SHA256).Hash.ToLower()
  $remoteSchema = (Invoke-Ssh "sha256sum $RemoteDir/prisma/schema.prisma 2>/dev/null | awk '{print `$1}'").Trim()
  if ($localSchema -ne $remoteSchema) { $schemaChanged = 1 }
} catch {
  $schemaChanged = 1
}

Write-Host "[deploy-fast] upload..."
& scp -i $SshKey $TarPath "${Remote}:/tmp/ta_fast_deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp failed with exit code $LASTEXITCODE" }

Write-Host "[deploy-fast] extract + server-deploy-fast..."
Invoke-Ssh "cd $RemoteDir && rm -rf public/bg && tar -xzf /tmp/ta_fast_deploy.tar.gz && rm -f /tmp/ta_fast_deploy.tar.gz && if [ -d bg ]; then ln -sfn ../bg public/bg; fi && LOCK_CHANGED=$lockChanged SCHEMA_CHANGED=$schemaChanged bash $RemoteDir/scripts/server-deploy-fast.sh"
if ($LASTEXITCODE -ne 0) { throw "server deploy failed with exit code $LASTEXITCODE" }

Remove-Item $TarPath -Force -ErrorAction SilentlyContinue
Write-Host "[deploy-fast] done"
