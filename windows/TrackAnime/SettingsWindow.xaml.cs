using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace TrackAnime;

public partial class SettingsWindow : Window
{
    private readonly AppPreferences _preferences;
    private readonly LocalProperties _local;
    private readonly CoreWebView2? _webView;
    private readonly SiteThemeSnapshot _theme;
    private readonly Brush _accent;
    private readonly Brush _muted = new SolidColorBrush(Color.FromRgb(0xA3, 0xAB, 0xBD));

    public bool ProxyChanged { get; private set; }

    public SettingsWindow(
        AppPreferences preferences,
        LocalProperties local,
        CoreWebView2? webView,
        SiteThemeSnapshot? theme = null)
    {
        InitializeComponent();
        _preferences = preferences;
        _local = local;
        _webView = webView;
        _theme = theme ?? SiteThemeSnapshot.Dark;
        _accent = new SolidColorBrush(_theme.Accent);
        Resources["Accent"] = _accent;

        switch (preferences.ProxyMode)
        {
            case ProxyMode.None:
                ProxyNone.IsChecked = true;
                break;
            case ProxyMode.Manual:
                ProxyManual.IsChecked = true;
                break;
            default:
                ProxyServer.IsChecked = true;
                break;
        }

        ProxyHostBox.Text = preferences.ProxyHost;
        ProxyPortBox.Text = preferences.ProxyPort > 0 ? preferences.ProxyPort.ToString() : "";
        ProxyUserBox.Text = preferences.ProxyUsername;
        ProxyPassBox.Password = preferences.ProxyPassword;

        var saved = ProxyFallback.Resolve(preferences, local);
        if (saved.Mode == ProxyMode.Server && !string.IsNullOrEmpty(saved.Host))
        {
            ProxyServer.Content = $"Прокси из local.properties ({saved.Host}:{saved.Port})";
        }

        OsInfo.Text = $"{Environment.OSVersion} · {Environment.MachineName}";
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        AppVersionInfo.Text = version?.ToString(3) ?? "1.0.0";

        SelectNav("proxy");
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        // Settings dialog stays dark like Android shell; caption follows site accent border.
        WindowTheme.Apply(this, _theme with
        {
            Caption = Color.FromRgb(0x14, 0x18, 0x24),
            CaptionText = Color.FromRgb(0xEE, 0xF0, 0xF4),
            IsDark = true,
        });
    }

    private void Nav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string tag }) SelectNav(tag);
    }

    private void SelectNav(string tag)
    {
        ProxyPanel.Visibility = tag == "proxy" ? Visibility.Visible : Visibility.Collapsed;
        CachePanel.Visibility = tag == "cache" ? Visibility.Visible : Visibility.Collapsed;
        DevicePanel.Visibility = tag == "device" ? Visibility.Visible : Visibility.Collapsed;
        StyleNav(NavProxy, tag == "proxy");
        StyleNav(NavCache, tag == "cache");
        StyleNav(NavDevice, tag == "device");
    }

    private void StyleNav(Button button, bool selected)
    {
        button.Foreground = selected ? _accent : _muted;
        button.FontWeight = selected ? FontWeights.SemiBold : FontWeights.Normal;
        button.Background = selected
            ? new SolidColorBrush(Color.FromArgb(0x22, _theme.Accent.R, _theme.Accent.G, _theme.Accent.B))
            : Brushes.Transparent;
    }

    private async void ClearCache_Click(object sender, RoutedEventArgs e)
    {
        if (_webView is null)
        {
            CacheStatus.Text = "WebView ещё не готов.";
            return;
        }

        try
        {
            await _webView.Profile.ClearBrowsingDataAsync(
                CoreWebView2BrowsingDataKinds.DiskCache
                | CoreWebView2BrowsingDataKinds.DownloadHistory
                | CoreWebView2BrowsingDataKinds.BrowsingHistory);
            CacheStatus.Text = "Кэш очищен. Сессия сохранена.";
        }
        catch (Exception ex)
        {
            CacheStatus.Text = "Не удалось очистить кэш: " + ex.Message;
        }
    }

    private void CopyProxyLink_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(ProxyPortBox.Text.Trim(), out var port))
        {
            MessageBox.Show(this, "Укажите порт.", "Track Anime", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var link = ProxyFallback.BuildDeepLink(ProxyHostBox.Text, port, ProxyUserBox.Text, ProxyPassBox.Password);
        if (link is null)
        {
            MessageBox.Show(this, "Заполните хост и порт.", "Track Anime", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        Clipboard.SetText(link);
        MessageBox.Show(this, "Ссылка скопирована:\n" + link, "Track Anime", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        var previous = ProxyFallback.Resolve(_preferences, _local);
        ProxyMode mode;
        if (ProxyNone.IsChecked == true) mode = ProxyMode.None;
        else if (ProxyManual.IsChecked == true) mode = ProxyMode.Manual;
        else mode = ProxyMode.Server;

        var host = ProxyHostBox.Text.Trim();
        var port = 0;
        if (!string.IsNullOrWhiteSpace(ProxyPortBox.Text) && !int.TryParse(ProxyPortBox.Text.Trim(), out port))
        {
            MessageBox.Show(this, "Порт должен быть числом.", "Track Anime", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (mode == ProxyMode.Manual && (string.IsNullOrEmpty(host) || port is < 1 or > 65535))
        {
            MessageBox.Show(this, "Для ручного прокси укажите хост и порт 1–65535.", "Track Anime",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var next = new ProxySettings(mode, host, port, ProxyUserBox.Text, ProxyPassBox.Password);
        _preferences.SaveProxy(next);
        ProxyChanged = previous.Mode != next.Mode
            || !string.Equals(previous.Host, next.Host, StringComparison.OrdinalIgnoreCase)
            || previous.Port != next.Port
            || previous.Username != next.Username
            || previous.Password != next.Password;
        DialogResult = true;
        Close();
    }
}
