@echo off
setlocal

cd /d "%~dp0"

echo [Track Anime] Starting PostgreSQL docker container...
call npm run docker:up
if errorlevel 1 (
  echo [Track Anime] Failed to start Docker/PostgreSQL.
  pause
  exit /b 1
)

echo [Track Anime] Applying Prisma schema...
call npm run db:push
if errorlevel 1 (
  echo [Track Anime] Failed to apply Prisma schema.
  pause
  exit /b 1
)

echo [Track Anime] Starting watch party WebSocket server...
start "Track Anime Watch Party" cmd /k "cd /d ""%~dp0"" && npm run watch-party:server"

echo [Track Anime] Starting Next.js dev server...
start "Track Anime Dev" cmd /k "cd /d ""%~dp0"" && set NEXT_PUBLIC_WATCH_PARTY_WS_URL=ws://localhost:3001/watch-party-ws&& npm run dev"

echo.
echo [Track Anime] Dev is starting.
echo [Track Anime] Site: http://localhost:3000
echo [Track Anime] Watch party WS: ws://localhost:3001/watch-party-ws
echo.
pause
