package ru.dygdyg.trackanime.player;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Throttled PUT /api/user/watch-history — mirrors site rules (≥60s, ~30s). */
public final class WatchProgressReporter {
    private static final String LOG_TAG = "TaPlusProgress";
    public static final int MIN_SAVE_POSITION_SECONDS = 60;
    public static final long SAVE_INTERVAL_MS = 30_000L;

    public interface Listener {
        void onUnauthorized();
        void onSaved(String kodikId, int seasonNumber, int episodeNumber, double positionSeconds);
    }

    private final TaPlusApiClient api;
    private final int shikimoriId;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Listener listener;

    private String kodikId;
    private int seasonNumber;
    private int episodeNumber;
    private double positionSeconds;
    private String lastFingerprint = "";
    private long lastSaveAtMs;
    private final Runnable intervalRunnable = this::onInterval;

    public WatchProgressReporter(TaPlusApiClient api, int shikimoriId) {
        this.api = api;
        this.shikimoriId = shikimoriId;
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public void setEpisode(String kodikId, int seasonNumber, int episodeNumber) {
        this.kodikId = kodikId;
        this.seasonNumber = seasonNumber;
        this.episodeNumber = episodeNumber;
    }

    public void onPosition(double positionSeconds) {
        this.positionSeconds = positionSeconds;
    }

    public double getPositionSeconds() {
        return positionSeconds;
    }

    public void start() {
        main.removeCallbacks(intervalRunnable);
        main.postDelayed(intervalRunnable, SAVE_INTERVAL_MS);
    }

    public void stop() {
        main.removeCallbacks(intervalRunnable);
        flush(false);
    }

    public void onPause() {
        flush(false);
    }

    public void forceSave() {
        flush(true);
    }

    private void onInterval() {
        flush(false);
        main.postDelayed(intervalRunnable, SAVE_INTERVAL_MS);
    }

    private void flush(boolean force) {
        final String id = kodikId;
        final int season = seasonNumber;
        final int episode = episodeNumber;
        final double pos = positionSeconds;
        if (id == null || id.isEmpty() || episode <= 0) return;
        if (!force && pos < MIN_SAVE_POSITION_SECONDS) return;
        String fingerprint = id + ":" + season + ":" + episode + ":" + (int) Math.floor(pos);
        long now = System.currentTimeMillis();
        if (!force && fingerprint.equals(lastFingerprint) && now - lastSaveAtMs < SAVE_INTERVAL_MS / 2) {
            return;
        }
        if (!force && pos < MIN_SAVE_POSITION_SECONDS) return;
        lastFingerprint = fingerprint;
        lastSaveAtMs = now;
        executor.execute(() -> {
            try {
                api.putWatchProgress(shikimoriId, id, season, episode, pos);
                Listener l = listener;
                if (l != null) {
                    main.post(() -> l.onSaved(id, season, episode, pos));
                }
            } catch (TaPlusApiClient.UnauthorizedException unauthorized) {
                Listener l = listener;
                if (l != null) main.post(l::onUnauthorized);
            } catch (Exception error) {
                Log.w(LOG_TAG, "save failed", error);
            }
        });
    }

    public void shutdown() {
        main.removeCallbacks(intervalRunnable);
        flush(false);
        executor.shutdownNow();
    }
}
