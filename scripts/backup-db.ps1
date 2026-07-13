# Creates a PostgreSQL dump from the local Docker container.
# Usage:
#   .\scripts\backup-db.ps1
#   .\scripts\backup-db.ps1 -BackupDir E:\GitHub\ta_new\backups\db

param(
    [string]$BackupDir = "",
    [string]$Prefix = "track-anime-db",
    [string]$ContainerName = "track-anime-db",
    [string]$Database = "track_anime",
    [string]$User = "track_anime",
    [ValidateSet("custom", "plain")]
    [string]$Format = "custom"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path $ProjectRoot "backups\db"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI not found. Install Docker Desktop and try again."
}

if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$extension = if ($Format -eq "custom") { "dump" } else { "sql" }
$dumpFile = "$Prefix-$timestamp.$extension"
$dumpPath = Join-Path $BackupDir $dumpFile
$containerDumpPath = "/tmp/$dumpFile"

Write-Host "[backup-db] container: $ContainerName"
Write-Host "[backup-db] database:  $Database"
Write-Host "[backup-db] output:    $dumpPath"

$containerId = (& docker ps --filter "name=$ContainerName" --filter "status=running" --format "{{.ID}}").Trim()
if (-not $containerId) {
    throw "Docker container '$ContainerName' is not running. Start it with: npm run docker:up"
}

$dumpArgs = @(
    "exec",
    $ContainerName,
    "pg_dump",
    "-U", $User,
    "-d", $Database,
    "--no-owner",
    "--no-privileges",
    "--format=$Format",
    "--file=$containerDumpPath"
)

& docker @dumpArgs
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed (exit $LASTEXITCODE)"
}

& docker cp "${ContainerName}:$containerDumpPath" $dumpPath
if ($LASTEXITCODE -ne 0) {
    throw "docker cp failed (exit $LASTEXITCODE)"
}

& docker exec $ContainerName rm -f $containerDumpPath | Out-Null

$sizeMb = [math]::Round((Get-Item -LiteralPath $dumpPath).Length / 1MB, 1)
Write-Host "[backup-db] saved: $dumpPath ($sizeMb MB)"
