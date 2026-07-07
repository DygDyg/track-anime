@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Telegram Bot

echo [tg-bot] Zapusk: npm run notifications:telegram-bot
echo [tg-bot] Odin ekzemplyar na token (409 pri dvukh kopiyakh).
echo.

call npm run notifications:telegram-bot

if errorlevel 1 (
  echo.
  echo [tg-bot] Oshibka zapuska.
  pause
)
