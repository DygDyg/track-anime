package ru.dygdyg.trackanime;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

/**
 * Network-level ad blocker for Kodik/video ads inside the app WebView.
 * Only returns empty responses for matched ad URLs — never rewrites HTML
 * (synchronous fetches inside shouldInterceptRequest can starve WebView).
 */
final class AdBlocker {
    private static final byte[] EMPTY_BODY = new byte[0];
    private static final byte[] EMPTY_VAST =
            "<VAST version=\"3.0\"></VAST>".getBytes(StandardCharsets.UTF_8);

    private static final String[] ALLOWED_HOST_SUFFIXES = {
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
    };

    private static final String[] PLAYER_HOST_SUFFIXES = {
            "kodikplayer.com",
            "kodikonline.com",
            "kodik.info",
            "kodik.biz",
            "kodik.cc",
            "kodikdb.com",
            "aniqit.com",
            "anivod.com",
    };

    private static final String[] BLOCKED_HOST_SUFFIXES = {
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
    };

    private AdBlocker() {
    }

    static WebResourceResponse intercept(WebResourceRequest request) {
        try {
            if (request == null) return null;
            Uri uri = request.getUrl();
            if (uri == null) return null;
            if (shouldBlock(uri, request)) {
                return blockedResponse(uri);
            }
        } catch (Exception ignored) {
            // Never break page loads because of the blocker.
        }
        return null;
    }

    static boolean shouldBlock(Uri uri, WebResourceRequest request) {
        if (uri == null) return false;
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return false;

        host = host.toLowerCase(Locale.US);
        String path = pathOf(uri);
        String query = queryOf(uri);
        String full = uri.toString().toLowerCase(Locale.US);
        String referer = header(request, "Referer");

        // Never block the site itself (only ad-shaped paths on CDNs below).
        if (host.equals("track-anime.dygdyg.ru") || host.endsWith(".track-anime.dygdyg.ru")) {
            return false;
        }

        if (hostMatches(host, PLAYER_HOST_SUFFIXES)) {
            return isPlayerAdResource(path, query, full);
        }

        if (hostMatches(host, ALLOWED_HOST_SUFFIXES)) {
            return isGenericVideoAdUrl(path, full);
        }

        if (hostMatches(host, BLOCKED_HOST_SUFFIXES)) {
            return true;
        }

        // RuAdList Kodik: third-party .php?id= / subid=
        if (full.contains(".php?id=") || full.contains(".php&id=") || queryHasParam(query, "subid")) {
            return true;
        }
        if (path.contains(".php") && queryHasParam(query, "id")) {
            return true;
        }

        if (host.endsWith(".in.net") && opaqueInNetPath(path)) {
            return true;
        }

        if (isGenericVideoAdUrl(path, full)) {
            return true;
        }

        if (isPlayerReferer(referer) && isSuspiciousPlayerThirdParty(path, query, full)) {
            return true;
        }

        return false;
    }

    private static WebResourceResponse blockedResponse(Uri uri) {
        String path = pathOf(uri);
        String full = uri.toString().toLowerCase(Locale.US);
        if (path.endsWith(".xml") || full.contains("vast") || full.contains("vmap") || full.contains("vpaid")) {
            return new WebResourceResponse(
                    "text/xml",
                    "utf-8",
                    new ByteArrayInputStream(EMPTY_VAST)
            );
        }
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                new ByteArrayInputStream(EMPTY_BODY)
        );
    }

    private static boolean isPlayerAdResource(String path, String query, String full) {
        if (path.contains("/assets/vendor/") && path.endsWith(".xml")) return true;
        if (path.contains("/vast") || full.contains("vast.xml") || full.contains("vast.js") || full.contains("vmap")) {
            return true;
        }
        if (queryHasParam(query, "subid") && path.contains(".php")) return true;
        if (path.contains("/advert") || path.contains("/ads/")) return true;
        return false;
    }

    private static boolean isGenericVideoAdUrl(String path, String full) {
        if (path.contains("/vast") || full.contains("vast.xml") || full.contains("vast.js")
                || full.contains("/vmap") || full.contains("vpaid")) {
            return true;
        }
        if (path.contains("/pagead/") || full.contains("googleads") || full.contains("doubleclick")) {
            return true;
        }
        if (path.contains("/advert/") || path.contains("/advertising/") || path.contains("/adfox")) {
            return true;
        }
        if (full.contains("preroll") || full.contains("midroll") || full.contains("postroll")) {
            return true;
        }
        if (full.contains("get-adfox-content") || full.contains("vh-adfox")) {
            return true;
        }
        return false;
    }

    private static boolean isSuspiciousPlayerThirdParty(String path, String query, String full) {
        if (path.endsWith(".js") || path.endsWith(".xml") || path.endsWith(".json")) return true;
        if (path.contains(".php")) return true;
        if (queryHasParam(query, "id") || queryHasParam(query, "subid") || queryHasParam(query, "uid")) {
            return true;
        }
        return full.contains("vast") || full.contains("advert") || full.contains("banner");
    }

    private static boolean opaqueInNetPath(String path) {
        String trimmed = path.startsWith("/") ? path.substring(1) : path;
        return trimmed.length() >= 25;
    }

    private static boolean isPlayerReferer(String referer) {
        if (referer == null || referer.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(referer);
            String host = uri.getHost();
            return host != null && hostMatches(host.toLowerCase(Locale.US), PLAYER_HOST_SUFFIXES);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean hostMatches(String host, String[] suffixes) {
        for (String suffix : suffixes) {
            if (host.equals(suffix) || host.endsWith("." + suffix)) {
                return true;
            }
        }
        return false;
    }

    private static boolean queryHasParam(String query, String name) {
        if (query.isEmpty()) return false;
        return query.equals(name)
                || query.startsWith(name + "=")
                || query.contains("&" + name + "=");
    }

    private static String pathOf(Uri uri) {
        String path = uri.getPath();
        return path == null ? "" : path.toLowerCase(Locale.US);
    }

    private static String queryOf(Uri uri) {
        String query = uri.getEncodedQuery();
        if (query == null) query = uri.getQuery();
        return query == null ? "" : query.toLowerCase(Locale.US);
    }

    private static String header(WebResourceRequest request, String name) {
        if (request == null) return null;
        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null || headers.isEmpty()) return null;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (name.equalsIgnoreCase(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }
}
