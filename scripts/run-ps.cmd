@echo off
REM Prefer PowerShell 7 (pwsh) when installed. npm/cmd often launches Windows
REM PowerShell 5.1 with a polluted PSModulePath from pwsh, which breaks Get-FileHash.
setlocal
where pwsh >nul 2>&1
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass %*
  exit /b %ERRORLEVEL%
)
powershell -NoProfile -ExecutionPolicy Bypass %*
exit /b %ERRORLEVEL%
