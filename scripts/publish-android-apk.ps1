# Публикует подписанный APK в public/downloads/TrackAnime.apk + TrackAnime.json.
#
# Использование:
#   .\scripts\publish-android-apk.ps1 -SourcePath "android\app\build\outputs\apk\release\app-release.apk"
#
# См. docs/DEPLOY.md, docs/ANDROID.md

param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[publish-apk] $Message" -ForegroundColor $Color
}

$resolvedSource = Resolve-Path -LiteralPath $SourcePath -ErrorAction SilentlyContinue
if (-not $resolvedSource -or -not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
    throw "Android APK not found: $SourcePath"
}

$downloadsDir = Join-Path $ProjectRoot "public\downloads"
$targetPath = Join-Path $downloadsDir "TrackAnime.apk"
$manifestPath = Join-Path $downloadsDir "TrackAnime.json"
New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null
Copy-Item -LiteralPath $resolvedSource.Path -Destination $targetPath -Force

$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$aaptCandidates = Get-ChildItem -Path (Join-Path $sdkRoot "build-tools") -Filter "aapt.exe" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending
if (-not $aaptCandidates) {
    throw "Android Build Tools (aapt.exe) not found under $sdkRoot. Install Android SDK Build-Tools before publishing APK."
}

$badging = & $aaptCandidates[0].FullName dump badging $targetPath
$packageLine = $badging | Where-Object { $_ -like "package:*" } | Select-Object -First 1
if ($LASTEXITCODE -ne 0 -or -not $packageLine -or $packageLine -notmatch "versionCode='(?<code>\d+)'\s+versionName='(?<name>[^']*)'") {
    throw "Could not read versionCode/versionName from Android APK: $targetPath"
}

$versionCode = [int64]$Matches["code"]
$versionName = $Matches["name"]
$sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash.ToLowerInvariant()
[ordered]@{
    versionCode = $versionCode
    versionName = $versionName
    apkUrl      = "/downloads/TrackAnime.apk"
    sha256      = $sha256
} | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8

$apkSizeMb = [math]::Round((Get-Item -LiteralPath $targetPath).Length / 1MB, 1)
Write-Step "published $targetPath ($apkSizeMb MB), manifest $manifestPath (v$versionName, code $versionCode)" -Color Green
