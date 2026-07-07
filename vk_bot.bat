@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime VK Bot

echo [vk-bot] Zapusk: npm run notifications:vk-bot
echo [vk-bot] Odin ekzemplyar na token.
echo.

call npm run notifications:vk-bot

if errorlevel 1 (
  echo.
  echo [vk-bot] Oshibka zapuska.
  pause
)
