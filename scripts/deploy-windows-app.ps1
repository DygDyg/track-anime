# Быстрая заливка TrackAnimeWindows.exe + TrackAnimeWindows.json на сервер (без пересборки сайта).
#
# Использование:
#   .\scripts\deploy-windows-app.ps1
#   .\scripts\deploy-windows-app.ps1 -SkipPublish
#   .\scripts\deploy-windows-app.ps1 -Configuration Release
#
# Без -SkipPublish сначала собирает через publish-windows-app.ps1.
# С -SkipPublish заливает уже опубликованные public/downloads/TrackAnimeWindows.{exe,json}.
# См. docs/DEPLOY.md, docs/WINDOWS.md

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [string]$VersionName = "",
    [long]$VersionCode = 0,
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$DefaultRemote = "root@195.26.230.35"
$DefaultSshKey = "$env:USERPROFILE\.ssh\id_rsa"
$DefaultServerAppDir = "/var/www/ta_new"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalExe = Join-Path $ProjectRoot "public\downloads\TrackAnimeWindows.exe"
$LocalManifest = Join-Path $ProjectRoot "public\downloads\TrackAnimeWindows.json"
$DownloadUrl = "https://ta.dygdyg.ru/downloads/TrackAnimeWindows.exe"
$ManifestUrl = "https://ta.dygdyg.ru/downloads/TrackAnimeWindows.json"

Merge-TaDeployLocalParams `
    -Remote ([ref]$Remote) `
    -DefaultRemote $DefaultRemote `
    -SshKey ([ref]$SshKey) `
    -DefaultSshKey $DefaultSshKey `
    -ServerAppDir ([ref]$ServerAppDir) `
    -DefaultServerAppDir $DefaultServerAppDir | Out-Null

$RemoteExe = "$ServerAppDir/public/downloads/TrackAnimeWindows.exe"
$RemoteManifest = "$ServerAppDir/public/downloads/TrackAnimeWindows.json"

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy-windows] $Message" -ForegroundColor $Color
}

function Assert-LastExit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit $LASTEXITCODE)"
    }
}

function Get-SshBaseOptions {
    param([string]$Key)
    return @(Get-TaDeploySshOptions -Key $Key)
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
        [int]$MaxAttempts = -1,
        [string]$Step = "SSH"
    )

    if ($MaxAttempts -lt 0) {
        $MaxAttempts = Get-TaDeployRetryAttempts -Kind ssh -Default 5
    }

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
        [string]$LocalPath,
        [string]$Target,
        [int]$MaxAttempts = -1,
        [string]$Step = "scp upload"
    )

    if ($MaxAttempts -lt 0) {
        $MaxAttempts = Get-TaDeployRetryAttempts -Kind scp -Default 3
    }

    $scpOpts = @(Get-TaDeployScpOptions -Key $Key)

    $lastExit = 255
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        try {
            & scp @scpOpts $LocalPath $Target 2>$null
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
Write-TaDeployConfigStatus -Prefix "[deploy-windows]"

if (-not $SkipPublish) {
    Write-Step "publish Windows exe + manifest..."
    $publishArgs = @{
        Configuration = $Configuration
        ProjectRoot   = $ProjectRoot
    }
    if (-not [string]::IsNullOrWhiteSpace($VersionName)) {
        $publishArgs["VersionName"] = $VersionName
    }
    if ($VersionCode -gt 0) {
        $publishArgs["VersionCode"] = $VersionCode
    }
    & (Join-Path $PSScriptRoot "publish-windows-app.ps1") @publishArgs
    Assert-LastExit "publish-windows-app"
} elseif (-not (Test-Path -LiteralPath $LocalExe)) {
    throw "Local Windows exe not found: $LocalExe (run without -SkipPublish)"
}

if (-not (Test-Path -LiteralPath $LocalManifest)) {
    throw "Local manifest not found: $LocalManifest (publish Windows app first to generate TrackAnimeWindows.json)"
}

$exeMb = [math]::Round((Get-Item -LiteralPath $LocalExe).Length / 1MB, 1)
Write-Step "ensure remote downloads dir..."
Invoke-SshWithRetry `
    -Key $SshKey `
    -RemoteHost $Remote `
    -Command "mkdir -p '$ServerAppDir/public/downloads'" `
    -Step "mkdir downloads" | Out-Null

Write-Step "upload: $LocalExe ($exeMb MB)"
Invoke-ScpWithRetry -Key $SshKey -LocalPath $LocalExe -Target "${Remote}:${RemoteExe}" -Step "scp exe upload"

Write-Step "upload: $LocalManifest"
Invoke-ScpWithRetry -Key $SshKey -LocalPath $LocalManifest -Target "${Remote}:${RemoteManifest}" -Step "scp manifest upload"

Write-Step "verify remote files..."
$result = Invoke-SshWithRetry -Key $SshKey -RemoteHost $Remote -Command "ls -lh '$RemoteExe' '$RemoteManifest'" -Step "remote ls"
if ($result.Output) {
    Write-Host $result.Output
}

function Invoke-HttpCodeWithFallback {
    param([string]$Url)

    $code = [string](Invoke-TaDeployCurlHttpCode -Url $Url)
    if ($code -eq "200") { return $code }
    # Proxy curl sometimes returns 000 while the public URL is fine.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $direct = [string](& curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 20 --max-time 45 $Url)
        if ($LASTEXITCODE -eq 0 -and $direct) {
            return $direct.Trim()
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
    return $code
}

Write-Step "verify download URLs..."
$exeCode = ""
$manifestCode = ""
for ($attempt = 1; $attempt -le 5; $attempt++) {
    $exeCode = Invoke-HttpCodeWithFallback -Url $DownloadUrl
    $manifestCode = Invoke-HttpCodeWithFallback -Url $ManifestUrl
    if ($exeCode -eq "200" -and $manifestCode -eq "200") {
        break
    }
    if ($attempt -lt 5) {
        $waitSec = [math]::Min(12, $attempt * 2)
        Write-Step "URL check HTTP exe=$exeCode manifest=$manifestCode, retry $attempt/5 in ${waitSec}s..." -Color Yellow
        Start-Sleep -Seconds $waitSec
    }
}
if ($exeCode -ne "200") {
    throw "Windows exe URL returned HTTP $exeCode ($DownloadUrl)"
}
if ($manifestCode -ne "200") {
    throw "Manifest URL returned HTTP $manifestCode ($ManifestUrl)"
}

Write-Step "done ($DownloadUrl)" -Color Green
