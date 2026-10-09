# Быстрая заливка TrackAnime.apk + TrackAnime.json на сервер (без пересборки сайта).
#
# Использование:
#   .\scripts\deploy-apk.ps1 -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
#   .\scripts\deploy-apk.ps1
#   .\scripts\deploy-apk.ps1 -SkipPublish
#
# Без -ApkPath заливает уже опубликованные public/downloads/TrackAnime.{apk,json}.
# См. docs/DEPLOY.md, docs/ANDROID.md

param(
    [string]$Remote = "root@194.180.189.34",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [string]$ApkPath = "",
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$DefaultRemote = "root@194.180.189.34"
$DefaultSshKey = "$env:USERPROFILE\.ssh\id_rsa"
$DefaultServerAppDir = "/var/www/ta_new"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalApk = Join-Path $ProjectRoot "public\downloads\TrackAnime.apk"
$LocalManifest = Join-Path $ProjectRoot "public\downloads\TrackAnime.json"
$DownloadUrl = "https://track-anime.win/downloads/TrackAnime.apk"
$ManifestUrl = "https://track-anime.win/downloads/TrackAnime.json"

Merge-TaDeployLocalParams `
    -Remote ([ref]$Remote) `
    -DefaultRemote $DefaultRemote `
    -SshKey ([ref]$SshKey) `
    -DefaultSshKey $DefaultSshKey `
    -ServerAppDir ([ref]$ServerAppDir) `
    -DefaultServerAppDir $DefaultServerAppDir | Out-Null

$RemoteApk = "$ServerAppDir/public/downloads/TrackAnime.apk"
$RemoteManifest = "$ServerAppDir/public/downloads/TrackAnime.json"

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy-apk] $Message" -ForegroundColor $Color
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
Write-TaDeployConfigStatus -Prefix "[deploy-apk]"

if (-not $SkipPublish) {
    $source = $ApkPath
    if (-not $source) {
        $defaultRelease = Join-Path $ProjectRoot "android\app\build\outputs\apk\release\app-release.apk"
        if (Test-Path -LiteralPath $defaultRelease) {
            $source = $defaultRelease
            Write-Step "using default release APK: $source"
        }
    }
    if ($source) {
        Write-Step "publish APK + manifest..."
        & (Join-Path $PSScriptRoot "publish-android-apk.ps1") -SourcePath $source -ProjectRoot $ProjectRoot
    } elseif (-not (Test-Path -LiteralPath $LocalApk)) {
        throw "Local APK not found: $LocalApk (pass -ApkPath or build release APK first)"
    } else {
        Write-Step "APK already in public/downloads, skip republish"
    }
} elseif (-not (Test-Path -LiteralPath $LocalApk)) {
    throw "Local APK not found: $LocalApk (run without -SkipPublish)"
}

if (-not (Test-Path -LiteralPath $LocalManifest)) {
    throw "Local manifest not found: $LocalManifest (publish APK first to generate TrackAnime.json)"
}

$apkMb = [math]::Round((Get-Item -LiteralPath $LocalApk).Length / 1MB, 1)
Write-Step "ensure remote downloads dir..."
Invoke-SshWithRetry `
    -Key $SshKey `
    -RemoteHost $Remote `
    -Command "mkdir -p '$ServerAppDir/public/downloads'" `
    -Step "mkdir downloads" | Out-Null

Write-Step "upload: $LocalApk ($apkMb MB)"
Invoke-ScpWithRetry -Key $SshKey -LocalPath $LocalApk -Target "${Remote}:${RemoteApk}" -Step "scp apk upload"

Write-Step "upload: $LocalManifest"
Invoke-ScpWithRetry -Key $SshKey -LocalPath $LocalManifest -Target "${Remote}:${RemoteManifest}" -Step "scp manifest upload"

Write-Step "verify remote files..."
$result = Invoke-SshWithRetry -Key $SshKey -RemoteHost $Remote -Command "ls -lh '$RemoteApk' '$RemoteManifest'" -Step "remote ls"
if ($result.Output) {
    Write-Host $result.Output
}

Write-Step "verify download URLs..."
$apkCode = Invoke-TaDeployCurlHttpCode -Url $DownloadUrl
if ($apkCode -ne "200") {
    throw "APK URL returned HTTP $apkCode ($DownloadUrl)"
}
$manifestCode = Invoke-TaDeployCurlHttpCode -Url $ManifestUrl
if ($manifestCode -ne "200") {
    throw "Manifest URL returned HTTP $manifestCode ($ManifestUrl)"
}

function Resolve-GithubIoRepoPath {
    $cfg = Get-TaDeployLocalConfig
    $fromConfig = Get-TaDeployConfigValue -Config $cfg -Names @("githubIoRepo", "GithubIoRepo") -Default $null
    if ($fromConfig) {
        $expanded = [Environment]::ExpandEnvironmentVariables([string]$fromConfig)
        if (Test-Path -LiteralPath $expanded -PathType Container) {
            return (Resolve-Path -LiteralPath $expanded).Path
        }
        Write-Step "githubIoRepo not found: $expanded (skip Pages sync)" -Color Yellow
        return $null
    }
    $defaultPath = "D:\GitHub\track-anime.github.io"
    if (Test-Path -LiteralPath $defaultPath -PathType Container) {
        return $defaultPath
    }
    Write-Step "github.io repo not configured (set githubIoRepo in deploy.local.json); skip Pages sync" -Color Yellow
    return $null
}

function Sync-ApkToGithubIoPages {
    param([string]$RepoPath)

    $downloadsDir = Join-Path $RepoPath "downloads"
    New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null
    Copy-Item -LiteralPath $LocalApk -Destination (Join-Path $downloadsDir "TrackAnime.apk") -Force
    Copy-Item -LiteralPath $LocalManifest -Destination (Join-Path $downloadsDir "TrackAnime.json") -Force
    Write-Step "copied APK + manifest to $downloadsDir"

    $pushBat = Join-Path $RepoPath "GIT_PUSH.bat"
    if (-not (Test-Path -LiteralPath $pushBat)) {
        Write-Step "GIT_PUSH.bat missing in $RepoPath; files copied but not pushed" -Color Yellow
        return
    }

    Write-Step "push Pages repo via GIT_PUSH.bat..."
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # /c so timeout/pause in the bat cannot hang the deploy script forever.
        & cmd.exe /c "`"$pushBat`""
        $exit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
    if ($exit -ne 0) {
        Write-Step "GIT_PUSH.bat exited $exit (server APK already published)" -Color Yellow
        return
    }
    Write-Step "github.io Pages sync done" -Color Green
}

$githubIoRepo = Resolve-GithubIoRepoPath
if ($githubIoRepo) {
    try {
        Sync-ApkToGithubIoPages -RepoPath $githubIoRepo
    } catch {
        Write-Step "github.io sync failed: $($_.Exception.Message) (server APK already published)" -Color Yellow
    }
}

Write-Step "done ($DownloadUrl)" -Color Green
