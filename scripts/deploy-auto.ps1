# Авто-деплой: по git diff выбирает site / rpc / apk и заливает только нужное.
#
# Использование:
#   .\scripts\deploy-auto.ps1
#   .\scripts\deploy-auto.ps1 -BaseRef origin/main
#   .\scripts\deploy-auto.ps1 -ApkPath "android\...\app-release.apk"
#   .\scripts\deploy-auto.ps1 -DryRun
#   .\scripts\deploy-auto.ps1 -ForceSite
#
# См. docs/DEPLOY.md

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [int]$UploadChunkSizeMB = 48,
    [string]$ApkPath = "",
    [string]$BaseRef = "",
    [switch]$DryRun,
    [switch]$ForceTrayRebuild,
    [switch]$ForceSite,
    [switch]$SinceMain,
    [switch]$SkipBuild,
    [switch]$SkipPrecheck
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "deploy-config.ps1")

$DefaultRemote = "root@195.26.230.35"
$DefaultSshKey = "$env:USERPROFILE\.ssh\id_rsa"
$DefaultServerAppDir = "/var/www/ta_new"
$DefaultUploadChunkSizeMB = 48

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Merge-TaDeployLocalParams `
    -Remote ([ref]$Remote) `
    -DefaultRemote $DefaultRemote `
    -SshKey ([ref]$SshKey) `
    -DefaultSshKey $DefaultSshKey `
    -ServerAppDir ([ref]$ServerAppDir) `
    -DefaultServerAppDir $DefaultServerAppDir `
    -UploadChunkSizeMB ([ref]$UploadChunkSizeMB) `
    -DefaultUploadChunkSizeMB $DefaultUploadChunkSizeMB | Out-Null

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy-auto] $Message" -ForegroundColor $Color
}

function Normalize-RepoPath {
    param([string]$Path)
    return ($Path.Trim().Trim('"') -replace '\\', '/').TrimStart('./')
}

function Add-ChangedPath {
    param(
        [System.Collections.Generic.HashSet[string]]$Set,
        [string]$Raw
    )
    if (-not $Raw) {
        return
    }
    $path = Normalize-RepoPath $Raw
    if ($path) {
        [void]$Set.Add($path)
    }
}

function Resolve-DeployBaseRef {
    param(
        [string]$Requested,
        [switch]$SinceMain
    )

    if ($Requested) {
        return $Requested
    }

    if (-not $SinceMain) {
        # Default: only dirty working tree (staged/unstaged/untracked).
        # Use -SinceMain / -BaseRef when deploying committed branch delta.
        return ""
    }

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        foreach ($candidate in @("origin/main", "main", "origin/master", "master")) {
            & git rev-parse --verify "$candidate^{commit}" 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }

    return ""
}

function Get-ChangedRepoPaths {
    param([string]$Base)

    $files = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $porcelain = & git status --porcelain --untracked-files=all 2>$null
        if ($LASTEXITCODE -eq 0 -and $porcelain) {
            foreach ($line in @($porcelain)) {
                if (-not $line -or $line.Length -lt 4) {
                    continue
                }
                $entry = $line.Substring(3).Trim()
                if ($entry -match ' -> ') {
                    $entry = ($entry -split ' -> ', 2)[1]
                }
                Add-ChangedPath -Set $files -Raw $entry
            }
        }

        if ($Base) {
            $diffNames = & git diff --name-only "$Base...HEAD" 2>$null
            if ($LASTEXITCODE -eq 0 -and $diffNames) {
                foreach ($name in @($diffNames)) {
                    Add-ChangedPath -Set $files -Raw $name
                }
            }
            $diffWorktree = & git diff --name-only $Base 2>$null
            if ($LASTEXITCODE -eq 0 -and $diffWorktree) {
                foreach ($name in @($diffWorktree)) {
                    Add-ChangedPath -Set $files -Raw $name
                }
            }
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }

    return @($files)
}

function Test-IgnoredDeployPath {
    param([string]$Path)

    return (
        $Path -match '^\.cursor/' -or
        $Path -match '^\.memory/' -or
        $Path -match '^memory/' -or
        $Path -match '^\.next/' -or
        $Path -match '^node_modules/' -or
        $Path -match '^temp/' -or
        $Path -match '^tmp/' -or
        $Path -match '^\.git/' -or
        $Path -match '^\.idea/' -or
        $Path -match '^\.kilo/' -or
        $Path -match '^\.roo/' -or
        $Path -eq '.workspace.json' -or
        $Path -match '^docs/' -or
        $Path -match '\.md$' -or
        $Path -match '\.zip$' -or
        $Path -eq 'tsconfig.tsbuildinfo' -or
        $Path -match '^Aqua_Coder' -or
        $Path -eq 'deploy.local.json' -or
        $Path -eq 'deploy.local.example.json' -or
        $Path -match '^scripts/deploy' -or
        $Path -eq 'deploy.bat' -or
        $Path -eq 'scripts/publish-android-apk.ps1' -or
        $Path -eq 'scripts/deploy-config.ps1' -or
        $Path -eq 'scripts/deploy-precheck.ps1' -or
        $Path -eq 'scripts/deploy-fast.ps1' -or
        $Path -eq 'scripts/deploy-fast.sh' -or
        $Path -eq 'scripts/deploy-fast-build.sh'
    )
}

function Get-DeployPlan {
    param(
        [string[]]$Paths,
        [switch]$ForceSite,
        [switch]$ForceTrayRebuild
    )

    $needSite = [bool]$ForceSite
    $needRpc = [bool]$ForceTrayRebuild
    $needApk = $false
    $samples = @{
        site = New-Object System.Collections.Generic.List[string]
        rpc  = New-Object System.Collections.Generic.List[string]
        apk  = New-Object System.Collections.Generic.List[string]
    }

    foreach ($raw in $Paths) {
        $path = Normalize-RepoPath $raw
        if (-not $path -or (Test-IgnoredDeployPath -Path $path)) {
            continue
        }

        if (
            $path -match '^scripts/discord-rpc-tray/' -or
            $path -eq 'scripts/publish-discord-tray-exe.mjs' -or
            $path -eq 'public/downloads/TrackAnimeDiscordRPC.exe'
        ) {
            $needRpc = $true
            if ($samples.rpc.Count -lt 8) { $samples.rpc.Add($path) }
            continue
        }

        if (
            $path -match '^android/' -or
            $path -eq 'public/downloads/TrackAnime.apk' -or
            $path -eq 'public/downloads/TrackAnime.json'
        ) {
            $needApk = $true
            if ($samples.apk.Count -lt 8) { $samples.apk.Add($path) }
            if ($path -match '^android/') {
                continue
            }
            # published downloads alone → apk only
            if (
                $path -eq 'public/downloads/TrackAnime.apk' -or
                $path -eq 'public/downloads/TrackAnime.json'
            ) {
                continue
            }
        }

        $needSite = $true
        if ($samples.site.Count -lt 8) { $samples.site.Add($path) }
    }

    return [pscustomobject]@{
        Site    = $needSite
        Rpc     = $needRpc
        Apk     = $needApk
        Samples = $samples
    }
}

function Invoke-DeployScript {
    param(
        [string]$ScriptName,
        [hashtable]$Arguments
    )

    $scriptPath = Join-Path $PSScriptRoot $ScriptName
    $splat = @{}
    $argList = @()
    foreach ($key in $Arguments.Keys) {
        $value = $Arguments[$key]
        if ($value -is [switch]) {
            $value = [bool]$value
        }
        if ($value -is [bool]) {
            if ($value) {
                $splat[$key] = $true
                $argList += "-$key"
            }
            continue
        }
        if ($null -eq $value -or ($value -is [string] -and $value -eq "")) {
            continue
        }
        $splat[$key] = $value
        $argList += "-$key"
        $argList += [string]$value
    }

    Write-Step "→ $ScriptName $($argList -join ' ')"
    & $scriptPath @splat
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "$ScriptName failed (exit $LASTEXITCODE)"
    }
}

Set-Location $ProjectRoot
Write-Step "project: $ProjectRoot"
Write-TaDeployConfigStatus -Prefix "[deploy-auto]"

$resolvedBase = Resolve-DeployBaseRef -Requested $BaseRef -SinceMain:$SinceMain
if ($resolvedBase) {
    Write-Step "change base: $resolvedBase (committed delta + dirty)"
} else {
    Write-Step "change base: dirty working tree only (use -SinceMain for vs origin/main)"
}

$changed = @(Get-ChangedRepoPaths -Base $resolvedBase)
Write-Step "changed paths: $($changed.Count)"

$plan = Get-DeployPlan -Paths $changed -ForceSite:$ForceSite -ForceTrayRebuild:$ForceTrayRebuild

if (-not $plan.Site -and -not $plan.Rpc -and -not $plan.Apk) {
    Write-Step "nothing relevant to deploy (clean tree / docs-only / ignored paths)" -Color Yellow
    Write-Step "force: npm run deploy:site | deploy:rpc | deploy:apk" -Color Yellow
    Write-Step "or: .\scripts\deploy-auto.ps1 -SinceMain   # include commits vs origin/main" -Color Yellow
    Write-Step "or: .\scripts\deploy-auto.ps1 -ForceSite" -Color Yellow
    exit 0
}

$targets = @()
if ($plan.Rpc) { $targets += "rpc" }
if ($plan.Apk) { $targets += "apk" }
if ($plan.Site) { $targets += "site" }
Write-Step "plan: $($targets -join ' + ')" -Color Green

foreach ($name in @("rpc", "apk", "site")) {
    $list = $plan.Samples[$name]
    if ($list -and $list.Count -gt 0) {
        Write-Step ("  {0}: {1}" -f $name, ($list -join ", "))
    }
}

if ($DryRun) {
    Write-Step "DryRun - deploy steps skipped" -Color Yellow
    exit 0
}

if ($plan.Rpc) {
    Invoke-DeployScript -ScriptName "deploy-rpc.ps1" -Arguments @{
        Remote       = $Remote
        SshKey       = $SshKey
        ServerAppDir = $ServerAppDir
    }
}

if ($plan.Apk) {
    $apkArgs = @{
        Remote       = $Remote
        SshKey       = $SshKey
        ServerAppDir = $ServerAppDir
    }
    if ($ApkPath) {
        $apkArgs["ApkPath"] = $ApkPath
    }
    try {
        Invoke-DeployScript -ScriptName "deploy-apk.ps1" -Arguments $apkArgs
    } catch {
        if ($plan.Site) {
            Write-Step "APK deploy failed; continuing with site. $($_.Exception.Message)" -Color Yellow
        } else {
            throw
        }
    }
}

if ($plan.Site) {
    if (-not $SkipPrecheck) {
        $precheckArgs = @{
            Remote           = $Remote
            SshKey           = $SshKey
            ServerAppDir     = $ServerAppDir
            SkipBuild        = $SkipBuild
            ForceTrayRebuild = $false
        }
        Invoke-DeployScript -ScriptName "deploy-precheck.ps1" -Arguments $precheckArgs
    }

    # Large downloads go through deploy-rpc / deploy-apk; keep existing server copies.
    $siteArgs = @{
        Remote            = $Remote
        SshKey            = $SshKey
        ServerAppDir      = $ServerAppDir
        UploadChunkSizeMB = $UploadChunkSizeMB
        SkipBuild         = $SkipBuild
        SkipTrayPublish   = $true
        ExcludeRpcExe     = $true
        ExcludeApk        = $true
    }
    Invoke-DeployScript -ScriptName "deploy.ps1" -Arguments $siteArgs
}

Write-Step "done ($($targets -join ' + '))" -Color Green
