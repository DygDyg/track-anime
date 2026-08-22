using System.Text;

namespace TrackAnime;

/// <summary>
/// Network-level ad blocker for Kodik/video ads inside WebView2.
/// Returns empty bodies for matched URLs — never rewrites HTML.
/// </summary>
internal static class AdBlocker
{
    private static readonly byte[] EmptyBody = [];
    private static readonly byte[] EmptyVast = Encoding.UTF8.GetBytes("<VAST version=\"3.0\"></VAST>");

    private static readonly string[] AllowedHostSuffixes =
    [
        "track-anime.dygdyg.ru",
        "shikimori.one",
        "shikimori.io",
        "shiki.one",
        "kodikplayer.com",
        "kodikonline.com",
        "kodik.info",
        "kodik.biz",
        "kodik.cc",
        "kodikdb.com",
        "kodikapi.com",
        "kodik-api.com",
        "kodikres.com",
        "kodik-storage.com",
        "aniqit.com",
        "anivod.com",
        "cloudflare.com",
        "cloudflare.net",
        "cloudfront.net",
        "fastly.net",
        "akamaihd.net",
        "akamaized.net",
        "jsdelivr.net",
        "unpkg.com",
        "gstatic.com",
        "googleapis.com",
        "yastatic.net",
        "yandex.st",
        "googleusercontent.com",
    ];

    private static readonly string[] PlayerHostSuffixes =
    [
        "kodikplayer.com",
        "kodikonline.com",
        "kodik.info",
        "kodik.biz",
        "kodik.cc",
        "kodikdb.com",
        "aniqit.com",
        "anivod.com",
    ];

    private static readonly string[] BlockedHostSuffixes =
    [
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "pagead2.googlesyndication.com",
        "imasdk.googleapis.com",
        "adsystem.com",
        "adnxs.com",
        "appnexus.com",
        "advertising.com",
        "adserver.com",
        "adtech.com",
        "ad-maven.com",
        "adsterra.com",
        "bidswitch.net",
        "casalemedia.com",
        "contextweb.com",
        "criteo.com",
        "exoclick.com",
        "lijit.com",
        "moatads.com",
        "onclickads.net",
        "openx.net",
        "outbrain.com",
        "popads.net",
        "popcash.net",
        "propellerads.com",
        "pubmatic.com",
        "rubiconproject.com",
        "serving-sys.com",
        "sharethrough.com",
        "smartadserver.com",
        "sovrn.com",
        "spotx.tv",
        "spotxchange.com",
        "taboola.com",
        "teads.tv",
        "vidazoo.com",
        "yieldmo.com",
        "3lift.com",
        "indexww.com",
        "an.yandex.ru",
        "yandexadexchange.net",
        "adfox.yandex.ru",
        "ads.adfox.ru",
        "ad.mail.ru",
        "top-fwz1.mail.ru",
        "rs.mail.ru",
        "target.my.com",
        "buzzoola.com",
        "hybrid.ai",
        "otm-r.com",
        "getintent.com",
        "adriver.ru",
        "soloway.ru",
        "digitaltarget.ru",
        "recreativ.ru",
        "vidroll.ru",
        "advideo.ru",
        "mxtads.com",
        "marketgid.com",
        "mgid.com",
        "relap.io",
        "utarget.ru",
        "begun.ru",
        "directadvert.ru",
        "rotaban.ru",
        "luxup.ru",
        "redtram.com",
        "smi2.ru",
        "kodik-add.com",
        "alylab.ru",
        "segmento.ru",
        "adhigh.net",
        "admixer.net",
        "adsafeprotected.com",
        "moatpixel.com",
        "scorecardresearch.com",
        "bumlam.com",
    ];

    public static bool TryBlock(Uri uri, string? referer, out string contentType, out byte[] body)
    {
        contentType = "text/plain";
        body = EmptyBody;
        try
        {
            if (!ShouldBlock(uri, referer)) return false;
            var path = PathOf(uri);
            var full = uri.ToString().ToLowerInvariant();
            if (path.EndsWith(".xml", StringComparison.Ordinal)
                || full.Contains("vast", StringComparison.Ordinal)
                || full.Contains("vmap", StringComparison.Ordinal)
                || full.Contains("vpaid", StringComparison.Ordinal))
            {
                contentType = "text/xml";
                body = EmptyVast;
            }
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool ShouldBlock(Uri uri, string? referer)
    {
        var host = uri.Host;
        if (string.IsNullOrEmpty(host)) return false;
        host = host.ToLowerInvariant();
        var path = PathOf(uri);
        var query = QueryOf(uri);
        var full = uri.ToString().ToLowerInvariant();

        if (host is "track-anime.dygdyg.ru" || host.EndsWith(".track-anime.dygdyg.ru", StringComparison.Ordinal))
        {
            return false;
        }

        if (HostMatches(host, PlayerHostSuffixes))
        {
            return IsPlayerAdResource(path, query, full);
        }

        if (HostMatches(host, AllowedHostSuffixes))
        {
            return IsGenericVideoAdUrl(path, full);
        }

        if (HostMatches(host, BlockedHostSuffixes)) return true;

        if (full.Contains(".php?id=", StringComparison.Ordinal) || full.Contains(".php&id=", StringComparison.Ordinal)
            || QueryHasParam(query, "subid"))
        {
            return true;
        }
        if (path.Contains(".php", StringComparison.Ordinal) && QueryHasParam(query, "id")) return true;

        if (host.EndsWith(".in.net", StringComparison.Ordinal) && OpaqueInNetPath(path)) return true;

        if (IsGenericVideoAdUrl(path, full)) return true;

        if (IsPlayerReferer(referer) && IsSuspiciousPlayerThirdParty(path, query, full)) return true;

        return false;
    }

    private static bool IsPlayerAdResource(string path, string query, string full)
    {
        if (path.Contains("/assets/vendor/", StringComparison.Ordinal) && path.EndsWith(".xml", StringComparison.Ordinal))
            return true;
        if (path.Contains("/vast", StringComparison.Ordinal) || full.Contains("vast.xml", StringComparison.Ordinal)
            || full.Contains("vast.js", StringComparison.Ordinal) || full.Contains("vmap", StringComparison.Ordinal))
            return true;
        if (QueryHasParam(query, "subid") && path.Contains(".php", StringComparison.Ordinal)) return true;
        if (path.Contains("/advert", StringComparison.Ordinal) || path.Contains("/ads/", StringComparison.Ordinal))
            return true;
        return false;
    }

    private static bool IsGenericVideoAdUrl(string path, string full)
    {
        if (path.Contains("/vast", StringComparison.Ordinal) || full.Contains("vast.xml", StringComparison.Ordinal)
            || full.Contains("vast.js", StringComparison.Ordinal) || full.Contains("/vmap", StringComparison.Ordinal)
            || full.Contains("vpaid", StringComparison.Ordinal))
            return true;
        if (path.Contains("/pagead/", StringComparison.Ordinal) || full.Contains("googleads", StringComparison.Ordinal)
            || full.Contains("doubleclick", StringComparison.Ordinal))
            return true;
        if (path.Contains("/advert/", StringComparison.Ordinal) || path.Contains("/advertising/", StringComparison.Ordinal)
            || path.Contains("/adfox", StringComparison.Ordinal))
            return true;
        if (full.Contains("preroll", StringComparison.Ordinal) || full.Contains("midroll", StringComparison.Ordinal)
            || full.Contains("postroll", StringComparison.Ordinal))
            return true;
        if (full.Contains("get-adfox-content", StringComparison.Ordinal) || full.Contains("vh-adfox", StringComparison.Ordinal))
            return true;
        return false;
    }

    private static bool IsSuspiciousPlayerThirdParty(string path, string query, string full)
    {
        if (path.EndsWith(".js", StringComparison.Ordinal) || path.EndsWith(".xml", StringComparison.Ordinal)
            || path.EndsWith(".json", StringComparison.Ordinal))
            return true;
        if (path.Contains(".php", StringComparison.Ordinal)) return true;
        if (QueryHasParam(query, "id") || QueryHasParam(query, "subid") || QueryHasParam(query, "uid")) return true;
        return full.Contains("vast", StringComparison.Ordinal) || full.Contains("advert", StringComparison.Ordinal)
            || full.Contains("banner", StringComparison.Ordinal);
    }

    private static bool OpaqueInNetPath(string path)
    {
        var trimmed = path.StartsWith('/') ? path[1..] : path;
        return trimmed.Length >= 25;
    }

    private static bool IsPlayerReferer(string? referer)
    {
        if (string.IsNullOrEmpty(referer)) return false;
        try
        {
            var uri = new Uri(referer);
            return !string.IsNullOrEmpty(uri.Host)
                && HostMatches(uri.Host.ToLowerInvariant(), PlayerHostSuffixes);
        }
        catch
        {
            return false;
        }
    }

    private static bool HostMatches(string host, string[] suffixes)
    {
        foreach (var suffix in suffixes)
        {
            if (host == suffix || host.EndsWith("." + suffix, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    private static bool QueryHasParam(string query, string name) =>
        query == name || query.StartsWith(name + "=", StringComparison.Ordinal)
        || query.Contains("&" + name + "=", StringComparison.Ordinal);

    private static string PathOf(Uri uri) => (uri.AbsolutePath ?? "").ToLowerInvariant();

    private static string QueryOf(Uri uri) => (uri.Query ?? "").TrimStart('?').ToLowerInvariant();
}
