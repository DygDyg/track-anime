# Быстрая заливка TrackAnimeDiscordRPC.exe на сервер (без пересборки сайта).
#
# Использование:
#   .\scripts\deploy-rpc.ps1
#   .\scripts\deploy-rpc.ps1 -SkipBuild
#
# См. docs/DEPLOY.md

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalExe = Join-Path $ProjectRoot "public\downloads\TrackAnimeDiscordRPC.exe"
$RemoteExe = "$ServerAppDir/public/downloads/TrackAnimeDiscordRPC.exe"
$DownloadUrl = "https://ta.dygdyg.ru/downloads/TrackAnimeDiscordRPC.exe"

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy-rpc] $Message" -ForegroundColor $Color
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

if (-not $SkipBuild) {
    Write-Step "build + publish..."
    npm run discord:tray:publish
    Assert-LastExit "discord tray publish"
} elseif (-not (Test-Path $LocalExe)) {
    throw "Local exe not found: $LocalExe (run without -SkipBuild)"
}

$sizeMb = [math]::Round((Get-Item $LocalExe).Length / 1MB, 1)
Write-Step "upload: $LocalExe ($sizeMb MB)"

& scp -i $SshKey $LocalExe "${Remote}:${RemoteExe}"
Assert-LastExit "scp upload"

Write-Step "verify remote file..."
$remoteCmd = "ls -lh '$RemoteExe'"
& ssh -i $SshKey $Remote $remoteCmd
Assert-LastExit "remote ls"

Write-Step "verify download url..."
$httpCode = curl.exe -s -o NUL -w "%{http_code}" $DownloadUrl
if ($httpCode -ne "200") {
    throw "Download URL returned HTTP $httpCode ($DownloadUrl)"
}

Write-Step "done ($DownloadUrl)" -Color Green
