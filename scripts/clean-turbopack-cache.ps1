# Ochistka Turbopack dev-kesha (.next/dev)
# Zapusk: clean-turbopack-cache.bat [--full]

param(
    [switch]$Full
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 3000
$DevDir = Join-Path $ProjectRoot ".next\dev"
$NextDir = Join-Path $ProjectRoot ".next"

Set-Location $ProjectRoot

function Write-CacheStep {
    param([string]$Message)
    Write-Host "[cache] $Message"
}

function Get-DirSizeGb {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $bytes = (Get-ChildItem $Path -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { return 0 }
    return [math]::Round($bytes / 1GB, 2)
}

function Show-NextSizes {
    param([string]$Label)
    Write-CacheStep $Label
    if (-not (Test-Path $NextDir)) {
        Write-Host "  .next: net"
        return
    }
    Write-Host ("  .next vsego: {0} GB" -f (Get-DirSizeGb $NextDir))
    foreach ($name in @("dev", "cache", "server", "static")) {
        $p = Join-Path $NextDir $name
        $size = Get-DirSizeGb $p
        if ($null -ne $size) {
            Write-Host ("  .next\{0}: {1} GB" -f $name, $size)
        }
    }
    $tp = Join-Path $NextDir "dev\cache\turbopack"
    $tpSize = Get-DirSizeGb $tp
    if ($null -ne $tpSize) {
        Write-Host ("  turbopack: {0} GB" -f $tpSize)
    }
}

Write-Host "============================================================"
Write-Host "  Track Anime - ochistka kesha Turbopack"
Write-Host "============================================================"
Write-Host ""

if (-not (Test-Path $NextDir)) {
    Write-CacheStep "Papka .next ne naydena - nechego udaljat."
    exit 0
}

Show-NextSizes "Razmery do ochistki:"
Write-Host ""

if (-not $Full -and -not (Test-Path $DevDir)) {
    Write-CacheStep ".next\dev ne nayden - turbopack-kesh uzhe otsutstvuet."
    exit 0
}

Write-CacheStep "Ostanovka dev-servera na portu $Port..."
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-CacheStep ("Ostanavlivayu PID {0}" -f $_.OwningProcess)
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 1
Write-Host ""

if ($Full) {
    Write-CacheStep "Udalenie vsey papki .next (--full)..."
    Remove-Item -LiteralPath $NextDir -Recurse -Force -ErrorAction Stop
    Write-CacheStep ".next udalena."
}
elseif (Test-Path $DevDir) {
    Write-CacheStep "Udalenie .next\dev (turbopack dev cache)..."
    Remove-Item -LiteralPath $DevDir -Recurse -Force -ErrorAction Stop
    Write-CacheStep ".next\dev udalena."
}
else {
    Write-CacheStep "Nechego udaljat."
}

Write-Host ""
Show-NextSizes "Razmery posle ochistki:"
Write-Host ""
Write-CacheStep "Gotovo. Sleduyushchiy npm run dev peresozdast kesh."
Write-CacheStep "Podskazka: clean-turbopack-cache.bat --full - udalit vsyu .next"

exit 0
