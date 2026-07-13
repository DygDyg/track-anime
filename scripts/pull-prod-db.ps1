# Downloads a PostgreSQL dump from the production Docker container.
# Usage:
#   .\scripts\pull-prod-db.ps1
#   .\scripts\pull-prod-db.ps1 -Restore

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$RemoteContainerName = "track-anime-db",
    [string]$LocalContainerName = "track-anime-db",
    [string]$Database = "track_anime",
    [string]$User = "track_anime",
    [string]$BackupDir = "",
    [switch]$Restore,
    [switch]$SkipLocalBackup
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BackupDir)) {
    $BackupDir = Join-Path $ProjectRoot "backups\db"
}

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name not found in PATH"
    }
}

function Assert-LastExit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit $LASTEXITCODE)"
    }
}

function Get-SshBaseOptions {
    param([string]$Key)
    return @(
        "-i", $Key,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=25",
        "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=8"
    )
}

Assert-Command "ssh"
Assert-Command "scp"
Assert-Command "docker"

if (-not (Test-Path -LiteralPath $SshKey)) {
    throw "SSH key not found: $SshKey"
}

if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFile = "prod-track-anime-db-$timestamp.dump"
$localDumpPath = Join-Path $BackupDir $dumpFile
$remoteHostDumpPath = "/tmp/$dumpFile"
$remoteContainerDumpPath = "/tmp/$dumpFile"

Write-Host "[pull-prod-db] remote:    $Remote"
Write-Host "[pull-prod-db] database:  $Database"
Write-Host "[pull-prod-db] output:    $localDumpPath"

$sshOptions = Get-SshBaseOptions -Key $SshKey

$remoteCheck = "docker ps --filter name=$RemoteContainerName --filter status=running --format '{{.ID}}'"
$remoteContainerId = (& ssh @sshOptions $Remote $remoteCheck).Trim()
Assert-LastExit "remote docker ps"
if (-not $remoteContainerId) {
    throw "Remote Docker container '$RemoteContainerName' is not running"
}

$remoteDumpCmd = @(
    "docker exec $RemoteContainerName pg_dump",
    "-U $User",
    "-d $Database",
    "--no-owner",
    "--no-privileges",
    "--format=custom",
    "--file=$remoteContainerDumpPath",
    "&&",
    "docker cp ${RemoteContainerName}:$remoteContainerDumpPath $remoteHostDumpPath"
) -join " "

Write-Host "[pull-prod-db] creating remote dump..."
& ssh @sshOptions $Remote $remoteDumpCmd
Assert-LastExit "remote pg_dump"

try {
    Write-Host "[pull-prod-db] downloading dump..."
    & scp @sshOptions "${Remote}:$remoteHostDumpPath" $localDumpPath
    Assert-LastExit "scp download"
} finally {
    & ssh @sshOptions $Remote "docker exec $RemoteContainerName rm -f $remoteContainerDumpPath; rm -f $remoteHostDumpPath" | Out-Null
}

$sizeMb = [math]::Round((Get-Item -LiteralPath $localDumpPath).Length / 1MB, 1)
Write-Host "[pull-prod-db] saved: $localDumpPath ($sizeMb MB)"

if (-not $Restore) {
    Write-Host "[pull-prod-db] restore skipped. Use -Restore to overwrite local dev DB."
    exit 0
}

$localContainerId = (& docker ps --filter "name=$LocalContainerName" --filter "status=running" --format "{{.ID}}").Trim()
if (-not $localContainerId) {
    throw "Local Docker container '$LocalContainerName' is not running. Start it with: npm run docker:up"
}

if (-not $SkipLocalBackup) {
    Write-Host "[pull-prod-db] backing up local dev DB before restore..."
    & (Join-Path $PSScriptRoot "backup-db.ps1") -BackupDir $BackupDir -Prefix "dev-before-prod-restore"
}

$containerRestorePath = "/tmp/$dumpFile"
Write-Host "[pull-prod-db] copying dump into local container..."
& docker cp $localDumpPath "${LocalContainerName}:$containerRestorePath"
Assert-LastExit "docker cp to local"

try {
    Write-Host "[pull-prod-db] terminating local DB connections..."
    & docker exec $LocalContainerName psql -U $User -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();" | Out-Null
    Assert-LastExit "terminate local DB connections"

    Write-Host "[pull-prod-db] restoring into local dev DB..."
    & docker exec $LocalContainerName pg_restore `
        -U $User `
        -d $Database `
        --clean `
        --if-exists `
        --no-owner `
        --no-privileges `
        $containerRestorePath
    Assert-LastExit "local pg_restore"
} finally {
    & docker exec $LocalContainerName rm -f $containerRestorePath | Out-Null
}

Write-Host "[pull-prod-db] local dev DB restored from production dump"
