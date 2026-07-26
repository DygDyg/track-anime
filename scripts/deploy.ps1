# Полный деплой Track Anime: tar -> scp -> server-deploy.sh
# Сборка выполняется на сервере (без WSL).
#
# Использование:
#   .\scripts\deploy.ps1
#   .\scripts\deploy.ps1 -DryRun
#   .\scripts\deploy.ps1 -ForceTrayRebuild
#   .\scripts\deploy.ps1 -Remote "root@1.2.3.4"
#   .\scripts\deploy.ps1 -SkipBuild
#   .\scripts\deploy.ps1 -ApkPath "android\app\build\outputs\apk\release\app-release.apk"
#
# См. docs/DEPLOY.md

param(
    [string]$Remote = "root@195.26.230.35",
    [string]$SshKey = "$env:USERPROFILE\.ssh\id_rsa",
    [string]$ServerAppDir = "/var/www/ta_new",
    [int]$UploadChunkSizeMB = 48,
    [string]$ApkPath = "",
    [switch]$DryRun,
    [switch]$ForceTrayRebuild,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DeployTempDir = Join-Path $ProjectRoot "temp\deploy"
$TarPath = Join-Path $DeployTempDir ("ta_deploy_{0:yyyyMMddHHmmss}.tar.gz" -f (Get-Date))
$ProgressIdPack = 1
$ProgressIdUpload = 2
$ProgressIdServer = 3

function Write-Step {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Cyan
    )
    Write-Host "[deploy] $Message" -ForegroundColor $Color
}

function Assert-LastExit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit $LASTEXITCODE)"
    }
}

function Write-DeployProgress {
    param(
        [int]$Id,
        [string]$Activity,
        [string]$Status,
        [int]$PercentComplete = -1
    )
    if ($PercentComplete -ge 0) {
        Write-Progress -Id $Id -Activity $Activity -Status $Status -PercentComplete $PercentComplete
    } else {
        Write-Progress -Id $Id -Activity $Activity -Status $Status -PercentComplete 0
    }
}

function Complete-DeployProgress {
    param([int[]]$Ids)
    foreach ($id in $Ids) {
        Write-Progress -Id $id -Activity " " -Completed
    }
}

function Format-Megabytes {
    param([long]$Bytes)
    return [math]::Round($Bytes / 1MB, 1)
}

function Publish-AndroidApk {
    param([string]$SourcePath)

    if (-not $SourcePath) {
        Write-Step "Android APK: not specified, skip"
        return
    }

    $resolvedSource = Resolve-Path -LiteralPath $SourcePath -ErrorAction SilentlyContinue
    if (-not $resolvedSource -or -not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
        throw "Android APK not found: $SourcePath"
    }

    $downloadsDir = Join-Path $ProjectRoot "public\downloads"
    $targetPath = Join-Path $downloadsDir "TrackAnime.apk"
    $manifestPath = Join-Path $downloadsDir "TrackAnime.json"
    New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null
    Copy-Item -LiteralPath $resolvedSource.Path -Destination $targetPath -Force
    $sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    $aaptCandidates = Get-ChildItem -Path (Join-Path $sdkRoot "build-tools") -Filter "aapt.exe" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending
    if (-not $aaptCandidates) {
        throw "Android Build Tools (aapt.exe) not found under $sdkRoot. Install Android SDK Build-Tools before deployment."
    }
    $badging = & $aaptCandidates[0].FullName dump badging $targetPath
    $packageLine = $badging | Where-Object { $_ -like "package:*" } | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -or -not $packageLine -or $packageLine -notmatch "versionCode='(?<code>\d+)'\s+versionName='(?<name>[^']*)'") {
        throw "Could not read versionCode/versionName from Android APK: $targetPath"
    }
    $versionCode = [int64]$Matches["code"]
    $versionName = $Matches["name"]
    $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash.ToLowerInvariant()
    [ordered]@{
        versionCode = $versionCode
        versionName = $versionName
        apkUrl = "/downloads/TrackAnime.apk"
        sha256 = $sha256
    } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
    $apkSizeMb = Format-Megabytes (Get-Item -LiteralPath $targetPath).Length
    Write-Step "Android APK: published $targetPath ($apkSizeMb MB), manifest $manifestPath (v$versionName, code $versionCode)"
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

function Invoke-SshQuiet {
    param(
        [string]$Key,
        [string]$RemoteHost,
        [string]$Command
    )

    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        $output = & ssh @(Get-SshBaseOptions -Key $Key) $RemoteHost $Command 2>$null
        return @{
            ExitCode = $LASTEXITCODE
            Output   = $output
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Invoke-SshWithRetry {
    param(
        [string]$Key,
        [string]$RemoteHost,
        [string]$Command,
        [int]$MaxAttempts = 5,
        [string]$Step = "SSH"
    )

    $lastExit = 255
    $lastOutput = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $result = Invoke-SshQuiet -Key $Key -RemoteHost $RemoteHost -Command $Command
        $lastExit = $result.ExitCode
        $lastOutput = $result.Output
        if ($lastExit -eq 0) {
            return $result
        }
        if ($attempt -lt $MaxAttempts) {
            $waitSec = [math]::Min(8, $attempt * 2)
            Write-Step "$Step failed (exit $lastExit), retry $attempt/$MaxAttempts in ${waitSec}s..." -Color Yellow
            Start-Sleep -Seconds $waitSec
        }
    }

    throw "$Step failed after $MaxAttempts attempts (exit $lastExit)"
}

function Invoke-ScpWithRetry {
    param(
        [string]$Key,
        [string]$ArchivePath,
        [string]$Target,
        [int]$MaxAttempts = 5,
        [string]$Step = "scp upload"
    )

    $scpOpts = @(
        "-i", $Key,
        "-o", "ConnectTimeout=30",
        "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=8"
    )

    $lastExit = 255
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        try {
            & scp @scpOpts $ArchivePath $Target 2>$null
            $lastExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevEap
        }
        if ($lastExit -eq 0) {
            return
        }
        if ($attempt -lt $MaxAttempts) {
            $waitSec = [math]::Min(10, $attempt * 3)
            Write-Step "$Step failed (exit $lastExit), retry $attempt/$MaxAttempts in ${waitSec}s..." -Color Yellow
            Start-Sleep -Seconds $waitSec
        }
    }

    throw "$Step failed after $MaxAttempts attempts (exit $lastExit)"
}

function Split-FileIntoChunks {
    param(
        [string]$InputPath,
        [string]$ChunkDir,
        [long]$ChunkSizeBytes
    )

    if (Test-Path $ChunkDir) {
        Remove-Item $ChunkDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $ChunkDir | Out-Null

    $bufferSize = 1MB
    $buffer = New-Object byte[] $bufferSize
    $inputStream = [System.IO.File]::OpenRead($InputPath)
    $chunks = New-Object System.Collections.Generic.List[string]

    try {
        $part = 0
        while ($inputStream.Position -lt $inputStream.Length) {
            $chunkPath = Join-Path $ChunkDir ("part_{0:D4}" -f $part)
            $outputStream = [System.IO.File]::Create($chunkPath)
            try {
                $remaining = $ChunkSizeBytes
                while ($remaining -gt 0 -and $inputStream.Position -lt $inputStream.Length) {
                    $toRead = [int][math]::Min($buffer.Length, $remaining)
                    $read = $inputStream.Read($buffer, 0, $toRead)
                    if ($read -le 0) {
                        break
                    }
                    $outputStream.Write($buffer, 0, $read)
                    $remaining -= $read
                }
            } finally {
                $outputStream.Dispose()
            }

            $chunks.Add($chunkPath)
            $part += 1
        }
    } finally {
        $inputStream.Dispose()
    }

    return $chunks.ToArray()
}

function Test-DeployExcludedFile {
    param([string]$Name)
    return (
        $Name -eq ".env" -or
        $Name -eq ".build-number" -or
        $Name -eq ".workspace.json" -or
        $Name -eq "Desktop.ini" -or
        $Name -eq "tsconfig.tsbuildinfo" -or
        $Name -like "*.tar.gz" -or
        $Name -like "*~ov.ico" -or
        $Name -like "*.mp4" -or
        $Name -like "*.db"
    )
}

function Get-DeploySourceBytes {
    param([string]$Root)

    $excludedTop = [System.Collections.Generic.HashSet[string]]::new(
        [string[]]@("node_modules", ".next", ".git", "tmp", "temp", ".cursor", ".kilo", ".roo", ".idea"),
        [StringComparer]::OrdinalIgnoreCase
    )
    $total = [int64]0
    $stack = [System.Collections.Stack]::new()
    $stack.Push($Root)

    while ($stack.Count -gt 0) {
        $dir = [string]$stack.Pop()
        try {
            foreach ($item in Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop) {
                if ($item.PSIsContainer) {
                    if ($excludedTop.Contains($item.Name)) {
                        continue
                    }
                    $stack.Push($item.FullName)
                    continue
                }
                if (Test-DeployExcludedFile -Name $item.Name) {
                    continue
                }
                $total += $item.Length
            }
        } catch {
            # skip unreadable paths
        }
    }

    return $total
}

function Invoke-PackWithProgress {
    param(
        [string]$ArchivePath,
        [string[]]$TarExcludes
    )

    Write-DeployProgress -Id $ProgressIdPack -Activity "Pack" -Status "Estimating size..." -PercentComplete 0

    $sourceBytes = Get-DeploySourceBytes -Root $ProjectRoot
    $estimatedCompressed = [math]::Max(32MB, [int64][math]::Round($sourceBytes * 0.38))
    $sourceMb = Format-Megabytes $sourceBytes
    $estimateMb = Format-Megabytes $estimatedCompressed

    Write-DeployProgress -Id $ProgressIdPack -Activity "Pack" -Status "~$estimateMb MB (from $sourceMb MB)" -PercentComplete 1

    if (Test-Path $ArchivePath) {
        Remove-Item $ArchivePath -Force
    }

    $packPs = [powershell]::Create()
    [void]$packPs.AddScript({
        param($Root, $Archive, [string[]]$Excludes)
        Set-Location $Root
        & tar -czf $Archive @Excludes .
        if ($LASTEXITCODE -ne 0) {
            throw "tar exit $LASTEXITCODE"
        }
    }).AddArgument($ProjectRoot).AddArgument($ArchivePath).AddArgument($tarExcludes)

    $packAsync = $packPs.BeginInvoke()

    while (-not $packAsync.IsCompleted) {
        $current = [int64]0
        if (Test-Path $ArchivePath) {
            $current = (Get-Item -LiteralPath $ArchivePath).Length
        }
        $pct = if ($estimatedCompressed -gt 0) {
            [math]::Min(99, [math]::Round(100 * $current / $estimatedCompressed))
        } else {
            0
        }
        $currentMb = Format-Megabytes $current
        Write-DeployProgress -Id $ProgressIdPack -Activity "Pack" -Status "$currentMb / ~$estimateMb MB" -PercentComplete $pct
        Start-Sleep -Milliseconds 350
    }

    try {
        $packPs.EndInvoke($packAsync)
        if ($packPs.HadErrors) {
            $detail = ($packPs.Streams.Error | ForEach-Object { $_.ToString() }) -join "; "
            throw "tar pack failed ($detail)"
        }
    } catch {
        Complete-DeployProgress -Ids @($ProgressIdPack)
        throw
    } finally {
        $packPs.Dispose()
    }

    $finalBytes = (Get-Item -LiteralPath $ArchivePath).Length
    $finalMb = Format-Megabytes $finalBytes
    Write-DeployProgress -Id $ProgressIdPack -Activity "Pack" -Status "$finalMb MB done" -PercentComplete 100
    Start-Sleep -Milliseconds 200
    Write-Progress -Id $ProgressIdPack -Activity "Pack" -Completed

    return $finalBytes
}

function Invoke-UploadWithProgress {
    param(
        [string]$ArchivePath,
        [string]$RemoteHost,
        [string]$Key,
        [long]$LocalBytes
    )

    $localMb = Format-Megabytes $LocalBytes
    $remotePath = "/tmp/ta_deploy.tar.gz"
    $remoteChunkDir = "/tmp/ta_deploy_parts"
    $chunkSizeBytes = [int64]([math]::Max(4, $UploadChunkSizeMB) * 1MB)
    $chunkDir = Join-Path $DeployTempDir ("ta_deploy_parts_{0:yyyyMMddHHmmss}" -f (Get-Date))

    Write-DeployProgress -Id $ProgressIdUpload -Activity "Upload" -Status "Splitting archive..." -PercentComplete 0
    $chunks = @(Split-FileIntoChunks -InputPath $ArchivePath -ChunkDir $chunkDir -ChunkSizeBytes $chunkSizeBytes)
    $chunkCount = $chunks.Count
    $chunkSizeMb = Format-Megabytes $chunkSizeBytes
    Write-Step "upload chunks: $chunkCount x ~$chunkSizeMb MB"

    try {
        Invoke-SshWithRetry `
            -Key $Key `
            -RemoteHost $RemoteHost `
            -Command "rm -rf '$remoteChunkDir' '$remotePath' && mkdir -p '$remoteChunkDir'" `
            -Step "prepare remote upload dir" | Out-Null

        $uploadedBytes = [int64]0
        for ($i = 0; $i -lt $chunkCount; $i++) {
            $chunk = $chunks[$i]
            $chunkName = Split-Path $chunk -Leaf
            $chunkBytes = (Get-Item -LiteralPath $chunk).Length
            $chunkMb = Format-Megabytes $chunkBytes
            $partLabel = "$($i + 1)/$chunkCount $chunkName"
            $target = "${RemoteHost}:${remoteChunkDir}/${chunkName}"

            Write-DeployProgress `
                -Id $ProgressIdUpload `
                -Activity "Upload" `
                -Status "$partLabel ($chunkMb MB)" `
                -PercentComplete ([math]::Min(99, [math]::Round(100 * $uploadedBytes / $LocalBytes)))

            Invoke-ScpWithRetry `
                -Key $Key `
                -ArchivePath $chunk `
                -Target $target `
                -MaxAttempts 5 `
                -Step "scp $partLabel"

            $verifyCmd = "stat -c%s '$remoteChunkDir/$chunkName'"
            $remoteChunkSize = [int64](Invoke-SshWithRetry `
                -Key $Key `
                -RemoteHost $RemoteHost `
                -Command $verifyCmd `
                -Step "verify $partLabel").Output.Trim()

            if ($remoteChunkSize -ne $chunkBytes) {
                throw "chunk size mismatch for $chunkName ($remoteChunkSize / $chunkBytes bytes)"
            }

            $uploadedBytes += $chunkBytes
            $uploadedMb = Format-Megabytes $uploadedBytes
            Write-DeployProgress `
                -Id $ProgressIdUpload `
                -Activity "Upload" `
                -Status "$uploadedMb / $localMb MB" `
                -PercentComplete ([math]::Min(99, [math]::Round(100 * $uploadedBytes / $LocalBytes)))
        }

        Write-DeployProgress -Id $ProgressIdUpload -Activity "Upload" -Status "Assembling archive on server..." -PercentComplete 99
        $assembleCmd = "cd '$remoteChunkDir' && cat part_* > '$remotePath' && stat -c%s '$remotePath'"
        $remoteSizeBytes = [int64](Invoke-SshWithRetry `
            -Key $Key `
            -RemoteHost $RemoteHost `
            -Command $assembleCmd `
            -Step "assemble remote archive").Output.Trim()

        if ($remoteSizeBytes -ne $LocalBytes) {
            throw "assembled archive size mismatch ($remoteSizeBytes / $LocalBytes bytes)"
        }

        Invoke-SshWithRetry `
            -Key $Key `
            -RemoteHost $RemoteHost `
            -Command "rm -rf '$remoteChunkDir'" `
            -Step "cleanup remote upload chunks" | Out-Null

        Write-DeployProgress -Id $ProgressIdUpload -Activity "Upload" -Status "$localMb MB uploaded" -PercentComplete 100
        Start-Sleep -Milliseconds 200
        Write-Progress -Id $ProgressIdUpload -Activity "Upload" -Completed
    } catch {
        Complete-DeployProgress -Ids @($ProgressIdUpload)
        throw
    } finally {
        Remove-Item $chunkDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Write-ServerDeployLogDelta {
    param([string]$Delta)

    if (-not $Delta) {
        return
    }

    $remaining = $Delta
    while ($remaining.Length -gt 0) {
        $nl = $remaining.IndexOf("`n")
        if ($nl -lt 0) {
            $line = $remaining
            $remaining = ""
        } else {
            $line = $remaining.Substring(0, $nl).TrimEnd("`r")
            $remaining = $remaining.Substring($nl + 1)
        }

        if ($line -match '^\[deploy:progress\]\s+(\d+)/(\d+)\s+(.+)$') {
            $step = [int]$Matches[1]
            $total = [int]$Matches[2]
            $label = $Matches[3]
            $pct = if ($total -gt 0) { [math]::Round(100 * $step / $total) } else { 0 }
            Write-DeployProgress -Id $ProgressIdServer -Activity "Server" -Status "$step/$total $label" -PercentComplete $pct
            continue
        }

        if ($line -match '^npm warn deprecated ') {
            if (-not $script:DeployNpmDeprecatedWarningsSuppressed) {
                Write-Host "[deploy] npm deprecated warnings suppressed"
                $script:DeployNpmDeprecatedWarningsSuppressed = $true
            }
            continue
        }

        if ($line.Length -gt 2000) {
            $line = $line.Substring(0, 2000) + " ... [truncated]"
        }

        Write-Host $line
    }
}

if (-not (Test-Path $SshKey)) {
    throw "SSH key not found: $SshKey"
}

Set-Location $ProjectRoot
New-Item -ItemType Directory -Path $DeployTempDir -Force | Out-Null
Write-Step "project: $ProjectRoot"
Write-Step "remote:  $Remote"
Write-Step "app dir: $ServerAppDir"
Write-Step "local temp: $DeployTempDir"

Publish-AndroidApk -SourcePath $ApkPath

Write-Step "discord tray publish..."
$distExe = Join-Path $ProjectRoot "scripts\discord-rpc-tray\dist\TrackAnimeDiscordRPC.exe"
if ($ForceTrayRebuild -or -not (Test-Path $distExe)) {
  npm run discord:tray:publish
} else {
  Write-Step "discord tray: copy existing exe (use -ForceTrayRebuild to rebuild)"
  node scripts/publish-discord-tray-exe.mjs
}
Assert-LastExit "discord tray publish"

$tarExcludes = @(
    "--exclude=node_modules",
    "--exclude=.next",
    "--exclude=.git",
    "--exclude=.env",
    "--exclude=.build-number",
    "--exclude=tmp",
    "--exclude=temp",
    "--exclude=scripts/discord-rpc-tray",
    "--exclude=.cursor",
    "--exclude=.kilo",
    "--exclude=.roo",
    "--exclude=.workspace.json",
    "--exclude=.idea",
    "--exclude=Desktop.ini",
    "--exclude=*.tar.gz",
    "--exclude=*~ov.ico",
    "--exclude=*.mp4",
    "--exclude=*.db",
    "--exclude=tsconfig.tsbuildinfo"
)

Write-Step "pack..."
$tarBytes = Invoke-PackWithProgress -ArchivePath $TarPath -TarExcludes $tarExcludes
$tarSizeMb = Format-Megabytes $tarBytes
Write-Step "archive: $TarPath ($tarSizeMb MB)"

if ($DryRun) {
    Write-Step "DryRun - upload and server steps skipped"
    exit 0
}

Write-Step "upload..."
Invoke-UploadWithProgress -ArchivePath $TarPath -RemoteHost $Remote -Key $SshKey -LocalBytes $tarBytes

function Invoke-RemoteDeploy {
    param(
        [string]$RemoteHost,
        [string]$Key,
        [string]$AppDir
    )

    $logFile = "/tmp/ta_deploy.log"
    $screenSession = "ta_deploy"
    # Скрипты bg/deploy ещё не на сервере до полного extract — вытаскиваем из свежего tar.
    $sedCrLf = 'sed -i ''s/\r$//'''
    $startCmd = "cd $AppDir && tar -xzf /tmp/ta_deploy.tar.gz ./scripts/server-deploy.sh ./scripts/server-deploy-bg.sh && $sedCrLf scripts/server-deploy.sh scripts/server-deploy-bg.sh && bash scripts/server-deploy-bg.sh '$AppDir' '$logFile'"

    Write-Step "server-deploy (screen on server)..."
    Write-DeployProgress -Id $ProgressIdServer -Activity "Server" -Status "Starting..." -PercentComplete 0

    $startResult = Invoke-SshQuiet -Key $Key -RemoteHost $RemoteHost -Command $startCmd
    if ($startResult.ExitCode -eq 0) {
        if ($startResult.Output) {
            Write-Host $startResult.Output
        }
    } elseif ($startResult.ExitCode -eq 2) {
        Write-Step "deploy already running in screen" -Color Yellow
        if ($startResult.Output) {
            Write-Host $startResult.Output
        }
    } else {
        try {
            $startResult = Invoke-SshWithRetry -Key $Key -RemoteHost $RemoteHost -Command $startCmd -Step "start background deploy"
            if ($startResult.Output) {
                Write-Host $startResult.Output
            }
        } catch {
            Write-Step "could not confirm deploy start via SSH - will poll server log" -Color Yellow
            Write-Step "deploy may still be running in screen on server" -Color Yellow
        }
    }

    Write-Step "screen: $screenSession | log: $logFile (survives SSH drop)"
    Write-Host ""

    $logOffset = 0
    $sshDropped = $false
    $pollSec = 4
    $unknownPolls = 0
    $maxUnknownPolls = 30
    $sshFailurePolls = 0
    $maxSshFailurePolls = 45

    function Complete-RemoteDeployFromLog {
        param([string]$LogText)

        $okMatch = [regex]::Match($LogText, "\[deploy-bg\] finished ok\b")
        if ($okMatch.Success) {
            Write-Step "server deploy finished ok (from log)" -Color Green
            Write-DeployProgress -Id $ProgressIdServer -Activity "Server" -Status "Done" -PercentComplete 100
            Start-Sleep -Milliseconds 200
            Write-Progress -Id $ProgressIdServer -Activity "Server" -Completed
            return $true
        }

        $errorMatch = [regex]::Match($LogText, "\[deploy-bg\] finished with error (?<code>\d+)\b")
        if ($errorMatch.Success) {
            Complete-DeployProgress -Ids @($ProgressIdServer)
            throw "server deploy failed (exit $($errorMatch.Groups["code"].Value), from log)"
        }

        return $false
    }

    while ($true) {
        try {
            $sizePoll = Invoke-SshWithRetry -Key $Key -RemoteHost $RemoteHost -Command "wc -c < '$logFile' 2>/dev/null || echo 0" -MaxAttempts 3 -Step "read deploy log size"
            $size = [int64]($sizePoll.Output.Trim())

            if ($size -gt $logOffset) {
                $deltaPoll = Invoke-SshWithRetry -Key $Key -RemoteHost $RemoteHost -Command "tail -c +$($logOffset + 1) '$logFile'" -MaxAttempts 3 -Step "read deploy log chunk"
                Write-ServerDeployLogDelta -Delta $deltaPoll.Output
                $logOffset = $size
                if (Complete-RemoteDeployFromLog -LogText ($deltaPoll.Output -join "`n")) {
                    return
                }
            }

            $statusCmd = @'
if screen -list 2>/dev/null | grep -qE '[[:space:]][0-9]+\.SESSION[[:space:]]'; then echo running; elif [ -f /tmp/ta_deploy.exit ]; then echo done:$(cat /tmp/ta_deploy.exit); else echo unknown; fi
'@.Replace('SESSION', $screenSession)
            $statusPoll = Invoke-SshWithRetry -Key $Key -RemoteHost $RemoteHost -Command $statusCmd -MaxAttempts 3 -Step "read deploy status"
            $state = $statusPoll.Output.Trim()
            $sshFailurePolls = 0

            if ($sshDropped) {
                Write-Step "SSH reconnected" -Color Green
                $sshDropped = $false
            }

            if ($state -eq "running") {
                $unknownPolls = 0
                Start-Sleep -Seconds $pollSec
                continue
            }

            if ($state -like "done:*") {
                $deployExit = [int]$state.Split(":")[1]
                if ($deployExit -ne 0) {
                    Complete-DeployProgress -Ids @($ProgressIdServer)
                    throw "server deploy failed (exit $deployExit)"
                }
                Write-DeployProgress -Id $ProgressIdServer -Activity "Server" -Status "Done" -PercentComplete 100
                Start-Sleep -Milliseconds 200
                Write-Progress -Id $ProgressIdServer -Activity "Server" -Completed
                return
            }

            $unknownPolls++
            if ($unknownPolls -ge $maxUnknownPolls) {
                Complete-DeployProgress -Ids @($ProgressIdServer)
                throw "server deploy status unknown after $($maxUnknownPolls * $pollSec)s (no screen session / exit file)"
            }
            Start-Sleep -Seconds $pollSec
        } catch {
            if ($_.Exception.Message -match "server deploy failed|server deploy status unknown") {
                throw
            }
            if (-not $sshDropped) {
                Write-Host ""
                Write-Step "SSH disconnected - deploy continues in screen on server" -Color Yellow
                Write-Step "Attach: ssh -t $RemoteHost screen -r $screenSession" -Color Yellow
                Write-Step "Tail log: ssh $RemoteHost tail -f $logFile" -Color Yellow
                $sshDropped = $true
            }
            $sshFailurePolls++
            Write-DeployProgress `
                -Id $ProgressIdServer `
                -Activity "Server" `
                -Status "Reconnecting SSH... $sshFailurePolls/$maxSshFailurePolls" `
                -PercentComplete 90
            if ($sshFailurePolls -ge $maxSshFailurePolls) {
                Complete-DeployProgress -Ids @($ProgressIdServer)
                Write-Step "SSH did not reconnect after $($maxSshFailurePolls * $pollSec)s; server deploy may still have finished." -Color Yellow
                Write-Step "Check from your local terminal: ssh $RemoteHost `"cat /tmp/ta_deploy.exit; tail -80 $logFile; screen -list`"" -Color Yellow
                Write-Step "If you are already inside SSH, run without quotes: cat /tmp/ta_deploy.exit; tail -80 $logFile; screen -list" -Color Yellow
                throw "server deploy watcher lost SSH before final status"
            }
            Start-Sleep -Seconds $pollSec
        }
    }
}

Invoke-RemoteDeploy -RemoteHost $Remote -Key $SshKey -AppDir $ServerAppDir

Remove-Item $TarPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  DEPLOY FINISHED - ALL CHECKS PASSED" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Remote:       $Remote"
Write-Host "  App dir:      $ServerAppDir"
Write-Host "  Archive:      $tarSizeMb MB uploaded"
Write-Host ""
Write-Host "  Server steps completed:" -ForegroundColor Green
Write-Host "    [OK] Code extracted and dependencies installed"
Write-Host "    [OK] Database schema synced (Prisma)"
Write-Host "    [OK] Next.js build"
Write-Host "    [OK] track-anime service restarted and active"
Write-Host "    [OK] Site responds HTTP 200"
Write-Host ""
Write-Host "  Site: https://track-anime.dygdyg.ru/" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Step "done" -Color Green
