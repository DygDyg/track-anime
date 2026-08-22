using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace TrackAnime;

public partial class MainWindow : Window
{
    private readonly AppPreferences _preferences = new();
    private readonly LocalProperties _localProperties = LocalProperties.Load();
    private readonly KeepAwakeService _keepAwake = new();
    private readonly UpdateManager _updateManager = new();
    private readonly DispatcherTimer _mirrorTimer = new();
    private readonly string _userDataFolder;
    private readonly Grid _rootGrid;

    private WebView2 _webView = null!;
    private string? _currentHost;
    private bool _currentLoadStarted;
    private bool _proxyFallbackAttempted;
    private bool _proxyEnabled;
    private ProxySettings? _enabledProxy;
    private bool _keepScreenForPlayback;
    private double? _brightnessOverride;
    private string? _pendingLaunchUrl;
    private CoreWebView2Environment? _environment;
    private bool _webViewReady;
    private SiteThemeSnapshot _siteTheme = SiteThemeSnapshot.Dark;
    private bool _themeWatcherInstalled;

    public MainWindow()
    {
        InitializeComponent();
        _rootGrid = (Grid)Content;
        _webView = WebView;

        _userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TrackAnime",
            "WebView2");
        Directory.CreateDirectory(_userDataFolder);

        _mirrorTimer.Interval = SiteHosts.MirrorFallbackDelay;
        _mirrorTimer.Tick += (_, _) => LoadNextMirrorIfNeeded();

        SourceInitialized += (_, _) => WindowTheme.Apply(this, _siteTheme);
        Loaded += async (_, _) => await InitializeAsync();
        Activated += async (_, _) =>
        {
            try
            {
                if (_webViewReady && _webView.CoreWebView2?.Source is { } source)
                {
                    await _updateManager.CheckForUpdateAsync(new Uri(source), this);
                    await SyncSiteThemeAsync();
                }
            }
            catch
            {
                // Ignore update failures.
            }
        };
        Closed += (_, _) =>
        {
            _mirrorTimer.Stop();
            _keepAwake.Dispose();
            _updateManager.Dispose();
            DetachWebViewHandlers();
        };
        PreviewKeyDown += OnPreviewKeyDown;
    }

    public void HandleExternalUri(Uri uri)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(() => HandleExternalUri(uri));
            return;
        }

        if (!_webViewReady || _webView.CoreWebView2 is null)
        {
            _pendingLaunchUrl = uri.ToString();
            return;
        }

        HandleLaunchUri(uri);
    }

    private async Task InitializeAsync()
    {
        try
        {
            ShowBootstrapStatus("Поиск рабочего зеркала…");
            await EnsureWebViewAsync(proxyEnabled: false);
            var launch = _pendingLaunchUrl;
            _pendingLaunchUrl = null;
            if (!string.IsNullOrEmpty(launch) && Uri.TryCreate(launch, UriKind.Absolute, out var launchUri))
            {
                HandleLaunchUri(launchUri);
            }
            else
            {
                await LoadSiteAsync(SiteHosts.PrimaryUrl);
            }
        }
        catch (Exception ex)
        {
            ShowBootstrapStatus("Не удалось запустить WebView2.\nУстановите Microsoft Edge WebView2 Runtime.\n\n" + ex.Message);
        }
    }

    private async Task EnsureWebViewAsync(bool proxyEnabled)
    {
        ProxySettings? proxy = null;
        string? browserArgs = null;
        if (proxyEnabled)
        {
            proxy = ProxyFallback.Resolve(_preferences, _localProperties);
            browserArgs = ProxyFallback.BuildBrowserArguments(proxy);
            if (browserArgs is null) proxyEnabled = false;
        }

        // WebView2 environment is immutable after first Ensure; recreate the control for proxy changes.
        DetachWebViewHandlers();
        if (_webViewReady)
        {
            _rootGrid.Children.Remove(_webView);
            _webView.Dispose();
            _webView = new WebView2 { DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 12, 14, 20) };
            Panel.SetZIndex(_webView, 0);
            _rootGrid.Children.Insert(0, _webView);
            _webViewReady = false;
            _themeWatcherInstalled = false;
        }

        var options = new CoreWebView2EnvironmentOptions();
        if (!string.IsNullOrEmpty(browserArgs))
        {
            options.AdditionalBrowserArguments = browserArgs;
        }

        _environment = await CoreWebView2Environment.CreateAsync(null, _userDataFolder, options);
        await _webView.EnsureCoreWebView2Async(_environment);

        var core = _webView.CoreWebView2;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = true;
        core.Settings.IsPasswordAutosaveEnabled = true;
        core.Settings.IsGeneralAutofillEnabled = true;

        var ua = core.Settings.UserAgent;
        if (!ua.Contains(SiteHosts.UserAgentMarker, StringComparison.Ordinal))
        {
            core.Settings.UserAgent = ua + " " + SiteHosts.UserAgentMarker;
        }

        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.NavigationStarting += OnNavigationStarting;
        core.NavigationCompleted += OnNavigationCompleted;
        core.WebResourceRequested += OnWebResourceRequested;
        core.NewWindowRequested += OnNewWindowRequested;
        core.BasicAuthenticationRequested += OnBasicAuthenticationRequested;
        core.ContainsFullScreenElementChanged += OnContainsFullScreenElementChanged;
        core.DocumentTitleChanged += OnDocumentTitleChanged;
        core.WebMessageReceived += OnWebMessageReceived;

        await core.AddScriptToExecuteOnDocumentCreatedAsync("""
            (() => {
              if (window.__taWindowsBridgeInstalled) return;
              window.__taWindowsBridgeInstalled = true;
              const post = (payload) => {
                try { chrome.webview.postMessage(JSON.stringify(payload)); } catch (_) {}
              };
              let lastBrightness = 0.85;
              const bridge = {
                setKeepScreenOn: (v) => post({ type: 'keepScreenOn', enabled: !!v }),
                setScreenBrightness: (v) => {
                  lastBrightness = Math.max(0.01, Math.min(1, Number(v) || 0.85));
                  post({ type: 'setBrightness', value: lastBrightness });
                },
                getScreenBrightness: () => lastBrightness,
                clearScreenBrightness: () => {
                  lastBrightness = 0.85;
                  post({ type: 'clearBrightness' });
                },
                hasScreenBrightnessControl: () => true,
              };
              window.TrackAnimeWindows = bridge;
              window.TrackAnimeAndroid = bridge;
            })();
            """);

        if (!_themeWatcherInstalled)
        {
            await SiteThemeReader.InstallWatcherAsync(core);
            _themeWatcherInstalled = true;
        }

        _proxyEnabled = proxyEnabled && browserArgs is not null;
        _enabledProxy = _proxyEnabled ? proxy : null;
        _webViewReady = true;
        await SyncSiteThemeAsync();
    }

    private void DetachWebViewHandlers()
    {
        if (_webView.CoreWebView2 is null) return;
        var core = _webView.CoreWebView2;
        core.NavigationStarting -= OnNavigationStarting;
        core.NavigationCompleted -= OnNavigationCompleted;
        core.WebResourceRequested -= OnWebResourceRequested;
        core.NewWindowRequested -= OnNewWindowRequested;
        core.BasicAuthenticationRequested -= OnBasicAuthenticationRequested;
        core.ContainsFullScreenElementChanged -= OnContainsFullScreenElementChanged;
        core.DocumentTitleChanged -= OnDocumentTitleChanged;
        core.WebMessageReceived -= OnWebMessageReceived;
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var json = e.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(json)) return;
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl)) return;
            var type = typeEl.GetString();
            switch (type)
            {
                case "keepScreenOn":
                    SetKeepScreenOn(root.TryGetProperty("enabled", out var en) && en.GetBoolean());
                    break;
                case "setBrightness":
                    if (root.TryGetProperty("value", out var val) && val.TryGetDouble(out var brightness))
                    {
                        SetScreenBrightness(brightness);
                    }
                    break;
                case "clearBrightness":
                    ClearScreenBrightness();
                    break;
                case "themeChanged":
                {
                    var themeName = root.TryGetProperty("theme", out var th) ? th.GetString() : "dark";
                    var accent = root.TryGetProperty("accent", out var ac) ? ac.GetString() : "blue";
                    ApplySiteTheme(SiteThemeSnapshot.FromSite(themeName, accent));
                    break;
                }
            }
        }
        catch
        {
            // Ignore malformed bridge messages.
        }
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Escape || _webView.CoreWebView2 is null) return;
        _ = _webView.CoreWebView2.ExecuteScriptAsync("""
            (function(){
              try {
                if (typeof window.__taAndroidBack === 'function' && window.__taAndroidBack()) return '1';
                var m = document.querySelector('[role="dialog"][aria-modal="true"]');
                if (m) { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return '1'; }
                if (window.history.length > 1) { history.back(); return '1'; }
                return '0';
              } catch (e) { return '0'; }
            })()
            """);
    }

    private void HandleLaunchUri(Uri uri)
    {
        if (string.Equals(uri.Scheme, "taproxy", StringComparison.OrdinalIgnoreCase))
        {
            _ = ApplyTaProxyDeepLinkAsync(uri);
            return;
        }
        if (IsAppSettingsUri(uri))
        {
            if (!SiteHosts.IsAllowedSiteUrl(TryParseUri(_webView.CoreWebView2?.Source)))
            {
                _ = LoadSiteAsync(SiteHosts.PrimaryUrl);
            }
            ShowAppSettings();
            return;
        }

        _ = LoadSiteAsync(SiteHosts.IsAllowedSiteUrl(uri) ? uri.ToString() : SiteHosts.PrimaryUrl);
    }

    private static bool IsAppSettingsUri(Uri uri) =>
        string.Equals(uri.Scheme, "trackanime", StringComparison.OrdinalIgnoreCase)
        && string.Equals(uri.Host, "settings", StringComparison.OrdinalIgnoreCase);

    private async Task ApplyTaProxyDeepLinkAsync(Uri uri)
    {
        var parsed = ProxyFallback.ParseDeepLink(uri);
        if (!parsed.IsOk || parsed.Settings is null)
        {
            MessageBox.Show(this, parsed.Error ?? "Ошибка прокси", "Track Anime", MessageBoxButton.OK, MessageBoxImage.Warning);
            if (!SiteHosts.IsAllowedSiteUrl(TryParseUri(_webView.CoreWebView2?.Source)))
            {
                await LoadSiteAsync(SiteHosts.PrimaryUrl);
            }
            return;
        }

        var next = parsed.Settings;
        _preferences.SaveProxy(next);
        _proxyFallbackAttempted = false;

        var toast = next.Mode switch
        {
            ProxyMode.None => "Прокси отключён.",
            ProxyMode.Server => "Выбран прокси сервера.",
            _ => $"Прокси сохранён: {next.Host}:{next.Port}",
        };
        ShowBootstrapStatus("Применение прокси…");
        MessageBox.Show(this, toast, "Track Anime", MessageBoxButton.OK, MessageBoxImage.Information);

        var current = _webView.CoreWebView2?.Source;
        await EnsureWebViewAsync(proxyEnabled: false);
        await LoadSiteAsync(SiteHosts.IsAllowedSiteUrl(TryParseUri(current)) ? current! : SiteHosts.PrimaryUrl);
    }

    private async Task LoadSiteAsync(string url)
    {
        if (_webView.CoreWebView2 is null) return;
        var targetHost = new Uri(url).Host;
        _currentHost = targetHost;
        _currentLoadStarted = false;
        _mirrorTimer.Stop();
        _mirrorTimer.Start();

        var status = _proxyFallbackAttempted
            ? $"Подключение через прокси к {targetHost}…"
            : $"Подключение к {targetHost}…";
        ShowBootstrapStatus(status);

        await CopySessionCookieAsync(_preferences.LastSessionHost, targetHost);
        _webView.CoreWebView2.Navigate(url);
    }

    private void LoadNextMirrorIfNeeded()
    {
        if (_currentLoadStarted) return;
        var next = SiteHosts.NextHost(_currentHost);
        if (next is not null)
        {
            Debug.WriteLine("Switching mirror to " + next);
            _ = LoadSiteAsync("https://" + next + "/");
            return;
        }
        _ = RecoverWithProxyOrShowErrorAsync("таймаут загрузки");
    }

    private async Task RecoverWithProxyOrShowErrorAsync(string reason)
    {
        var settings = ProxyFallback.Resolve(_preferences, _localProperties);
        if (!_proxyFallbackAttempted && ProxyFallback.IsConfigured(settings))
        {
            _proxyFallbackAttempted = true;
            ShowBootstrapStatus("Прямые зеркала недоступны.\nПодключение через прокси…");
            await EnsureWebViewAsync(proxyEnabled: true);
            await LoadSiteAsync(SiteHosts.PrimaryUrl);
            return;
        }

        ShowLoadErrorPage(reason);
    }

    private void ShowLoadErrorPage(string reason)
    {
        _mirrorTimer.Stop();
        var safeReason = System.Net.WebUtility.HtmlEncode(reason);
        var html =
            "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<title>Нет соединения</title><style>"
            + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
            + "background:#0C0E14;color:#EEF0F4;font-family:Segoe UI,system-ui,sans-serif}"
            + ".card{max-width:420px;padding:28px;border:1px solid #2A3142;border-radius:16px;background:#141824}"
            + "h1{margin:0 0 8px;font-size:20px}p{margin:0 0 18px;color:#A3ABBD;line-height:1.5}"
            + ".row{display:flex;gap:10px;flex-wrap:wrap}"
            + "a{border:1px solid #2A3142;background:#1A2030;color:#EEF0F4;border-radius:10px;padding:10px 14px;font:inherit;text-decoration:none}"
            + "a.primary{background:#6C8CFF;border-color:#6C8CFF;color:#fff}</style></head><body><div class=\"card\">"
            + "<h1>Нет соединения</h1>"
            + "<p>Не удалось открыть Track Anime (" + safeReason + "). Проверьте сеть или настройки прокси.</p>"
            + "<div class=\"row\"><a class=\"primary\" href=\"" + SiteHosts.PrimaryUrl + "\">Повторить</a>"
            + "<a href=\"trackanime://settings\">Настройки приложения</a></div></div></body></html>";
        HideBootstrapOverlay();
        _webView.CoreWebView2?.NavigateToString(html);
    }

    private async Task CopySessionCookieAsync(string? sourceHost, string? targetHost)
    {
        if (_webView.CoreWebView2 is null) return;
        if (!SiteHosts.IsSiteHost(sourceHost) || !SiteHosts.IsSiteHost(targetHost)
            || string.Equals(sourceHost, targetHost, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var cookies = await _webView.CoreWebView2.CookieManager.GetCookiesAsync("https://" + sourceHost + "/");
        var session = cookies.FirstOrDefault(c =>
            string.Equals(c.Name, SiteHosts.SessionCookieName, StringComparison.Ordinal));
        var cookie = _webView.CoreWebView2.CookieManager.CreateCookie(
            SiteHosts.SessionCookieName,
            session?.Value ?? "",
            targetHost!,
            "/");
        cookie.IsSecure = true;
        cookie.IsHttpOnly = true;
        cookie.SameSite = CoreWebView2CookieSameSiteKind.Lax;
        cookie.Expires = session is null || string.IsNullOrEmpty(session.Value)
            ? DateTimeOffset.UtcNow.AddDays(-1).DateTime
            : DateTimeOffset.UtcNow.AddDays(30).DateTime;
        _webView.CoreWebView2.CookieManager.AddOrUpdateCookie(cookie);
    }

    private async Task SynchronizeSessionFromCurrentHostAsync(string currentHost)
    {
        if (!SiteHosts.IsSiteHost(currentHost) || _webView.CoreWebView2 is null) return;
        _preferences.LastSessionHost = currentHost;
        foreach (var other in SiteHosts.All)
        {
            if (!string.Equals(other, currentHost, StringComparison.OrdinalIgnoreCase))
            {
                await CopySessionCookieAsync(currentHost, other);
            }
        }
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) return;

        if (IsAppSettingsUri(uri))
        {
            e.Cancel = true;
            ShowAppSettings();
            return;
        }
        if (string.Equals(uri.Scheme, "taproxy", StringComparison.OrdinalIgnoreCase))
        {
            e.Cancel = true;
            _ = ApplyTaProxyDeepLinkAsync(uri);
            return;
        }
        if (SiteHosts.IsInAppUrl(uri) || uri.Scheme is "about" or "data")
        {
            if (SiteHosts.IsAllowedSiteUrl(uri))
            {
                _currentLoadStarted = true;
            }
            return;
        }

        e.Cancel = true;
        OpenExternal(uri);
    }

    private async void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _mirrorTimer.Stop();

        var source = _webView.CoreWebView2?.Source;
        var uri = TryParseUri(source);

        if (!e.IsSuccess && uri is not null && SiteHosts.IsAllowedSiteUrl(uri))
        {
            var next = SiteHosts.NextHost(uri.Host);
            if (next is not null)
            {
                await LoadSiteAsync("https://" + next + "/");
                return;
            }
            await RecoverWithProxyOrShowErrorAsync(e.WebErrorStatus.ToString());
            return;
        }

        if (uri is not null && SiteHosts.IsAllowedSiteUrl(uri))
        {
            _currentHost = uri.Host;
            _currentLoadStarted = true;
            await SynchronizeSessionFromCurrentHostAsync(uri.Host);
            HideBootstrapOverlay();
            await SyncSiteThemeAsync();
            try
            {
                await _updateManager.CheckForUpdateAsync(uri, this);
            }
            catch
            {
                // ignore
            }
        }
        else if (source is not null && source.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            HideBootstrapOverlay();
        }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        try
        {
            var request = e.Request;
            if (!Uri.TryCreate(request.Uri, UriKind.Absolute, out var uri)) return;
            string? referer = null;
            try { referer = request.Headers.GetHeader("Referer"); } catch { /* missing */ }

            if (!AdBlocker.TryBlock(uri, referer, out var contentType, out var body)) return;
            if (_environment is null) return;

            var stream = new MemoryStream(body);
            e.Response = _environment.CreateWebResourceResponse(stream, 200, "OK",
                $"Content-Type: {contentType}\r\nContent-Length: {body.Length}");
        }
        catch
        {
            // Never break page loads because of the blocker.
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri))
        {
            if (SiteHosts.IsInAppUrl(uri))
            {
                _webView.CoreWebView2?.Navigate(uri.ToString());
            }
            else
            {
                OpenExternal(uri);
            }
        }
    }

    private void OnBasicAuthenticationRequested(object? sender, CoreWebView2BasicAuthenticationRequestedEventArgs e)
    {
        if (_enabledProxy is null || string.IsNullOrEmpty(_enabledProxy.Username)) return;
        if (!ProxyFallback.IsConfigured(_enabledProxy)) return;
        e.Response.UserName = _enabledProxy.Username;
        e.Response.Password = _enabledProxy.Password;
    }

    private void OnContainsFullScreenElementChanged(object? sender, object e)
    {
        var full = _webView.CoreWebView2?.ContainsFullScreenElement == true;
        ApplyKeepScreenOn();
        if (full)
        {
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
        }
        else
        {
            WindowStyle = WindowStyle.SingleBorderWindow;
        }
    }

    private void OnDocumentTitleChanged(object? sender, object e)
    {
        var title = _webView.CoreWebView2?.DocumentTitle;
        Title = string.IsNullOrWhiteSpace(title) ? "Track Anime" : title + " — Track Anime";
    }

    private void ShowAppSettings()
    {
        var dialog = new SettingsWindow(_preferences, _localProperties, _webView.CoreWebView2, _siteTheme)
        {
            Owner = this,
        };
        if (dialog.ShowDialog() == true && dialog.ProxyChanged)
        {
            _proxyFallbackAttempted = false;
            _ = ReloadAfterProxyChangeAsync();
        }
    }

    private async Task SyncSiteThemeAsync()
    {
        if (!_webViewReady || _webView.CoreWebView2 is null) return;
        var theme = await SiteThemeReader.ReadAsync(_webView.CoreWebView2);
        ApplySiteTheme(theme);
    }

    private void ApplySiteTheme(SiteThemeSnapshot theme)
    {
        _siteTheme = theme;
        WindowTheme.Apply(this, theme);
        Background = new System.Windows.Media.SolidColorBrush(theme.Caption);
    }

    private async Task ReloadAfterProxyChangeAsync()
    {
        ShowBootstrapStatus("Применение настроек…");
        await EnsureWebViewAsync(proxyEnabled: false);
        await LoadSiteAsync(SiteHosts.PrimaryUrl);
    }

    internal void SetKeepScreenOn(bool enabled)
    {
        Dispatcher.Invoke(() =>
        {
            _keepScreenForPlayback = enabled;
            ApplyKeepScreenOn();
        });
    }

    internal void SetScreenBrightness(double value)
    {
        Dispatcher.Invoke(() =>
        {
            var clamped = Math.Max(0.01, Math.Min(1.0, value));
            _brightnessOverride = clamped;
            BrightnessHelper.TrySet(clamped);
        });
    }

    internal double GetScreenBrightness()
    {
        if (_brightnessOverride is >= 0 and <= 1) return _brightnessOverride.Value;
        return BrightnessHelper.TryGet() ?? 0.85;
    }

    internal void ClearScreenBrightness()
    {
        Dispatcher.Invoke(() =>
        {
            _brightnessOverride = null;
            BrightnessHelper.TryClear();
        });
    }

    private void ApplyKeepScreenOn()
    {
        var full = _webView.CoreWebView2?.ContainsFullScreenElement == true;
        _keepAwake.SetEnabled(_keepScreenForPlayback || full);
    }

    private void ShowBootstrapStatus(string status)
    {
        BootstrapStatus.Text = status;
        BootstrapOverlay.Visibility = Visibility.Visible;
    }

    private void HideBootstrapOverlay()
    {
        BootstrapOverlay.Visibility = Visibility.Collapsed;
    }

    private static void OpenExternal(Uri uri)
    {
        try
        {
            Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        }
        catch
        {
            // Ignore.
        }
    }

    private static Uri? TryParseUri(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) ? uri : null;
}
