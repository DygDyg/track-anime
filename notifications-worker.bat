@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Notifications Worker

echo [worker] Zapusk: npm run notifications:worker
echo [worker] Otpravka ocheredi v Telegram, VK, Discord.
echo [worker] Na prode worker takzhe zapuskayetsya iz kodik-sync-scheduled.
echo.

call npm run notifications:worker

if errorlevel 1 (
  echo.
  echo [worker] Oshibka zapuska.
  pause
)
