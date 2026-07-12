@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Track Anime Dev

set "PORT=3000"

echo [dev] Proverka Docker...
where docker >nul 2>nul
if errorlevel 1 (
  echo [dev] Docker CLI ne nayden. Ustanovite Docker Desktop ili dobavte docker v PATH.
  pause
  exit /b 1
)

docker info >nul 2>nul
if not errorlevel 1 goto docker_ready

echo [dev] Docker ne zapushchen. Pytayus zapustit Docker Desktop...

if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else if exist "%LocalAppData%\Docker\Docker Desktop.exe" (
  start "" "%LocalAppData%\Docker\Docker Desktop.exe"
) else (
  echo [dev] Docker Desktop ne nayden. Zapustite Docker vruchnuyu i povtorite.
  pause
  exit /b 1
)

echo [dev] Ozhidanie zapuska Docker...
for /l %%i in (1,1,60) do (
  docker info >nul 2>nul
  if not errorlevel 1 (
    goto docker_ready
  )
  timeout /t 2 /nobreak >nul
)

:docker_ready
docker info >nul 2>nul
if errorlevel 1 (
  echo [dev] Docker ne zapustilsya za 120 sekund.
  pause
  exit /b 1
)

echo [dev] Zapusk PostgreSQL v Docker...
call npm run docker:up
if errorlevel 1 (
  echo.
  echo [dev] Oshibka zapuska Docker Compose.
  pause
  exit /b 1
)

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
