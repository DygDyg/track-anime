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

function Get-SshBaseOptions {
    param([string]$Key)
    return @(
        "-i", $Key,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=25",
        "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=8"
    )
}

function Invoke-SshQuiet {
    param(
        [string]$Key,
        [string]$RemoteHost,
        [string]$Command
    )

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $output = & ssh @(Get-SshBaseOptions -Key $Key) $RemoteHost $Command 2>$null
        return @{
            ExitCode = $LASTEXITCODE
            Output   = $output
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Invoke-SshWithRetry {
    param(
        [string]$Key,
        [string]$RemoteHost,
        [string]$Command,
        [int]$MaxAttempts = 5,
        [string]$Step = "SSH"
    )

    $lastExit = 255
    $lastOutput = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $result = Invoke-SshQuiet -Key $Key -RemoteHost $RemoteHost -Command $Command
        $lastExit = $result.ExitCode
        $lastOutput = $result.Output
        if ($lastExit -eq 0) {
            return $result
        }
        if ($attempt -lt $MaxAttempts) {
            $waitSec = [math]::Min(8, $attempt * 2)
            Write-Step "$Step failed (exit $lastExit), retry $attempt/$MaxAttempts in ${waitSec}s..." -Color Yellow
            Start-Sleep -Seconds $waitSec
        }
    }

    throw "$Step failed after $MaxAttempts attempts (exit $lastExit)"
}

function Invoke-ScpWithRetry {
    param(
        [string]$Key,
        [string]$ArchivePath,
        [string]$Target,
        [int]$MaxAttempts = 3,
        [string]$Step = "scp upload"
    )

    $scpOpts = @(
        "-i", $Key,
        "-o", "ConnectTimeout=30",
        "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=8"
    )

    $lastExit = 255
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        try {
            & scp @scpOpts $ArchivePath $Target 2>$null
            $lastExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevEap
        }
        if ($lastExit -eq 0) {
            return
        }
        if ($attempt -lt $MaxAttempts) {
            $waitSec = [math]::Min(10, $attempt * 3)
            Write-Step "$Step failed (exit $lastExit), retry $attempt/$MaxAttempts in ${waitSec}s..." -Color Yellow
            Start-Sleep -Seconds $waitSec
        }
    }

    throw "$Step failed after $MaxAttempts attempts (exit $lastExit)"
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

Invoke-ScpWithRetry -Key $SshKey -ArchivePath $LocalExe -Target "${Remote}:${RemoteExe}" -Step "scp rpc upload"

Write-Step "verify remote file..."
$remoteCmd = "ls -lh '$RemoteExe'"
$result = Invoke-SshWithRetry -Key $SshKey -RemoteHost $Remote -Command $remoteCmd -Step "remote ls"
if ($result.Output) {
    Write-Host $result.Output
}

Write-Step "verify download url..."
$httpCode = curl.exe -s -o NUL -w "%{http_code}" $DownloadUrl
if ($httpCode -ne "200") {
    throw "Download URL returned HTTP $httpCode ($DownloadUrl)"
}

Write-Step "done ($DownloadUrl)" -Color Green
