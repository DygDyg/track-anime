package ru.dygdyg.trackanime;

import android.net.Uri;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Список зеркал с https://track-anime.github.io/mirrors.json (порядок = приоритет).
 * При ошибке сети — {@link #FALLBACK_HOSTS}.
 */
final class MirrorCatalog {
    private static final String LOG_TAG = "TrackAnimeMirrors";
    static final String MIRRORS_JSON_URL = "https://track-anime.github.io/mirrors.json";

    /** Совпадает с FALLBACK в track-anime.github.io/mirrors.js */
    static final String[] FALLBACK_HOSTS = {
            "track-anime.win",
            "www.track-anime.win",
            "mirror.track-anime.win",
            "track-anime.dygdyg.ru",
            "track-anime.duckdns.org",
            "ta.dygdyg.ru",
    };

    interface Callback {
        void onReady(String[] hosts);
    }

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private MirrorCatalog() {}

    static void fetchAsync(Callback callback) {
        EXECUTOR.execute(() -> {
            String[] hosts = fetchHosts();
            callback.onReady(hosts);
        });
    }

    static String[] fetchHosts() {
        try {
            URL url = new URL(MIRRORS_JSON_URL + "?_=" + System.currentTimeMillis());
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8_000);
            conn.setReadTimeout(8_000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IllegalStateException("HTTP " + code);
            }
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            String[] parsed = parseHosts(body.toString());
            if (parsed.length > 0) {
                Log.i(LOG_TAG, "Loaded " + parsed.length + " mirrors from github.io");
                return parsed;
            }
        } catch (Exception e) {
            Log.w(LOG_TAG, "Failed to load mirrors.json, using fallback", e);
        }
        return FALLBACK_HOSTS.clone();
    }

    static String[] parseHosts(String json) throws Exception {
        String trimmed = json.trim();
        JSONArray list;
        if (trimmed.startsWith("[")) {
            list = new JSONArray(trimmed);
        } else {
            JSONObject obj = new JSONObject(trimmed);
            list = obj.optJSONArray("mirrors");
            if (list == null) return new String[0];
        }
        LinkedHashSet<String> hosts = new LinkedHashSet<>();
        for (int i = 0; i < list.length(); i++) {
            String host = hostFromMirror(list.optString(i, null));
            if (host != null) hosts.add(host);
        }
        return hosts.toArray(new String[0]);
    }

    static String hostFromMirror(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return null;
        try {
            Uri uri = Uri.parse(trimmed.contains("://") ? trimmed : "https://" + trimmed);
            String scheme = uri.getScheme();
            if (scheme == null) return null;
            String lower = scheme.toLowerCase(Locale.US);
            if (!"https".equals(lower) && !"http".equals(lower)) return null;
            String host = uri.getHost();
            if (host == null || host.isEmpty()) return null;
            return host.toLowerCase(Locale.US);
        } catch (Exception e) {
            return null;
        }
    }

    static String primaryUrl(String[] hosts) {
        String host = hosts != null && hosts.length > 0 ? hosts[0] : FALLBACK_HOSTS[0];
        return "https://" + host + "/";
    }
}
