# Publish Track Anime Windows shell → public/downloads
#
# Usage:
#   .\scripts\publish-windows-app.ps1
#   .\scripts\publish-windows-app.ps1 -Configuration Debug
#   .\scripts\publish-windows-app.ps1 -ProjectRoot "E:\GitHub\ta_new"

param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [string]$VersionName = "",
    [long]$VersionCode = 0,
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}
$Csproj = Join-Path $ProjectRoot "windows\TrackAnime\TrackAnime.csproj"
$OutDir = Join-Path $ProjectRoot "public\downloads"
$PublishDir = Join-Path $ProjectRoot "windows\publish"

if (-not (Test-Path $Csproj)) {
    throw "Windows project not found: $Csproj"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $PublishDir | Out-Null

Write-Host "[windows] Publishing $Configuration…" -ForegroundColor Cyan
& dotnet publish $Csproj `
    -c $Configuration `
    -r win-x64 `
    --self-contained false `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $PublishDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

$builtExe = Join-Path $PublishDir "TrackAnime.exe"
if (-not (Test-Path $builtExe)) { throw "TrackAnime.exe not found in $PublishDir" }

$targetExe = Join-Path $OutDir "TrackAnimeWindows.exe"
Copy-Item -Force $builtExe $targetExe

if ($VersionCode -le 0 -or [string]::IsNullOrWhiteSpace($VersionName)) {
    $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($targetExe)
    if ([string]::IsNullOrWhiteSpace($VersionName)) {
        $VersionName = if ($info.ProductVersion) { $info.ProductVersion.Split('+')[0] } else { "1.0.0" }
    }
    if ($VersionCode -le 0) {
        $parts = $VersionName.Split('.')
        $major = if ($parts.Length -gt 0) { [int]$parts[0] } else { 1 }
        $minor = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
        $build = if ($parts.Length -gt 2) { [int]$parts[2] } else { 0 }
        $VersionCode = ($major * 10000L) + ($minor * 100L) + $build
    }
}

$hash = (Get-FileHash -Algorithm SHA256 -Path $targetExe).Hash.ToLowerInvariant()
$manifest = @{
    versionCode = $VersionCode
    versionName = $VersionName
    exeUrl      = "/downloads/TrackAnimeWindows.exe"
    sha256      = $hash
} | ConvertTo-Json -Compress

$manifestPath = Join-Path $OutDir "TrackAnimeWindows.json"
Set-Content -Path $manifestPath -Value $manifest -Encoding utf8

Write-Host "[windows] Published:" -ForegroundColor Green
Write-Host "  $targetExe"
Write-Host "  $manifestPath"
Write-Host "  version $VersionName ($VersionCode), sha256=$hash"
