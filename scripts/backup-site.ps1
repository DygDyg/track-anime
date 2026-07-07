# scripts/backup-site.ps1
# Creates a backup of the project (excluding .git, node_modules, backups) and saves it as a zip file.
# Usage: .\scripts\backup-site.ps1 [-BackupRoot <path>] [-Prefix <prefix>]

param(
    [string]$BackupRoot = "backups",
    [string]$Prefix = "site-backup"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path (Resolve-Path $BackupRoot) $timestamp
$archiveName = "$Prefix-$timestamp.zip"
$archivePath = Join-Path (Resolve-Path $BackupRoot) $archiveName

if (-not (Test-Path (Resolve-Path $BackupRoot))) {
    New-Item -ItemType Directory -Path (Resolve-Path $BackupRoot) | Out-Null
}

# Remove previous temporary directory
Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue

# Copy all items except excluded directories
$source = (Get-Location).Path
$excludeList = @('.git', 'node_modules', 'backups')

# Build robocopy command: robocopy <source> <dest> /E /XD <excludes>
$cmd = @('robocopy', $source, $backupDir, '/E')
foreach ($excl in $excludeList) {
    $cmd += @('/XD', $excl)
}
$cmd += @('/NJH', '/NJS', '/NC', '/NS', '/NDL', '/NS', '/NJH') # suppress output

# Execute robocopy
& $cmd | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Error "Failed to copy files (robocopy exit code: $LASTEXITCODE)"
    exit 1
}

# Create zip archive from the copied directory
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($backupDir, $archivePath)

# Clean up temporary folder
Remove-Item -Path $backupDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "✅ Backup completed: $archivePath"