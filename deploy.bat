@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Deploy

echo [deploy] Track Anime - production deploy
echo [deploy] Sm. docs/DEPLOY.md
echo.

echo [deploy] Pre-deploy checks...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-precheck.ps1" %*
set "PRECHECK_CODE=%ERRORLEVEL%"
if not "%PRECHECK_CODE%"=="0" (
  echo.
  echo [deploy] Precheck failed ^(exit %PRECHECK_CODE%^).
  pause
  exit /b %PRECHECK_CODE%
)

echo.
echo [deploy] Starting deploy...
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
echo.
echo ============================================================
echo   LOCAL: deploy.bat finished successfully
echo   See the DEPLOY REPORT block above for server status.
echo ============================================================
pause
