# Полный деплой Track Anime: tar -> scp -> server-deploy.sh
# Сборка выполняется на сервере (без WSL).
#
# Использование:
#   .\scripts\deploy.ps1
#   .\scripts\deploy.ps1 -DryRun
#   .\scripts\deploy.ps1 -ForceTrayRebuild
#   .\scripts\deploy.ps1 -Remote "root@1.2.3.4"
#
# См. docs/DEPLOY.md

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [switch]$DryRun,
    [switch]$ForceTrayRebuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$TarPath = Join-Path $env:TEMP ("ta_deploy_{0:yyyyMMddHHmmss}.tar.gz" -f (Get-Date))

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy] $Message" -ForegroundColor $Color
}

function Assert-LastExit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit $LASTEXITCODE)"
    }
}

if (-not (Test-Path $SshKey)) {
    throw "SSH key not found: $SshKey"
}

Set-Location $ProjectRoot
Write-Step "project: $ProjectRoot"
Write-Step "remote:  $Remote"
Write-Step "app dir: $ServerAppDir"

Write-Step "discord tray publish..."
$distExe = Join-Path $ProjectRoot "scripts\discord-rpc-tray\dist\TrackAnimeDiscordRPC.exe"
if ($ForceTrayRebuild -or -not (Test-Path $distExe)) {
  npm run discord:tray:publish
} else {
  Write-Step "discord tray: copy existing exe (use -ForceTrayRebuild to rebuild)"
  node scripts/publish-discord-tray-exe.mjs
}
Assert-LastExit "discord tray publish"

$tarExcludes = @(
    "--exclude=node_modules",
    "--exclude=.next",
    "--exclude=.git",
    "--exclude=.env",
    "--exclude=.build-number",
    "--exclude=tmp",
    "--exclude=*.tar.gz",
    "--exclude=*.mp4",
    "--exclude=tsconfig.tsbuildinfo"
)

Write-Step "pack..."
if (Test-Path $TarPath) { Remove-Item $TarPath -Force }
& tar -czf $TarPath @tarExcludes .
Assert-LastExit "tar pack"

$tarSizeMb = [math]::Round((Get-Item $TarPath).Length / 1MB, 1)
Write-Step "archive: $TarPath ($tarSizeMb MB)"

if ($DryRun) {
    Write-Step "DryRun - upload and server steps skipped"
    exit 0
}

Write-Step "upload..."
& scp -i $SshKey $TarPath "${Remote}:/tmp/ta_deploy.tar.gz"
Assert-LastExit "scp upload"

Write-Step "server-deploy.sh..."
$remoteCmd = 'cd ' + $ServerAppDir + ' && sed -i ''s/\r$//'' scripts/*.sh && bash scripts/server-deploy.sh'

& ssh -i $SshKey $Remote $remoteCmd
Assert-LastExit "server deploy"

Remove-Item $TarPath -Force -ErrorAction SilentlyContinue
Write-Step "done" -Color Green
