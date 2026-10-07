using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;

namespace TrackAnime;

/// <summary>
/// Зеркала сайта: загрузка с https://track-anime.github.io/mirrors.json (порядок = приоритет).
/// </summary>
internal static class SiteHosts
{
    public const string MirrorsJsonUrl = "https://track-anime.github.io/mirrors.json";
    public const string SessionCookieName = "ta.session";
    public const string UserAgentMarker = "TrackAnimeWindows/1";
    public static readonly TimeSpan MirrorFallbackDelay = TimeSpan.FromSeconds(12);

    /// <summary>Совпадает с FALLBACK в track-anime.github.io/mirrors.js</summary>
    public static readonly string[] FallbackHosts =
    [
        "track-anime.win",
        "track-anime.dygdyg.ru",
        "track-anime.duckdns.org",
        "ta.dygdyg.ru",
    ];

    private static readonly object Gate = new();
    private static string[] _hosts = FallbackHosts;
    private static Task? _loadTask;

    public static string PrimaryHost
    {
        get { lock (Gate) return _hosts[0]; }
    }

    public static string PrimaryUrl => "https://" + PrimaryHost + "/";

    public static string[] All
    {
        get { lock (Gate) return (string[])_hosts.Clone(); }
    }

    public static Task EnsureLoadedAsync()
    {
        lock (Gate)
        {
            _loadTask ??= LoadAsync();
            return _loadTask;
        }
    }

    private static async Task LoadAsync()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            http.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/json");
            var url = MirrorsJsonUrl + "?_=" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var json = await http.GetStringAsync(url).ConfigureAwait(false);
            var hosts = ParseHosts(json);
            if (hosts.Length > 0)
            {
                lock (Gate) _hosts = hosts;
                Debug.WriteLine("Loaded " + hosts.Length + " mirrors from github.io");
                return;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Failed to load mirrors.json, using fallback: " + ex.Message);
        }

        lock (Gate) _hosts = FallbackHosts;
    }

    internal static string[] ParseHosts(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        JsonElement list;
        if (root.ValueKind == JsonValueKind.Array)
        {
            list = root;
        }
        else if (root.ValueKind == JsonValueKind.Object
                 && root.TryGetProperty("mirrors", out var mirrors)
                 && mirrors.ValueKind == JsonValueKind.Array)
        {
            list = mirrors;
        }
        else
        {
            return [];
        }

        var hosts = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in list.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) continue;
            var host = HostFromMirror(item.GetString());
            if (host is null || !seen.Add(host)) continue;
            hosts.Add(host);
        }
        return hosts.ToArray();
    }

    internal static string? HostFromMirror(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (!trimmed.Contains("://", StringComparison.Ordinal))
            trimmed = "https://" + trimmed;
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme is not ("https" or "http")) return null;
        if (string.IsNullOrWhiteSpace(uri.Host)) return null;
        return uri.Host.ToLowerInvariant();
    }

    public static bool IsSiteHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host)) return false;
        foreach (var siteHost in All)
        {
            if (string.Equals(siteHost, host, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    public static bool IsAllowedSiteUrl(Uri? uri) =>
        uri is { Scheme: "https" } && IsSiteHost(uri.Host);

    public static bool IsInAppUrl(Uri? uri)
    {
        if (uri is not { Scheme: "https" }) return false;
        if (IsSiteHost(uri.Host)) return true;
        return string.Equals(uri.Host, "shikimori.one", StringComparison.OrdinalIgnoreCase)
            || string.Equals(uri.Host, "shikimori.io", StringComparison.OrdinalIgnoreCase)
            || string.Equals(uri.Host, "shiki.one", StringComparison.OrdinalIgnoreCase);
    }

    public static string? NextHost(string? host)
    {
        var all = All;
        for (var i = 0; i < all.Length - 1; i++)
        {
            if (string.Equals(all[i], host, StringComparison.OrdinalIgnoreCase)) return all[i + 1];
        }
        return null;
    }
}
