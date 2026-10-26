package ru.dygdyg.trackanime.player;

import android.net.Uri;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Site API calls with WebView ta.session cookie. */
public final class TaPlusApiClient {
    private final String baseUrl;

    public TaPlusApiClient(String baseUrl) {
        String normalized = baseUrl == null ? "" : baseUrl.trim();
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        this.baseUrl = normalized;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public static final class SkipInterval {
        public final String skipType;
        public final double startTime;
        public final double endTime;

        public SkipInterval(String skipType, double startTime, double endTime) {
            this.skipType = skipType;
            this.startTime = startTime;
            this.endTime = endTime;
        }
    }

    public static final class StreamResult {
        public final Map<String, String> qualities;
        public final List<SkipInterval> skips;
        public final String error;

        public StreamResult(Map<String, String> qualities, List<SkipInterval> skips, String error) {
            this.qualities = qualities;
            this.skips = skips;
            this.error = error;
        }
    }

    public static final class EpisodeItem {
        public final int seasonNumber;
        public final int episodeNumber;

        public EpisodeItem(int seasonNumber, int episodeNumber) {
            this.seasonNumber = seasonNumber;
            this.episodeNumber = episodeNumber;
        }
    }

    public static final class EpisodesResult {
        public final int seasonNumber;
        public final List<Integer> seasons;
        public final List<EpisodeItem> episodes;

        public EpisodesResult(int seasonNumber, List<Integer> seasons, List<EpisodeItem> episodes) {
            this.seasonNumber = seasonNumber;
            this.seasons = seasons;
            this.episodes = episodes;
        }
    }

    public static final class WatchProgress {
        public final String kodikId;
        public final int seasonNumber;
        public final int episodeNumber;
        public final double positionSeconds;

        public WatchProgress(String kodikId, int seasonNumber, int episodeNumber, double positionSeconds) {
            this.kodikId = kodikId;
            this.seasonNumber = seasonNumber;
            this.episodeNumber = episodeNumber;
            this.positionSeconds = positionSeconds;
        }
    }

    public StreamResult fetchTaplus(int shikimoriId, String kodikId, int season, int episode, boolean refresh)
            throws Exception {
        Uri.Builder b = Uri.parse(baseUrl + "/api/anime/" + shikimoriId + "/taplus").buildUpon()
                .appendQueryParameter("kodikId", kodikId)
                .appendQueryParameter("season", String.valueOf(season))
                .appendQueryParameter("episode", String.valueOf(episode));
        if (refresh) b.appendQueryParameter("refresh", "1");
        JSONObject json = getJson(b.build().toString());
        if (json == null) {
            return new StreamResult(Collections.emptyMap(), Collections.emptyList(), "Пустой ответ");
        }
        if (!json.optBoolean("ok", true) && json.has("error")) {
            return new StreamResult(Collections.emptyMap(), Collections.emptyList(), json.optString("error", "Ошибка"));
        }
        Map<String, String> qualities = new LinkedHashMap<>();
        JSONObject q = json.optJSONObject("qualities");
        if (q != null) {
            JSONArray names = q.names();
            if (names != null) {
                List<Integer> heights = new ArrayList<>();
                for (int i = 0; i < names.length(); i++) {
                    String key = names.optString(i);
                    try {
                        heights.add(Integer.parseInt(key));
                    } catch (NumberFormatException ignored) {
                        String url = q.optString(key, "").trim();
                        if (!url.isEmpty()) qualities.put(key, url);
                    }
                }
                Collections.sort(heights);
                for (int h : heights) {
                    String key = String.valueOf(h);
                    String url = q.optString(key, "").trim();
                    if (!url.isEmpty()) qualities.put(key, url);
                }
            }
        }
        List<SkipInterval> skips = parseSkips(json.optJSONObject("skips"));
        return new StreamResult(qualities, skips, qualities.isEmpty() ? "Нет потоков" : null);
    }

    public EpisodesResult fetchEpisodes(int shikimoriId, String kodikId, int season) throws Exception {
        Uri.Builder b = Uri.parse(baseUrl + "/api/anime/" + shikimoriId + "/episodes").buildUpon()
                .appendQueryParameter("kodikId", kodikId)
                .appendQueryParameter("season", String.valueOf(season));
        JSONObject json = getJson(b.build().toString());
        if (json == null) {
            return new EpisodesResult(season, Collections.singletonList(season), Collections.emptyList());
        }
        List<Integer> seasons = new ArrayList<>();
        JSONArray seasonsArr = json.optJSONArray("seasons");
        if (seasonsArr != null) {
            for (int i = 0; i < seasonsArr.length(); i++) {
                JSONObject s = seasonsArr.optJSONObject(i);
                if (s != null) {
                    int n = s.optInt("seasonNumber", 0);
                    if (n > 0) seasons.add(n);
                } else {
                    int n = seasonsArr.optInt(i, 0);
                    if (n > 0) seasons.add(n);
                }
            }
        }
        if (seasons.isEmpty()) seasons.add(Math.max(1, json.optInt("seasonNumber", season)));
        List<EpisodeItem> episodes = new ArrayList<>();
        JSONArray eps = json.optJSONArray("episodes");
        if (eps != null) {
            for (int i = 0; i < eps.length(); i++) {
                JSONObject e = eps.optJSONObject(i);
                if (e == null) continue;
                int sn = e.optInt("seasonNumber", season);
                int en = e.optInt("episodeNumber", 0);
                if (en > 0) episodes.add(new EpisodeItem(sn, en));
            }
        }
        return new EpisodesResult(json.optInt("seasonNumber", season), seasons, episodes);
    }

    public List<SkipInterval> fetchSkipTimes(int shikimoriId, int season, int episode, int episodeLength)
            throws Exception {
        Uri.Builder b = Uri.parse(baseUrl + "/api/anime/" + shikimoriId + "/skip-times").buildUpon()
                .appendQueryParameter("season", String.valueOf(season))
                .appendQueryParameter("episode", String.valueOf(episode))
                .appendQueryParameter("episodeLength", String.valueOf(Math.max(300, episodeLength)));
        JSONObject json = getJson(b.build().toString());
        if (json == null) return Collections.emptyList();
        List<SkipInterval> out = new ArrayList<>();
        // API shape: { skipTimes: { results: [...], found, source, ... } }
        JSONObject skipTimesObj = json.optJSONObject("skipTimes");
        JSONArray results = null;
        if (skipTimesObj != null) {
            results = skipTimesObj.optJSONArray("results");
        }
        if (results == null) results = json.optJSONArray("results");
        if (results == null) results = json.optJSONArray("skipTimes");
        if (results != null) {
            for (int i = 0; i < results.length(); i++) {
                JSONObject r = results.optJSONObject(i);
                if (r == null) continue;
                String type = r.optString("skipType", r.optString("type", "op"));
                JSONObject interval = r.optJSONObject("interval");
                double start;
                double end;
                if (interval != null) {
                    start = interval.optDouble("startTime", interval.optDouble("start_time", -1));
                    end = interval.optDouble("endTime", interval.optDouble("end_time", -1));
                } else {
                    start = r.optDouble("startTime", -1);
                    end = r.optDouble("endTime", -1);
                }
                if (start >= 0 && end > start) {
                    out.add(new SkipInterval(type, start, end));
                }
            }
        }
        return out;
    }

    public WatchProgress fetchWatchProgress(int shikimoriId) throws Exception {
        JSONObject json = getJson(baseUrl + "/api/user/watch-history/" + shikimoriId);
        if (json == null) return null;
        JSONObject p = json.optJSONObject("progress");
        if (p == null) return null;
        String kodikId = p.optString("kodikId", "").trim();
        int episode = p.optInt("episodeNumber", 0);
        if (kodikId.isEmpty() || episode <= 0) return null;
        return new WatchProgress(
                kodikId,
                Math.max(1, p.optInt("seasonNumber", 1)),
                episode,
                Math.max(0, p.optDouble("positionSeconds", 0))
        );
    }

    public void putWatchProgress(
            int shikimoriId,
            String kodikId,
            int seasonNumber,
            int episodeNumber,
            double positionSeconds
    ) throws Exception {
        JSONObject body = new JSONObject();
        body.put("kodikId", kodikId);
        body.put("seasonNumber", seasonNumber);
        body.put("episodeNumber", episodeNumber);
        body.put("positionSeconds", Math.floor(positionSeconds));
        putJson(baseUrl + "/api/user/watch-history/" + shikimoriId, body.toString());
    }

    private List<SkipInterval> parseSkips(JSONObject skips) {
        if (skips == null) return Collections.emptyList();
        List<SkipInterval> out = new ArrayList<>();
        addParserSkip(out, "op", skips.optJSONObject("opening"), skips.optJSONObject("op"));
        addParserSkip(out, "ed", skips.optJSONObject("ending"), skips.optJSONObject("ed"));
        JSONArray arr = skips.optJSONArray("results");
        if (arr == null) arr = skips.optJSONArray("items");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                String type = item.optString("skipType", item.optString("type", "op"));
                double start = item.optDouble("startTime", item.optDouble("start", -1));
                double end = item.optDouble("endTime", item.optDouble("end", -1));
                if (start >= 0 && end > start) out.add(new SkipInterval(type, start, end));
            }
        }
        return out;
    }

    private void addParserSkip(List<SkipInterval> out, String type, JSONObject a, JSONObject b) {
        JSONObject src = a != null ? a : b;
        if (src == null) return;
        double start = src.optDouble("start", src.optDouble("startTime", -1));
        double end = src.optDouble("end", src.optDouble("endTime", -1));
        if (start >= 0 && end > start) out.add(new SkipInterval(type, start, end));
    }

    private JSONObject getJson(String url) throws Exception {
        HttpURLConnection conn = open(url, "GET", null);
        int code = conn.getResponseCode();
        String body = readBody(conn, code);
        conn.disconnect();
        if (code == 401 || code == 404) return null;
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("HTTP " + code + (body.isEmpty() ? "" : ": " + body));
        }
        if (body.isEmpty()) return null;
        return new JSONObject(body);
    }

    private void putJson(String url, String jsonBody) throws Exception {
        HttpURLConnection conn = open(url, "PUT", jsonBody);
        int code = conn.getResponseCode();
        String body = readBody(conn, code);
        conn.disconnect();
        if (code == 401) return;
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("HTTP " + code + (body.isEmpty() ? "" : ": " + body));
        }
    }

    private HttpURLConnection open(String url, String method, String jsonBody) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(45_000);
        conn.setRequestMethod(method);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("User-Agent", "TrackAnimeAndroidNativePlayer/1");
        String cookie = CookieManager.getInstance().getCookie(baseUrl + "/");
        if (cookie != null && !cookie.isEmpty()) {
            conn.setRequestProperty("Cookie", cookie);
        }
        if (jsonBody != null) {
            byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
        }
        return conn;
    }

    private static String readBody(HttpURLConnection conn, int code) throws Exception {
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    /** Highest numeric quality key, or first entry. */
    public static String pickAutoQuality(Map<String, String> qualities) {
        if (qualities == null || qualities.isEmpty()) return null;
        int best = -1;
        String bestKey = null;
        for (String key : qualities.keySet()) {
            try {
                int h = Integer.parseInt(key);
                if (h > best) {
                    best = h;
                    bestKey = key;
                }
            } catch (NumberFormatException ignored) {
                if (bestKey == null) bestKey = key;
            }
        }
        if (bestKey != null) return bestKey;
        return qualities.keySet().iterator().next();
    }

    public static String formatTime(double seconds) {
        int total = (int) Math.max(0, Math.floor(seconds));
        int h = total / 3600;
        int m = (total % 3600) / 60;
        int s = total % 60;
        if (h > 0) {
            return String.format(Locale.US, "%d:%02d:%02d", h, m, s);
        }
        return String.format(Locale.US, "%d:%02d", m, s);
    }
}
