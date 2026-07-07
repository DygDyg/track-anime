@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime - clean turbopack cache

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\clean-turbopack-cache.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [cache] Oshibka ^(exit %EXIT_CODE%^).
  pause
  exit /b %EXIT_CODE%
)

echo.
pause
exit /b 0
