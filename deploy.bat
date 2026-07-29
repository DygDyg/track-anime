@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Deploy

echo [deploy] Track Anime - production deploy (auto: site / rpc / apk)
echo [deploy] Sm. docs/DEPLOY.md
echo.
echo [deploy] Targets chosen from git changes. Force site: deploy.bat -ForceSite
echo [deploy] Explicit: npm run deploy:site ^| deploy:rpc ^| deploy:apk
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-auto.ps1" %*
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
echo   See the deploy-auto / target reports above for status.
echo ============================================================
pause
