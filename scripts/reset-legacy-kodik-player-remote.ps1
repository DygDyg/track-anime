# One-shot prod reset of useLegacyKodikPlayer. Uses deploy.local.json SSH/proxy.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-config.ps1")

$Remote = "root@194.180.189.34"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa"
$ServerAppDir = "/var/www/ta_new"
$UploadChunkSizeMB = 16

Merge-TaDeployLocalParams `
    -Remote ([ref]$Remote) `
    -DefaultRemote "root@194.180.189.34" `
    -SshKey ([ref]$SshKey) `
    -DefaultSshKey "$env:USERPROFILE\.ssh\id_rsa" `
    -ServerAppDir ([ref]$ServerAppDir) `
    -DefaultServerAppDir "/var/www/ta_new" `
    -UploadChunkSizeMB ([ref]$UploadChunkSizeMB) `
    -DefaultUploadChunkSizeMB 16 | Out-Null

Write-TaDeployConfigStatus

$sqlPath = Join-Path $env:TEMP "ta_reset_legacy_kodik.sql"
@(
    'UPDATE "User"',
    'SET "siteSettings" = jsonb_set(',
    '  COALESCE("siteSettings", ''{}''::jsonb),',
    '  ''{useLegacyKodikPlayer}'',',
    '  ''false''::jsonb,',
    '  true',
    '),',
    '"updatedAt" = NOW()',
    'WHERE COALESCE(("siteSettings"->>''useLegacyKodikPlayer'')::boolean, false) = true;',
    '',
    'UPDATE "SiteSettingsDefaults"',
    'SET settings = jsonb_set(',
    '  COALESCE(settings, ''{}''::jsonb),',
    '  ''{useLegacyKodikPlayer}'',',
    '  ''false''::jsonb,',
    '  true',
    '),',
    '"updatedAt" = NOW()',
    'WHERE COALESCE((settings->>''useLegacyKodikPlayer'')::boolean, false) = true;'
) | Set-Content -LiteralPath $sqlPath -Encoding ascii

$remoteSql = "/tmp/ta_reset_legacy_kodik.sql"
$sshOpts = @(Get-TaDeploySshOptions -Key $SshKey)
$scpOpts = @(Get-TaDeployScpOptions -Key $SshKey)

Write-Host "[reset] upload SQL → ${Remote}:${remoteSql}"
& scp @scpOpts $sqlPath "${Remote}:${remoteSql}"
if ($LASTEXITCODE -ne 0) { throw "scp failed: $LASTEXITCODE" }

Write-Host "[reset] execute on server..."
& ssh @sshOpts $Remote "cd $ServerAppDir && npx prisma db execute --file $remoteSql --schema prisma/schema.prisma && rm -f $remoteSql"
if ($LASTEXITCODE -ne 0) { throw "ssh/prisma failed: $LASTEXITCODE" }

Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
Write-Host "[reset] done"
