# Builds temp/deploy/ta-http-connect.exe via csc.exe (HTTP CONNECT + Basic auth).

function Get-TaDeployHttpConnectExe {
    $root = Get-TaDeployProjectRoot
    $outDir = Join-Path $root "temp\deploy"
    $exe = Join-Path $outDir "ta-http-connect.exe"
    $stamp = Join-Path $outDir "ta-http-connect.stamp"
    $src = Join-Path $PSScriptRoot "ta-http-connect.cs"
    $sourceVersion = "5"

    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    if (-not (Test-Path -LiteralPath $src)) {
        Write-Host "[deploy-config] warn: missing $src" -ForegroundColor Yellow
        return $null
    }

    $srcHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $src).Hash
    $wanted = "$sourceVersion-$srcHash"
    if ((Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $stamp)) {
        $existing = (Get-Content -LiteralPath $stamp -Raw).Trim()
        if ($existing -eq $wanted) {
            return $exe
        }
    }

    $cscCandidates = @(
        "${env:WINDIR}\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "${env:WINDIR}\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )
    $csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $csc) {
        Write-Host "[deploy-config] warn: csc.exe not found; cannot build ta-http-connect.exe" -ForegroundColor Yellow
        return $null
    }

    $tmpExe = Join-Path $outDir "ta-http-connect.build.exe"
    Remove-Item -LiteralPath $tmpExe -Force -ErrorAction SilentlyContinue
    $args = @(
        "/nologo",
        "/optimize+",
        "/target:exe",
        "/out:$tmpExe",
        "$src"
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & $csc @args 2>&1 | Out-Null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }

    if ($code -ne 0 -or -not (Test-Path -LiteralPath $tmpExe)) {
        Write-Host "[deploy-config] warn: csc failed to build ta-http-connect.exe (exit $code)" -ForegroundColor Yellow
        return $null
    }

    Move-Item -LiteralPath $tmpExe -Destination $exe -Force
    Set-Content -LiteralPath $stamp -Value $wanted -Encoding ascii
    return $exe
}
