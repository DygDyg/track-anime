@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Deploy

echo [deploy] Track Anime - production deploy
echo [deploy] Sm. docs/DEPLOY.md
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [deploy] Oshibka ^(exit %EXIT_CODE%^).
  pause
  exit /b %EXIT_CODE%
)

echo.
echo [deploy] Gotovo.
pause
