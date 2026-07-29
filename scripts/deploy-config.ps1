# Shared local deploy config loader (proxy, SSH timeouts, defaults).
# Dot-source from deploy*.ps1:
#   . (Join-Path $PSScriptRoot "deploy-config.ps1")
#
# Local file (gitignored): <repo>/deploy.local.json
# Example:              <repo>/deploy.local.example.json
#
# См. docs/DEPLOY.md

$script:TaDeployConfigCache = $null
$script:TaDeployConfigPath = $null
$script:TaDeployProxyCommand = $null
$script:TaDeployHttpProxyUrl = $null
$script:TaDeployWantedProxyUrl = $null
$script:TaDeployProxyDisabledReason = ""

function Get-TaDeployProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-TaDeployLocalConfigPath {
    return Join-Path (Get-TaDeployProjectRoot) "deploy.local.json"
}

function ConvertTo-TaDeployHashtable {
    param($InputObject)

    if ($null -eq $InputObject) {
        return @{}
    }
    if ($InputObject -is [hashtable]) {
        return $InputObject
    }

    $map = @{}
    foreach ($prop in $InputObject.PSObject.Properties) {
        $map[$prop.Name] = $prop.Value
    }
    return $map
}

function Get-TaDeployLocalConfig {
    if ($null -ne $script:TaDeployConfigCache) {
        return $script:TaDeployConfigCache
    }

    $path = Get-TaDeployLocalConfigPath
    $script:TaDeployConfigPath = $path
    if (-not (Test-Path -LiteralPath $path)) {
        $script:TaDeployConfigCache = @{}
        return $script:TaDeployConfigCache
    }

    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        if (-not $raw -or -not $raw.Trim()) {
            $script:TaDeployConfigCache = @{}
            return $script:TaDeployConfigCache
        }
        $parsed = ConvertFrom-Json -InputObject $raw
        if ($null -eq $parsed) {
            $script:TaDeployConfigCache = @{}
            return $script:TaDeployConfigCache
        }
        $script:TaDeployConfigCache = ConvertTo-TaDeployHashtable $parsed
    } catch {
        Write-Host "[deploy-config] warn: deploy.local.json unreadable ($($_.Exception.Message)); using direct SSH" -ForegroundColor Yellow
        $script:TaDeployConfigCache = @{}
    }

    return $script:TaDeployConfigCache
}

function Get-TaDeployConfigValue {
    param(
        [hashtable]$Config,
        [string[]]$Names,
        $Default = $null
    )

    foreach ($name in $Names) {
        if ($Config.ContainsKey($name) -and $null -ne $Config[$name]) {
            $text = "$($Config[$name])".Trim()
            if ($text -ne "") {
                return $Config[$name]
            }
        }
    }
    return $Default
}

function Resolve-TaDeployHttpProxyUrl {
    param([hashtable]$Config)

    $fromConfig = Get-TaDeployConfigValue -Config $Config -Names @("httpProxy", "HttpProxy", "proxy", "PROXY")
    if ($fromConfig) {
        return ([string]$fromConfig).Trim()
    }
    foreach ($envName in @("TA_DEPLOY_HTTP_PROXY", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY")) {
        $val = [Environment]::GetEnvironmentVariable($envName)
        if ($val -and $val.Trim()) {
            return $val.Trim()
        }
    }
    return ""
}

function Resolve-TaDeployProxyAuth {
    param(
        [hashtable]$Config,
        [string]$ProxyUrl
    )

    $user = [string](Get-TaDeployConfigValue -Config $Config -Names @("proxyUser", "ProxyUser", "proxyUsername") -Default "")
    $pass = [string](Get-TaDeployConfigValue -Config $Config -Names @("proxyPassword", "ProxyPassword") -Default "")

    if ($ProxyUrl -match '://([^:/@]+):([^@/]+)@') {
        if (-not $user) { $user = $Matches[1] }
        if (-not $pass) { $pass = $Matches[2] }
    }

    return @{
        User = $user
        Pass = $pass
    }
}

function Get-TaDeployProxyEndpoint {
    param([string]$ProxyUrl)

    if (-not $ProxyUrl) {
        return $null
    }

    $normalized = $ProxyUrl.Trim()
    if ($normalized -notmatch '^\w+://') {
        $normalized = "http://$normalized"
    }

    try {
        $uri = [Uri]$normalized
    } catch {
        return $null
    }

    if (-not $uri.Host) {
        return $null
    }

    $hostName = $uri.Host
    $port = $uri.Port
    if ($port -lt 0) {
        $port = if ($uri.Scheme -eq "https") { 443 } else { 80 }
    }

    return @{
        Host   = $hostName
        Port   = $port
        Scheme = $uri.Scheme
        Url    = $normalized
    }
}

function Find-TaDeployProxyHelper {
    $candidates = @()

    $cmd = Get-Command "ncat.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += @{ Kind = "ncat"; Path = $cmd.Source } }
    $cmd = Get-Command "ncat" -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += @{ Kind = "ncat"; Path = $cmd.Source } }

    $cmd = Get-Command "connect.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += @{ Kind = "connect"; Path = $cmd.Source } }

    $gitConnect = @(
        "C:\Program Files\Git\mingw64\bin\connect.exe",
        "C:\Program Files\Git\mingw32\bin\connect.exe",
        "C:\Program Files (x86)\Git\mingw64\bin\connect.exe"
    )
    foreach ($path in $gitConnect) {
        if (Test-Path -LiteralPath $path) {
            $candidates += @{ Kind = "connect"; Path = $path }
        }
    }

    $cmd = Get-Command "corkscrew.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += @{ Kind = "corkscrew"; Path = $cmd.Source } }

    if ($candidates.Count -eq 0) {
        return $null
    }
    return $candidates[0]
}

function Disable-TaDeployProxy {
    param(
        [string]$Reason = "proxy disabled",
        [string]$Prefix = "[deploy-config]"
    )

    if (-not $script:TaDeployHttpProxyUrl -and -not $script:TaDeployProxyCommand) {
        return
    }

    $script:TaDeployProxyDisabledReason = $Reason
    $script:TaDeployHttpProxyUrl = ""
    $script:TaDeployProxyCommand = ""
    Write-Host "$Prefix warn: $Reason; using direct SSH/SCP" -ForegroundColor Yellow
}

function Build-TaDeployProxyCommand {
    param(
        [hashtable]$Config,
        [string]$ProxyUrl
    )

    $custom = [string](Get-TaDeployConfigValue -Config $Config -Names @("proxyCommand", "ProxyCommand") -Default "")
    if ($custom) {
        return $custom.Trim()
    }

    if (-not $ProxyUrl) {
        return ""
    }

    $endpoint = Get-TaDeployProxyEndpoint -ProxyUrl $ProxyUrl
    if (-not $endpoint) {
        Write-Host "[deploy-config] warn: invalid httpProxy '$ProxyUrl'; using direct SSH" -ForegroundColor Yellow
        return ""
    }

    $auth = Resolve-TaDeployProxyAuth -Config $Config -ProxyUrl $ProxyUrl

    # Native CONNECT helper (HTTP Basic). PowerShell ProxyCommand hangs under Windows OpenSSH.
    . (Join-Path $PSScriptRoot "deploy-http-connect-build.ps1")
    $connectExe = Get-TaDeployHttpConnectExe
    if ($connectExe) {
        $userArg = if ($auth.User) { $auth.User } else { "-" }
        $passArg = if ($auth.Pass) { $auth.Pass } else { "-" }
        # No quotes: Windows OpenSSH ProxyCommand quoting is fragile.
        $exePosix = ($connectExe -replace '\\', '/')
        return "$exePosix $($endpoint.Host) $($endpoint.Port) $userArg $passArg %h %p"
    }

    $helper = Find-TaDeployProxyHelper
    if (-not $helper) {
        Write-Host "[deploy-config] warn: httpProxy set but no proxy helper found; using direct SSH" -ForegroundColor Yellow
        return ""
    }

    $helperPath = $helper.Path
    if ($helperPath -match '\s') {
        $helperPath = "`"$helperPath`""
    }

    switch ($helper.Kind) {
        "ncat" {
            $cmd = "$helperPath --proxy-type http --proxy $($endpoint.Host):$($endpoint.Port)"
            if ($auth.User -and $auth.User -ne "-") {
                $cmd += " --proxy-auth $($auth.User):$($auth.Pass)"
            }
            $cmd += " %h %p"
            return $cmd
        }
        "connect" {
            if ($auth.User -and $auth.User -ne "-") {
                return "$helperPath -H $($auth.User):$($auth.Pass)@$($endpoint.Host):$($endpoint.Port) %h %p"
            }
            return "$helperPath -H $($endpoint.Host):$($endpoint.Port) %h %p"
        }
        "corkscrew" {
            if ($auth.User -and $auth.User -ne "-") {
                $authFile = Join-Path $env:TEMP "ta_deploy_proxy_auth.txt"
                Set-Content -LiteralPath $authFile -Value "$($auth.User)`r`n$($auth.Pass)" -Encoding ascii
                return "$helperPath $($endpoint.Host) $($endpoint.Port) %h %p `"$authFile`""
            }
            return "$helperPath $($endpoint.Host) $($endpoint.Port) %h %p"
        }
        default {
            Write-Host "[deploy-config] warn: unsupported proxy helper '$($helper.Kind)'; using direct SSH" -ForegroundColor Yellow
            return ""
        }
    }
}

function Test-TaDeployTcpEndpoint {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMs = 2500
    )

    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if (-not $ok) {
            $client.Close()
            return $false
        }
        $client.EndConnect($async)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Test-TaDeploySshEcho {
    param(
        [string]$Remote,
        [string]$SshKey,
        [int]$ConnectTimeout = 12
    )

    if (-not $Remote -or -not $SshKey -or -not (Test-Path -LiteralPath $SshKey)) {
        return $false
    }

    $opts = @(Get-TaDeploySshOptions -Key $SshKey -ConnectTimeout $ConnectTimeout)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & ssh @opts $Remote "echo ok" 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Confirm-TaDeployProxyOrFallback {
    param(
        [string]$Remote = "",
        [string]$SshKey = "",
        [string]$Prefix = "[deploy-config]"
    )

    if (-not $script:TaDeployProxyCommand -and -not $script:TaDeployWantedProxyUrl) {
        return
    }

    if (-not $script:TaDeployProxyCommand) {
        # Wanted proxy but could not build command (already warned).
        $script:TaDeployHttpProxyUrl = ""
        return
    }

    $endpoint = Get-TaDeployProxyEndpoint -ProxyUrl $script:TaDeployWantedProxyUrl
    if ($endpoint -and -not (Test-TaDeployTcpEndpoint -HostName $endpoint.Host -Port $endpoint.Port)) {
        Disable-TaDeployProxy -Reason "proxy $($endpoint.Host):$($endpoint.Port) is unreachable" -Prefix $Prefix
        return
    }

    if ($Remote -and $SshKey) {
        if (-not (Test-TaDeploySshEcho -Remote $Remote -SshKey $SshKey -ConnectTimeout 12)) {
            Disable-TaDeployProxy -Reason "SSH via proxy failed" -Prefix $Prefix
            # Direct path smoke-check (best-effort; do not fail deploy init here).
            if (Test-TaDeploySshEcho -Remote $Remote -SshKey $SshKey -ConnectTimeout 12) {
                Write-Host "$Prefix ok: direct SSH works without proxy" -ForegroundColor Green
            } else {
                Write-Host "$Prefix warn: direct SSH probe also failed; deploy will still retry" -ForegroundColor Yellow
            }
        }
    }
}

function Initialize-TaDeployTransport {
    param([hashtable]$Config = $null)

    if ($null -eq $Config) {
        $Config = Get-TaDeployLocalConfig
    }

    $script:TaDeployProxyDisabledReason = ""
    $proxyUrl = Resolve-TaDeployHttpProxyUrl -Config $Config
    $script:TaDeployWantedProxyUrl = $proxyUrl
    $script:TaDeployHttpProxyUrl = $proxyUrl
    $script:TaDeployProxyCommand = Build-TaDeployProxyCommand -Config $Config -ProxyUrl $proxyUrl

    if ($proxyUrl -and -not $script:TaDeployProxyCommand) {
        # Builder already warned; ensure curl/ssh do not keep a dead proxy URL.
        $script:TaDeployHttpProxyUrl = ""
        $script:TaDeployProxyDisabledReason = "proxy configured but unavailable"
    }
}

function Get-TaDeployInt {
    param(
        [hashtable]$Config,
        [string[]]$Names,
        [int]$Default
    )
    $raw = Get-TaDeployConfigValue -Config $Config -Names $Names -Default $null
    if ($null -eq $raw -or "$raw" -eq "") {
        return $Default
    }
    return [int]$raw
}

function Merge-TaDeployLocalParams {
    param(
        [Parameter(Mandatory = $true)][ref]$Remote,
        [Parameter(Mandatory = $true)][string]$DefaultRemote,
        [Parameter(Mandatory = $true)][ref]$SshKey,
        [Parameter(Mandatory = $true)][string]$DefaultSshKey,
        [Parameter(Mandatory = $true)][ref]$ServerAppDir,
        [Parameter(Mandatory = $true)][string]$DefaultServerAppDir,
        # Optional: pass ([ref]$UploadChunkSizeMB). Untyped so omitting it does not fail [ref] binding.
        $UploadChunkSizeMB = $null,
        [int]$DefaultUploadChunkSizeMB = 48
    )

    $cfg = Get-TaDeployLocalConfig
    Initialize-TaDeployTransport -Config $cfg

    $cfgRemote = Get-TaDeployConfigValue -Config $cfg -Names @("remote", "Remote")
    if ($cfgRemote -and $Remote.Value -eq $DefaultRemote) {
        $Remote.Value = [string]$cfgRemote
    }

    $cfgKey = Get-TaDeployConfigValue -Config $cfg -Names @("sshKey", "SshKey")
    if ($cfgKey -and $SshKey.Value -eq $DefaultSshKey) {
        $expanded = [Environment]::ExpandEnvironmentVariables([string]$cfgKey)
        if ($expanded.StartsWith("~")) {
            $expanded = Join-Path $env:USERPROFILE $expanded.Substring(1).TrimStart('\', '/')
        }
        $SshKey.Value = $expanded
    }

    $cfgDir = Get-TaDeployConfigValue -Config $cfg -Names @("serverAppDir", "ServerAppDir")
    if ($cfgDir -and $ServerAppDir.Value -eq $DefaultServerAppDir) {
        $ServerAppDir.Value = [string]$cfgDir
    }

    if ($null -ne $UploadChunkSizeMB) {
        if ($UploadChunkSizeMB -isnot [ref]) {
            throw "UploadChunkSizeMB must be passed as ([ref]`$var)"
        }
        $cfgChunk = Get-TaDeployConfigValue -Config $cfg -Names @("uploadChunkSizeMB", "UploadChunkSizeMB")
        if ($null -ne $cfgChunk -and $UploadChunkSizeMB.Value -eq $DefaultUploadChunkSizeMB) {
            $UploadChunkSizeMB.Value = [int]$cfgChunk
        } elseif ($script:TaDeployHttpProxyUrl -and $UploadChunkSizeMB.Value -eq $DefaultUploadChunkSizeMB) {
            # Smaller chunks through HTTP proxies tend to survive flaky links better.
            $UploadChunkSizeMB.Value = [Math]::Min($DefaultUploadChunkSizeMB, 16)
        }
    }

    Confirm-TaDeployProxyOrFallback -Remote $Remote.Value -SshKey $SshKey.Value

    return $cfg
}

function Get-TaDeploySshOptions {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [int]$ConnectTimeout = -1,
        [int]$ServerAliveInterval = -1,
        [int]$ServerAliveCountMax = -1
    )

    $cfg = Get-TaDeployLocalConfig
    if ($null -eq $script:TaDeployProxyCommand -and $null -eq $script:TaDeployHttpProxyUrl) {
        Initialize-TaDeployTransport -Config $cfg
    }

    if ($ConnectTimeout -lt 0) {
        $ConnectTimeout = Get-TaDeployInt -Config $cfg -Names @("connectTimeout", "ConnectTimeout") -Default 25
        if ($script:TaDeployHttpProxyUrl -and $ConnectTimeout -lt 40) {
            $ConnectTimeout = 40
        }
    }
    if ($ServerAliveInterval -lt 0) {
        $ServerAliveInterval = Get-TaDeployInt -Config $cfg -Names @("serverAliveInterval", "ServerAliveInterval") -Default 15
        if ($script:TaDeployHttpProxyUrl -and $ServerAliveInterval -gt 10) {
            $ServerAliveInterval = 10
        }
    }
    if ($ServerAliveCountMax -lt 0) {
        $ServerAliveCountMax = Get-TaDeployInt -Config $cfg -Names @("serverAliveCountMax", "ServerAliveCountMax") -Default 8
        if ($script:TaDeployHttpProxyUrl -and $ServerAliveCountMax -lt 12) {
            $ServerAliveCountMax = 12
        }
    }

    $opts = @(
        "-i", $Key,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=$ConnectTimeout",
        "-o", "ConnectionAttempts=1",
        "-o", "ServerAliveInterval=$ServerAliveInterval",
        "-o", "ServerAliveCountMax=$ServerAliveCountMax",
        "-o", "TCPKeepAlive=yes"
    )

    if ($script:TaDeployProxyCommand) {
        $opts += @("-o", "ProxyCommand=$($script:TaDeployProxyCommand)")
    }

    return $opts
}

function Get-TaDeployScpOptions {
    param(
        [Parameter(Mandatory = $true)][string]$Key
    )

    # scp shares -o with ssh; reuse the same transport options.
    return (Get-TaDeploySshOptions -Key $Key)
}

function Get-TaDeployRetryAttempts {
    param(
        [string]$Kind = "ssh",
        [int]$Default = 5
    )

    $cfg = Get-TaDeployLocalConfig
    if ($Kind -eq "scp") {
        $n = Get-TaDeployInt -Config $cfg -Names @("scpMaxAttempts", "ScpMaxAttempts") -Default -1
    } else {
        $n = Get-TaDeployInt -Config $cfg -Names @("sshMaxAttempts", "SshMaxAttempts") -Default -1
    }
    if ($n -gt 0) {
        return $n
    }
    if ($script:TaDeployHttpProxyUrl) {
        return [Math]::Max($Default, 8)
    }
    return $Default
}

function Write-TaDeployConfigStatus {
    param(
        [string]$Prefix = "[deploy-config]"
    )

    $cfg = Get-TaDeployLocalConfig
    $path = Get-TaDeployLocalConfigPath
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host "$Prefix local config: (none - copy deploy.local.example.json to deploy.local.json)" -ForegroundColor DarkGray
        return
    }

    Write-Host "$Prefix local config: $path" -ForegroundColor Cyan
    if ($script:TaDeployProxyDisabledReason) {
        Write-Host "$Prefix proxy: direct (fallback: $($script:TaDeployProxyDisabledReason))" -ForegroundColor Yellow
        return
    }
    if ($script:TaDeployHttpProxyUrl) {
        Write-Host "$Prefix httpProxy: $($script:TaDeployHttpProxyUrl)" -ForegroundColor Cyan
    } elseif ($script:TaDeployWantedProxyUrl) {
        Write-Host "$Prefix proxy: direct (configured proxy unavailable)" -ForegroundColor Yellow
    } else {
        Write-Host "$Prefix proxy: direct (httpProxy empty)" -ForegroundColor DarkGray
    }
    if ($script:TaDeployProxyCommand) {
        Write-Host "$Prefix ProxyCommand: $($script:TaDeployProxyCommand)" -ForegroundColor Cyan
    }
}

function Get-TaDeployCurlProxyArgs {
    if (-not $script:TaDeployHttpProxyUrl) {
        Initialize-TaDeployTransport
    }
    if (-not $script:TaDeployHttpProxyUrl) {
        return @()
    }

    $cfg = Get-TaDeployLocalConfig
    $auth = Resolve-TaDeployProxyAuth -Config $cfg -ProxyUrl $script:TaDeployHttpProxyUrl
    $args = @("-x", $script:TaDeployHttpProxyUrl)
    if ($auth.User) {
        $args += @("-U", "$($auth.User):$($auth.Pass)")
    }
    return $args
}

function Invoke-TaDeployCurlHttpCode {
    param([Parameter(Mandatory = $true)][string]$Url)

    $curlArgs = @("-s", "-o", "NUL", "-w", "%{http_code}")
    $curlArgs += Get-TaDeployCurlProxyArgs
    $curlArgs += $Url
    return (& curl.exe @curlArgs)
}
