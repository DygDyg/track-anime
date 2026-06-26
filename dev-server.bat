@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Dev

set "PORT=3000"

echo [dev] Proverka porta %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('[dev] Ostanavlivayu PID ' + $_.OwningProcess); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

ping -n 2 127.0.0.1 >nul

echo [dev] Zapusk: npm run dev
echo.

call npm run dev

if errorlevel 1 (
  echo.
  echo [dev] Oshibka zapuska.
  pause
)