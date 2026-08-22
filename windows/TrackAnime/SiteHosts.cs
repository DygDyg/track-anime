namespace TrackAnime;

internal static class SiteHosts
{
    public const string PrimaryHost = "track-anime.dygdyg.ru";
    public const string MirrorHost = "track-anime.duckdns.org";
    public const string ThirdHost = "ta.dygdyg.ru";
    public const string PrimaryUrl = "https://" + PrimaryHost + "/";
    public const string SessionCookieName = "ta.session";
    public const string UserAgentMarker = "TrackAnimeWindows/1";
    public static readonly string[] All = [PrimaryHost, MirrorHost, ThirdHost];
    public static readonly TimeSpan MirrorFallbackDelay = TimeSpan.FromSeconds(12);

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
        for (var i = 0; i < All.Length - 1; i++)
        {
            if (string.Equals(All[i], host, StringComparison.OrdinalIgnoreCase)) return All[i + 1];
        }
        return null;
    }
}
