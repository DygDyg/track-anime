package ru.dygdyg.trackanime.player;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Launch JSON from WebView → PlayerActivity. */
public final class NativePlayerPayload {
    public final String baseUrl;
    public final int shikimoriId;
    public final String title;
    public final String posterUrl;
    public final String kodikId;
    public final int seasonNumber;
    public final int episodeNumber;
    public final double positionSeconds;
    public final boolean autoplay;
    public final boolean autoSkip;
    public final List<Translation> translations;

    public static final class Translation {
        public final String kodikId;
        public final String title;
        public final String type;

        public Translation(String kodikId, String title, String type) {
            this.kodikId = kodikId;
            this.title = title != null ? title : "";
            this.type = type != null ? type : "";
        }
    }

    private NativePlayerPayload(
            String baseUrl,
            int shikimoriId,
            String title,
            String posterUrl,
            String kodikId,
            int seasonNumber,
            int episodeNumber,
            double positionSeconds,
            boolean autoplay,
            boolean autoSkip,
            List<Translation> translations
    ) {
        this.baseUrl = baseUrl;
        this.shikimoriId = shikimoriId;
        this.title = title;
        this.posterUrl = posterUrl;
        this.kodikId = kodikId;
        this.seasonNumber = seasonNumber;
        this.episodeNumber = episodeNumber;
        this.positionSeconds = positionSeconds;
        this.autoplay = autoplay;
        this.autoSkip = autoSkip;
        this.translations = translations;
    }

    public static NativePlayerPayload parse(String json) throws Exception {
        JSONObject o = new JSONObject(json);
        String baseUrl = o.optString("baseUrl", "").trim();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        int shikimoriId = o.optInt("shikimoriId", 0);
        String kodikId = o.optString("kodikId", "").trim();
        if (baseUrl.isEmpty() || shikimoriId <= 0 || kodikId.isEmpty()) {
            throw new IllegalArgumentException("baseUrl, shikimoriId, kodikId required");
        }
        List<Translation> translations = new ArrayList<>();
        JSONArray arr = o.optJSONArray("translations");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.optJSONObject(i);
                if (t == null) continue;
                String id = t.optString("kodikId", "").trim();
                if (id.isEmpty()) continue;
                translations.add(new Translation(
                        id,
                        t.optString("title", id),
                        t.optString("type", "")
                ));
            }
        }
        if (translations.isEmpty()) {
            translations.add(new Translation(kodikId, kodikId, ""));
        }
        return new NativePlayerPayload(
                baseUrl,
                shikimoriId,
                o.optString("title", "").trim(),
                o.optString("posterUrl", "").trim(),
                kodikId,
                Math.max(1, o.optInt("seasonNumber", 1)),
                Math.max(1, o.optInt("episodeNumber", 1)),
                Math.max(0, o.optDouble("positionSeconds", 0)),
                o.optBoolean("autoplay", true),
                o.optBoolean("autoSkip", false),
                Collections.unmodifiableList(translations)
        );
    }
}
