# Pre-deploy checks before upload/build on server.
#
# Usage:
#   .\scripts\deploy-precheck.ps1
#   .\scripts\deploy-precheck.ps1 -DryRun
#   .\scripts\deploy-precheck.ps1 -SkipBuild
#   .\scripts\deploy-precheck.ps1 -ForceTrayRebuild
#
# See docs/DEPLOY.md

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [switch]$DryRun,
    [switch]$SkipBuild,
    [switch]$ForceTrayRebuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[precheck] $Message" -ForegroundColor $Color
}

function Assert-LastExit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit $LASTEXITCODE)"
    }
}

function Test-RequiredCommand {
    param(
        [string]$Name,
        [string]$Hint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Required command not found: $Name. $Hint"
    }

    Write-Step "OK: $Name ($($command.Source))" -Color Green
}

Set-Location $ProjectRoot
Write-Step "project: $ProjectRoot"
Write-Step "remote:  $Remote"
Write-Step "app dir: $ServerAppDir"

if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    throw "package.json not found in $ProjectRoot"
}

Write-Step "required tools..."
Test-RequiredCommand -Name "node" -Hint "Install Node.js LTS."
Test-RequiredCommand -Name "npm" -Hint "Install Node.js (includes npm)."
Test-RequiredCommand -Name "tar" -Hint "Use Windows 10+ built-in tar or Git for Windows."
Test-RequiredCommand -Name "ssh" -Hint "Install OpenSSH Client (Windows optional feature)."
Test-RequiredCommand -Name "scp" -Hint "Install OpenSSH Client (Windows optional feature)."

Write-Step "SSH key..."
if (-not (Test-Path $SshKey)) {
    throw "SSH key not found: $SshKey"
}
Write-Step "OK: $SshKey" -Color Green

if ($DryRun) {
    Write-Step "DryRun: server SSH check skipped" -Color Yellow
} else {
    Write-Step "SSH connectivity ($Remote)..."
    $sshTest = & ssh @(
        "-i", $SshKey,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=15",
        "-o", "ConnectionAttempts=1",
        $Remote,
        "echo ok"
    ) 2>&1
    if ($LASTEXITCODE -ne 0) {
        $detail = ($sshTest | Out-String).Trim()
        throw "SSH connectivity check failed (exit $LASTEXITCODE). $detail"
    }
    Write-Step "OK: SSH $Remote" -Color Green
}

if ($SkipBuild -or $DryRun) {
    $reason = if ($DryRun) { "DryRun" } else { "SkipBuild" }
    Write-Step "${reason}: local build skipped" -Color Yellow
} else {
    Write-Step "local production build (npm run build)..."
    npm run build
    Assert-LastExit "npm run build"
    Write-Step "OK: build passed" -Color Green
}

Write-Host ""
Write-Step "all pre-deploy checks passed" -Color Green
