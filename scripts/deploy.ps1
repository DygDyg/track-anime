# Полный деплой: tar → scp → server-deploy.sh (сборка на сервере, без WSL)
$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\GitHub\ta_new"
$Remote = "root@195.26.230.35"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa"
$TarPath = Join-Path $env:TEMP "ta_deploy.tar.gz"

Set-Location $ProjectRoot

Write-Host "[deploy] pack..."
tar -czf $TarPath --exclude=node_modules --exclude=.next --exclude=.env --exclude=.build-number --exclude="*.tar.gz" .

Write-Host "[deploy] upload..."
scp -i $SshKey $TarPath "${Remote}:/tmp/ta_deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

Write-Host "[deploy] server-deploy.sh..."
ssh -i $SshKey $Remote "bash /var/www/ta_new/scripts/server-deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "server deploy failed" }

Remove-Item $TarPath -Force -ErrorAction SilentlyContinue
Write-Host "[deploy] done"
