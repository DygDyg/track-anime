# scripts/backup-db.ps1
# Дамп базы данных PostgreSQL (использует переменные окружения: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
# Использование: .\scripts\backup-db.ps1 [-BackupDir <путь>] [-Prefix <префикс>]

param(
    [string]$BackupDir = "$(Resolve-Path ..\backups)",
    [string]$Prefix = "db-backup"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFile = "$Prefix-$timestamp.sql"
$dumpPath = Join-Path $BackupDir $dumpFile

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Write-Host "Создаю дамп базы данных …"

$cmd = @(
    "pg_dump",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    "--file=$dumpPath"
) -join " "

& $cmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Дамп сохранён: $dumpPath"
} else {
    Write-Error "❌ Ошибка при создании дампа (код $LASTEXITCODE)"
}