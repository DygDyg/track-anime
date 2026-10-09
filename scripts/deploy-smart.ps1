# Smart production deploy: pick the best channel for current network.
#
# Order:
#   1) SSH + git checkout on server  → server-deploy-git-bg.sh
#   2) SSH without git               → classic deploy.ps1 (tar/scp)
#   3) GitHub Actions workflow_dispatch (runner SSH from outside RU)
#   4) git push only                 → rely on GitHub webhook (if configured)
#
# Usage:
#   .\scripts\deploy-smart.ps1
#   .\scripts\deploy-smart.ps1 -DryRun
#   .\scripts\deploy-smart.ps1 -Channel actions
#   .\scripts\deploy-smart.ps1 -NoPush
#   npm run deploy:smart
#
# See docs/DEPLOY.md § Smart deploy

param(
    [ValidateSet("auto", "ssh-git", "ssh-tar", "actions", "webhook-push")]
    [string]$Channel = "auto",
    [string]$Remote = "root@194.180.189.34",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [string]$SiteUrl = "https://track-anime.win/",
    [string]$Workflow = "deploy.yml",
    [switch]$Force,
    [switch]$NoForce,
    [switch]$NoPush,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$DefaultRemote = "root@194.180.189.34"
$DefaultSshKey = "$env:USERPROFILE\.ssh\id_rsa"
$DefaultServerAppDir = "/var/www/ta_new"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Merge-TaDeployLocalParams `
    -Remote ([ref]$Remote) `
    -DefaultRemote $DefaultRemote `
    -SshKey ([ref]$SshKey) `
    -DefaultSshKey $DefaultSshKey `
    -ServerAppDir ([ref]$ServerAppDir) `
    -DefaultServerAppDir $DefaultServerAppDir | Out-Null

function Write-Smart {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy-smart] $Message" -ForegroundColor $Color
}

function Invoke-Ssh {
    param([string]$Command, [int]$ConnectTimeout = 20)
    $opts = @(Get-TaDeploySshOptions -Key $SshKey -ConnectTimeout $ConnectTimeout)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $output = & ssh @opts $Remote $Command 2>&1
        return @{
            Ok     = ($LASTEXITCODE -eq 0)
            Code   = $LASTEXITCODE
            Output = (($output | Out-String).Trim())
        }
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Test-GhAvailable {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $cmd) { return $false }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & gh auth status 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Get-SiteBuildNumber {
    param([string]$Url)
    try {
        $api = ($Url.TrimEnd("/") + "/api/site-build")
        $resp = Invoke-RestMethod -Uri $api -Method Get -TimeoutSec 15
        if ($null -eq $resp.buildNumber) { return $null }
        return [int]$resp.buildNumber
    } catch {
        return $null
    }
}

function Wait-DeployExitViaSsh {
    param([int]$MaxMinutes = 40)
    $deadline = (Get-Date).AddMinutes($MaxMinutes)
    Write-Smart "waiting for /tmp/ta_deploy.exit (up to ${MaxMinutes}m)..."
    while ((Get-Date) -lt $deadline) {
        $probe = Invoke-Ssh -Command "if [ -f /tmp/ta_deploy.exit ]; then echo EXIT:`$(cat /tmp/ta_deploy.exit); else echo WAIT; fi"
        if ($probe.Ok -and $probe.Output -match "EXIT:(\-?\d+)") {
            $code = [int]$Matches[1]
            $tail = Invoke-Ssh -Command "tail -n 40 /tmp/ta_deploy.log 2>/dev/null || true"
            if ($tail.Output) { Write-Host $tail.Output }
            return $code
        }
        Start-Sleep -Seconds 10
    }
    throw "Timed out waiting for deploy exit on server"
}

function Ensure-GitPushed {
    if ($NoPush) {
        Write-Smart "NoPush: skip git push" -Color Yellow
        return
    }

    Set-Location $ProjectRoot
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if (-not $branch -or $branch -eq "HEAD") {
        throw "Detached HEAD — checkout a branch before deploy-smart"
    }

    git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Smart "no upstream for $branch — push -u origin $branch"
        if ($DryRun) { return }
        git push -u origin $branch
        if ($LASTEXITCODE -ne 0) { throw "git push failed" }
        return
    }

    git fetch origin 2>$null | Out-Null
    $ahead = [int](git rev-list --count "@{u}..HEAD").Trim()
    if ($ahead -gt 0) {
        Write-Smart "pushing $ahead commit(s) on $branch → origin"
        if ($DryRun) { return }
        git push origin $branch
        if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    } else {
        Write-Smart "git: already pushed ($branch)" -Color Green
    }
}

function Choose-Channel {
    param([bool]$SshOk, [bool]$ServerHasGit, [bool]$GhOk)

    if ($Channel -ne "auto") { return $Channel }

    if ($SshOk -and $ServerHasGit) { return "ssh-git" }
    if ($SshOk) { return "ssh-tar" }
    if ($GhOk) { return "actions" }
    return "webhook-push"
}

# --- main ---
Set-Location $ProjectRoot
Initialize-TaDeployTransport | Out-Null
Write-Smart "project: $ProjectRoot"
Write-Smart "remote:  $Remote"
Write-TaDeployConfigStatus -Prefix "[deploy-smart]"

Ensure-GitPushed

Write-Smart "probing SSH..."
$sshOk = Test-TaDeploySshEcho -Remote $Remote -SshKey $SshKey -ConnectTimeout 15
$serverHasGit = $false
if ($sshOk) {
    Write-Smart "SSH: OK" -Color Green
    $gitProbe = Invoke-Ssh -Command "test -d '$ServerAppDir/.git' && echo GIT_OK || echo GIT_MISSING"
    $serverHasGit = $gitProbe.Ok -and ($gitProbe.Output -match "GIT_OK")
    Write-Smart ("server git: " + ($(if ($serverHasGit) { "yes" } else { "no" })))
} else {
    Write-Smart "SSH: unavailable (RKN/proxy/key?)" -Color Yellow
}

$ghOk = Test-GhAvailable
Write-Smart ("gh CLI: " + ($(if ($ghOk) { "authenticated" } else { "missing/unauthenticated" })))

$buildBefore = Get-SiteBuildNumber -Url $SiteUrl
if ($null -ne $buildBefore) {
    Write-Smart "site build before: #$buildBefore"
}

$chosen = Choose-Channel -SshOk $sshOk -ServerHasGit $serverHasGit -GhOk $ghOk
Write-Smart "chosen channel: $chosen" -Color Magenta

if ($DryRun) {
    Write-Smart "DryRun: stop before execute" -Color Yellow
    exit 0
}

# Default: force rebuild (user/agent explicitly asked to deploy). -NoForce keeps skip-if-same-commit.
$forceRebuild = -not $NoForce
if ($Force) { $forceRebuild = $true }
$forceFlag = if ($forceRebuild) { "1" } else { "0" }
Write-Smart "force rebuild: $forceRebuild"

switch ($chosen) {
    "ssh-git" {
        $cmd = @"
set -euo pipefail
cd '$ServerAppDir'
export GIT_DEPLOY_TRIGGER=cli
export GIT_DEPLOY_FORCE=$forceFlag
export APP_DIR='$ServerAppDir'
sed -i 's/\r`$//' scripts/*.sh 2>/dev/null || true
bash scripts/server-deploy-git-bg.sh '$ServerAppDir' /tmp/ta_deploy.log
"@
        $start = Invoke-Ssh -Command $cmd -ConnectTimeout 30
        if (-not $start.Ok -and $start.Code -ne 2) {
            throw "Failed to start ssh-git deploy (exit $($start.Code)): $($start.Output)"
        }
        if ($start.Code -eq 2 -or $start.Output -match "already running") {
            Write-Smart "deploy already running — waiting..." -Color Yellow
        } else {
            Write-Smart "ssh-git deploy started" -Color Green
        }
        $code = Wait-DeployExitViaSsh
        if ($code -ne 0) { throw "ssh-git deploy failed (exit $code)" }
        Write-Smart "ssh-git deploy OK" -Color Green
    }

    "ssh-tar" {
        Write-Smart "falling back to classic tar/scp deploy.ps1"
        & (Join-Path $PSScriptRoot "deploy.ps1") -Remote $Remote -SshKey $SshKey -ServerAppDir $ServerAppDir
        if ($LASTEXITCODE -ne 0) { throw "deploy.ps1 failed (exit $LASTEXITCODE)" }
    }

    "actions" {
        Write-Smart "starting GitHub Actions workflow $Workflow ..."
        $forceInput = if ($forceRebuild) { "true" } else { "false" }
        & gh workflow run $Workflow -f "force=$forceInput"
        if ($LASTEXITCODE -ne 0) { throw "gh workflow run failed" }
        Start-Sleep -Seconds 4
        $runUrl = & gh run list --workflow $Workflow --limit 1 --json databaseId,url --jq ".[0].url"
        $runId = & gh run list --workflow $Workflow --limit 1 --json databaseId --jq ".[0].databaseId"
        if ($runId) {
            Write-Smart "watching run $runId ..."
            & gh run watch $runId --exit-status
            if ($LASTEXITCODE -ne 0) { throw "GitHub Actions deploy failed" }
            Write-Smart "Actions deploy OK ($runUrl)" -Color Green
        } else {
            Write-Smart "workflow started; could not resolve run id — check Actions UI" -Color Yellow
        }
    }

    "webhook-push" {
        Write-Smart "no SSH/gh — relying on GitHub webhook after push" -Color Yellow
        Write-Smart "if webhook is configured, server should pull+build soon"
        Write-Smart "fallback: open /admin → «Задеплоить main» or fix Actions secrets"
        $deadline = (Get-Date).AddMinutes(15)
        $sawChange = $false
        while ((Get-Date) -lt $deadline) {
            $now = Get-SiteBuildNumber -Url $SiteUrl
            if ($null -ne $buildBefore -and $null -ne $now -and $now -gt $buildBefore) {
                Write-Smart "site build advanced: #$buildBefore → #$now (webhook likely OK)" -Color Green
                $sawChange = $true
                break
            }
            Start-Sleep -Seconds 20
        }
        if (-not $sawChange) {
            throw "Webhook/build not confirmed. Configure Actions secrets or use /admin deploy button."
        }
    }
}

$buildAfter = Get-SiteBuildNumber -Url $SiteUrl
if ($null -ne $buildAfter) {
    Write-Smart "site build after: #$buildAfter" -Color Green
}

Write-Smart "done via channel=$chosen" -Color Green
