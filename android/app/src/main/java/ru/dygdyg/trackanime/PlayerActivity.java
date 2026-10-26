package ru.dygdyg.trackanime;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.ui.PlayerView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ru.dygdyg.trackanime.player.GestureSeekHelper;
import ru.dygdyg.trackanime.player.NativePlayerPayload;
import ru.dygdyg.trackanime.player.SkipController;
import ru.dygdyg.trackanime.player.TaPlusApiClient;
import ru.dygdyg.trackanime.player.WatchProgressReporter;

public final class PlayerActivity extends Activity {
    public static final String EXTRA_PAYLOAD_JSON = "payload_json";
    public static final String EXTRA_IS_TV = "is_tv";
    public static final String EXTRA_RESULT_JSON = "result_json";

    private static final String LOG_TAG = "TaPlusNativePlayer";
    private static final String QUALITY_AUTO = "auto";
    private static final long UI_TICK_MS = 500L;
    private static final long CHROME_HIDE_MS = 4_000L;
    private static final float[] SPEEDS = {0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f};

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final SkipController skipController = new SkipController();

    private boolean tvMode;
    private boolean immersiveFs;
    private NativePlayerPayload launch;
    private TaPlusApiClient api;
    private WatchProgressReporter progressReporter;

    private ExoPlayer player;
    private MediaSession mediaSession;
    private PlayerView playerView;

    private TextView titleText;
    private TextView episodeLabel;
    private TextView timeText;
    private TextView errorText;
    private TextView gestureHud;
    private ProgressBar loading;
    private SeekBar seekBar;
    private SeekBar volumeBar;
    private FrameLayout skipMarkers;
    private Button btnPlayPause;
    private Button btnCenterPlay;
    private Button btnSkip;
    private Button btnMute;
    private Button btnSpeed;
    private Button btnQuality;
    private Button btnTranslations;
    private View chromeTop;
    private View chromeBottom;
    private View continuePillBar;
    private Button btnContinue;
    private Button btnFromStart;
    private LinearLayout episodeRow;
    private LinearLayout seasonRow;
    private LinearLayout translationsList;
    private View translationsSheet;

    private String kodikId;
    private int seasonNumber;
    private int episodeNumber;
    private Map<String, String> qualities = new LinkedHashMap<>();
    private String selectedQualityKey = QUALITY_AUTO;
    private List<TaPlusApiClient.EpisodeItem> episodes = new ArrayList<>();
    private List<Integer> seasons = new ArrayList<>();
    private List<NativePlayerPayload.Translation> translations = new ArrayList<>();
    private float playbackSpeed = 1f;
    private boolean muted;
    private float volumeBeforeMute = 1f;

    private double pendingSeekSeconds = -1;
    private boolean awaitingContinueChoice;
    private boolean userSeeking;
    private boolean chromeVisible = true;
    private boolean unauthorizedToasted;

    private final Runnable uiTick = new Runnable() {
        @Override
        public void run() {
            updateUiFromPlayer();
            main.postDelayed(this, UI_TICK_MS);
        }
    };
    private final Runnable hideChromeRunnable = this::hideChrome;

    public static void start(Activity from, String payloadJson, boolean isTv) {
        Intent intent = new Intent(from, PlayerActivity.class);
        intent.putExtra(EXTRA_PAYLOAD_JSON, payloadJson);
        intent.putExtra(EXTRA_IS_TV, isTv);
        from.startActivityForResult(intent, BaseWebActivity.NATIVE_PLAYER_REQUEST);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tvMode = getIntent().getBooleanExtra(EXTRA_IS_TV, false);
        if (tvMode) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            applyImmersiveMode(true);
        }

        String json = getIntent().getStringExtra(EXTRA_PAYLOAD_JSON);
        try {
            launch = NativePlayerPayload.parse(json);
        } catch (Exception error) {
            Toast.makeText(this, "Некорректные данные плеера", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        setContentView(tvMode ? R.layout.activity_player_tv : R.layout.activity_player);
        bindViews();
        wireControls();

        api = new TaPlusApiClient(launch.baseUrl);
        progressReporter = new WatchProgressReporter(api, launch.shikimoriId);
        progressReporter.setListener(new WatchProgressReporter.Listener() {
            @Override
            public void onUnauthorized() {
                if (unauthorizedToasted) return;
                unauthorizedToasted = true;
                Toast.makeText(PlayerActivity.this, "Войдите на сайте, чтобы сохранять прогресс", Toast.LENGTH_LONG).show();
            }

            @Override
            public void onSaved(String id, int season, int episode, double position) {
                if (!tvMode) return;
                try {
                    JSONObject o = new JSONObject();
                    o.put("shikimoriId", launch.shikimoriId);
                    o.put("title", launch.title);
                    o.put("seasonNumber", season);
                    o.put("episodeNumber", episode);
                    o.put("positionSeconds", position);
                    o.put("posterUrl", launch.posterUrl);
                    WatchNextPublisher.Item item = new WatchNextPublisher.Item(
                            launch.shikimoriId,
                            launch.title.isEmpty() ? "Track Anime" : launch.title,
                            "Сезон " + season + " · серия " + episode,
                            launch.posterUrl,
                            launch.baseUrl + "/anime/" + launch.shikimoriId,
                            Math.round(position * 1000.0),
                            Math.round(24 * 60 * 1000.0)
                    );
                    WatchNextPublisher.upsert(PlayerActivity.this, item);
                } catch (Exception ignored) {
                }
            }
        });

        kodikId = launch.kodikId;
        seasonNumber = launch.seasonNumber;
        episodeNumber = launch.episodeNumber;
        translations = new ArrayList<>(launch.translations);
        skipController.setAutoSkipEnabled(launch.autoSkip);
        progressReporter.setEpisode(kodikId, seasonNumber, episodeNumber);

        titleText.setText(launch.title.isEmpty() ? "Track Anime" : launch.title);
        updateEpisodeLabel();

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        playerView.setUseController(false);
        mediaSession = new MediaSession.Builder(this, player).build();
        player.setVolume(1f);
        syncVolumeBar();

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY && pendingSeekSeconds >= 0 && !awaitingContinueChoice) {
                    player.seekTo((long) (pendingSeekSeconds * 1000.0));
                    pendingSeekSeconds = -1;
                }
                if (state == Player.STATE_ENDED) {
                    progressReporter.onPause();
                    playNextEpisodeIfAny();
                }
                updatePlayPauseLabel();
                loading.setVisibility(state == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                updatePlayPauseLabel();
                if (!isPlaying) progressReporter.onPause();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.w(LOG_TAG, "playback error", error);
                showError("Ошибка воспроизведения");
            }
        });

        if (!tvMode) {
            new GestureSeekHelper(findViewById(R.id.gesture_surface), new GestureSeekHelper.Callbacks() {
                @Override public void onSingleTap() {
                    if (awaitingContinueChoice) return;
                    if (chromeVisible) hideChrome();
                    else showChrome(true);
                }
                @Override public void onSeekDelta(int deltaSeconds) { seekBy(deltaSeconds); }
                @Override public void onVerticalLeft(float deltaFraction) {
                    adjustVolume(deltaFraction);
                }
                @Override public void onVerticalRight(float deltaFraction) {
                    adjustBrightness(deltaFraction);
                }
                @Override public void onGestureHud(String text) {
                    gestureHud.setText(text);
                    gestureHud.setVisibility(View.VISIBLE);
                }
                @Override public void onGestureHudClear() {
                    gestureHud.setVisibility(View.GONE);
                }
                @Override public boolean isFullscreen() { return immersiveFs || tvMode; }
            });
        } else {
            findViewById(R.id.gesture_surface).setOnClickListener(v -> {
                if (awaitingContinueChoice) return;
                if (chromeVisible) hideChrome();
                else showChrome(true);
            });
        }

        bootFromPayloadOrHistory();
        progressReporter.start();
        main.post(uiTick);
        if (tvMode && !awaitingContinueChoice) btnPlayPause.post(btnPlayPause::requestFocus);
    }

    private void bootFromPayloadOrHistory() {
        // Explicit episode pick: trust payload, skip history reconcile.
        if ("episode".equalsIgnoreCase(launch.source) && launch.positionSeconds < 1) {
            loadEpisode(true);
            return;
        }
        // Always reconcile S/E from server before first /taplus (except episode source).
        loading.setVisibility(View.VISIBLE);
        io.execute(() -> {
            try {
                TaPlusApiClient.WatchProgress history = api.fetchWatchProgress(launch.shikimoriId);
                main.post(() -> applyHistoryThenLoad(history));
            } catch (Exception error) {
                main.post(() -> startPlaybackWithPosition(launch.positionSeconds));
            }
        });
    }

    private void applyHistoryThenLoad(TaPlusApiClient.WatchProgress history) {
        double position = launch.positionSeconds;
        if (history != null && history.episodeNumber > 0) {
            boolean knownTranslation = false;
            for (NativePlayerPayload.Translation t : translations) {
                if (t.kodikId.equals(history.kodikId)) {
                    knownTranslation = true;
                    break;
                }
            }
            // Always apply S/E from history (suppress only hides continue pill).
            if (knownTranslation) kodikId = history.kodikId;
            seasonNumber = history.seasonNumber;
            episodeNumber = history.episodeNumber;
            progressReporter.setEpisode(kodikId, seasonNumber, episodeNumber);
            updateEpisodeLabel();
            if (history.positionSeconds > 0) {
                position = history.positionSeconds;
            }
        }
        startPlaybackWithPosition(position);
    }

    private void startPlaybackWithPosition(double position) {
        if (position >= WatchProgressReporter.MIN_SAVE_POSITION_SECONDS
                && !launch.suppressContinuePrompt) {
            pendingSeekSeconds = position;
            showContinuePill(position);
            loadEpisode(false);
            return;
        }
        if (position >= 1) {
            pendingSeekSeconds = position;
        }
        loadEpisode(true);
    }

    private void bindViews() {
        playerView = findViewById(R.id.player_view);
        titleText = findViewById(R.id.title_text);
        episodeLabel = findViewById(R.id.episode_label);
        timeText = findViewById(R.id.time_text);
        errorText = findViewById(R.id.error_text);
        gestureHud = findViewById(R.id.gesture_hud);
        loading = findViewById(R.id.loading);
        seekBar = findViewById(R.id.seek_bar);
        volumeBar = findViewById(R.id.volume_bar);
        skipMarkers = findViewById(R.id.skip_markers);
        btnPlayPause = findViewById(R.id.btn_play_pause);
        btnCenterPlay = findViewById(R.id.btn_center_play);
        btnSkip = findViewById(R.id.btn_skip);
        btnMute = findViewById(R.id.btn_mute);
        btnSpeed = findViewById(R.id.btn_speed);
        btnQuality = findViewById(R.id.btn_quality);
        btnTranslations = findViewById(R.id.btn_translations);
        chromeTop = findViewById(R.id.chrome_top);
        chromeBottom = findViewById(R.id.chrome_bottom);
        continuePillBar = findViewById(R.id.continue_pill_bar);
        btnContinue = findViewById(R.id.btn_continue);
        btnFromStart = findViewById(R.id.btn_from_start);
        episodeRow = findViewById(R.id.episode_row);
        seasonRow = findViewById(R.id.season_row);
        translationsList = findViewById(R.id.translations_list);
        translationsSheet = findViewById(R.id.translations_sheet);
    }

    private void wireControls() {
        btnPlayPause.setOnClickListener(v -> togglePlayPause());
        btnCenterPlay.setOnClickListener(v -> togglePlayPause());
        findViewById(R.id.btn_seek_back).setOnClickListener(v -> seekBy(-10));
        findViewById(R.id.btn_seek_fwd).setOnClickListener(v -> seekBy(10));
        findViewById(R.id.btn_seek_back_90).setOnClickListener(v -> seekBy(-90));
        findViewById(R.id.btn_seek_fwd_90).setOnClickListener(v -> seekBy(90));
        findViewById(R.id.btn_prev).setOnClickListener(v -> changeEpisodeBy(-1));
        findViewById(R.id.btn_next).setOnClickListener(v -> changeEpisodeBy(1));
        btnSkip.setOnClickListener(v -> {
            TaPlusApiClient.SkipInterval skip = skipController.findActionable(currentPositionSeconds());
            if (skip != null) player.seekTo((long) (skip.endTime * 1000.0));
        });
        btnMute.setOnClickListener(v -> toggleMute());
        btnSpeed.setOnClickListener(v -> showSpeedPicker());
        btnQuality.setOnClickListener(v -> showQualityPicker());
        btnTranslations.setOnClickListener(v -> toggleTranslationsSheet());
        findViewById(R.id.btn_fullscreen).setOnClickListener(v -> toggleFullscreen());
        btnContinue.setOnClickListener(v -> resolveContinue(true));
        btnFromStart.setOnClickListener(v -> resolveContinue(false));
        btnContinue.setOnLongClickListener(v -> {
            resolveContinue(false);
            return true;
        });

        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (!fromUser || player == null) return;
                long duration = player.getDuration();
                if (duration <= 0) return;
                long pos = (long) (duration * (progress / 1000.0));
                timeText.setText(TaPlusApiClient.formatTime(pos / 1000.0) + " / "
                        + TaPlusApiClient.formatTime(duration / 1000.0));
            }
            @Override public void onStartTrackingTouch(SeekBar bar) {
                userSeeking = true;
                showChrome(true);
            }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                userSeeking = false;
                long duration = player.getDuration();
                if (duration > 0) player.seekTo((long) (duration * (bar.getProgress() / 1000.0)));
                scheduleHideChrome();
            }
        });

        volumeBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (!fromUser || player == null) return;
                float vol = Math.max(0f, Math.min(1f, progress / 100f));
                player.setVolume(vol);
                muted = vol <= 0.001f;
                updateMuteLabel();
            }
            @Override public void onStartTrackingTouch(SeekBar bar) { }
            @Override public void onStopTrackingTouch(SeekBar bar) { }
        });
    }

    private void showContinuePill(double positionSeconds) {
        awaitingContinueChoice = true;
        btnContinue.setText("Продолжить · " + TaPlusApiClient.formatTime(positionSeconds));
        continuePillBar.setVisibility(View.VISIBLE);
        btnCenterPlay.setVisibility(View.GONE);
        showChrome(false);
        btnContinue.requestFocus();
    }

    private void resolveContinue(boolean resume) {
        awaitingContinueChoice = false;
        continuePillBar.setVisibility(View.GONE);
        if (resume) {
            if (pendingSeekSeconds < 0 && launch.positionSeconds >= 1) {
                pendingSeekSeconds = launch.positionSeconds;
            }
        } else {
            pendingSeekSeconds = -1;
            if (player != null) player.seekTo(0);
        }
        showChrome(true);
        if (player != null) player.play();
        if (tvMode) btnPlayPause.requestFocus();
    }

    private void loadEpisode(boolean autoPlay) {
        showError(null);
        loading.setVisibility(View.VISIBLE);
        progressReporter.setEpisode(kodikId, seasonNumber, episodeNumber);
        updateEpisodeLabel();
        final String id = kodikId;
        final int season = seasonNumber;
        final int episode = episodeNumber;
        io.execute(() -> {
            try {
                TaPlusApiClient.StreamResult stream = api.fetchTaplus(
                        launch.shikimoriId, id, season, episode, false);
                TaPlusApiClient.EpisodesResult eps = api.fetchEpisodes(
                        launch.shikimoriId, id, season);
                List<TaPlusApiClient.SkipInterval> skips = stream.skips;
                if (skips == null || skips.isEmpty()) {
                    skips = api.fetchSkipTimes(launch.shikimoriId, season, episode, 1440);
                }
                final List<TaPlusApiClient.SkipInterval> finalSkips = skips;
                main.post(() -> applyStream(stream, eps, finalSkips, autoPlay));
            } catch (Exception error) {
                Log.w(LOG_TAG, "loadEpisode failed", error);
                main.post(() -> {
                    loading.setVisibility(View.GONE);
                    showError(error.getMessage() != null ? error.getMessage() : "Не удалось загрузить поток");
                });
            }
        });
    }

    private void applyStream(
            TaPlusApiClient.StreamResult stream,
            TaPlusApiClient.EpisodesResult eps,
            List<TaPlusApiClient.SkipInterval> skips,
            boolean autoPlay
    ) {
        loading.setVisibility(View.GONE);
        if (stream.error != null && (stream.qualities == null || stream.qualities.isEmpty())) {
            showError(stream.error);
            return;
        }
        qualities = stream.qualities != null ? new LinkedHashMap<>(stream.qualities) : new LinkedHashMap<>();
        applyStreamSkips(skips);
        if (eps != null) {
            episodes = new ArrayList<>(eps.episodes);
            seasons = new ArrayList<>(eps.seasons);
        }
        rebuildSeasonRow();
        rebuildEpisodeRow();
        rebuildSkipMarkers();
        String url = resolveStreamUrl();
        if (url == null) {
            showError("Нет HLS-потока");
            return;
        }
        double keepPos = currentPositionSeconds();
        boolean keep = keepPos > 2 && !awaitingContinueChoice && pendingSeekSeconds < 0;
        player.setMediaItem(MediaItem.fromUri(url));
        player.prepare();
        player.setPlaybackSpeed(playbackSpeed);
        if (keep) pendingSeekSeconds = keepPos;
        if (autoPlay && !awaitingContinueChoice) player.play();
        updateQualityButton();
        showChrome(true);
    }

    private void rebuildSeasonRow() {
        seasonRow.removeAllViews();
        if (seasons.size() <= 1) {
            seasonRow.setVisibility(View.GONE);
            return;
        }
        seasonRow.setVisibility(View.VISIBLE);
        for (int season : seasons) {
            Button b = chromeChip("S" + season, season == seasonNumber);
            b.setOnClickListener(v -> {
                if (seasonNumber == season) return;
                seasonNumber = season;
                episodeNumber = 1;
                pendingSeekSeconds = -1;
                loadEpisode(true);
            });
            seasonRow.addView(b);
        }
    }

    private void rebuildEpisodeRow() {
        episodeRow.removeAllViews();
        List<TaPlusApiClient.EpisodeItem> items = new ArrayList<>();
        for (TaPlusApiClient.EpisodeItem item : episodes) {
            if (item.seasonNumber == seasonNumber) items.add(item);
        }
        if (items.isEmpty()) items.addAll(episodes);
        for (TaPlusApiClient.EpisodeItem item : items) {
            boolean active = item.seasonNumber == seasonNumber && item.episodeNumber == episodeNumber;
            Button b = chromeChip(String.valueOf(item.episodeNumber), active);
            b.setOnClickListener(v -> changeEpisode(item.seasonNumber, item.episodeNumber));
            episodeRow.addView(b);
        }
    }

    private Button chromeChip(String label, boolean active) {
        Button b = new Button(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(36));
        lp.setMargins(dp(4), 0, dp(4), 0);
        b.setLayoutParams(lp);
        b.setMinWidth(dp(40));
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setFocusable(true);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(8));
        if (active) {
            bg.setColor(getResources().getColor(R.color.accent));
        } else {
            bg.setColor(Color.parseColor("#14FFFFFF"));
            bg.setStroke(dp(1), Color.parseColor("#26FFFFFF"));
        }
        b.setBackground(bg);
        return b;
    }

    private void rebuildSkipMarkers() {
        skipMarkers.removeAllViews();
        long duration = player != null ? player.getDuration() : 0;
        if (duration <= 0) return;
        // markers redrawn on tick when duration known
    }

    private void redrawSkipMarkers(long durationMs) {
        skipMarkers.removeAllViews();
        if (durationMs <= 0) return;
        List<TaPlusApiClient.SkipInterval> intervals = new ArrayList<>();
        // SkipController doesn't expose list — re-query actionable by sampling is enough for button;
        // markers use last applied skips via findActionable windows is limited. Rebuild from stream each apply.
        // Store last skips on field:
        if (lastSkips == null) return;
        for (TaPlusApiClient.SkipInterval skip : lastSkips) {
            View mark = new View(this);
            boolean ed = skip.skipType != null && skip.skipType.toLowerCase(Locale.US).contains("ed");
            mark.setBackgroundColor(ed ? Color.parseColor("#99FBBF24") : Color.parseColor("#8F34D399"));
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    Math.max(dp(4), (int) ((skip.endTime - skip.startTime) * 1000.0 / durationMs * skipMarkers.getWidth())),
                    ViewGroup.LayoutParams.MATCH_PARENT);
            lp.leftMargin = (int) (skip.startTime * 1000.0 / durationMs * Math.max(1, skipMarkers.getWidth()));
            skipMarkers.addView(mark, lp);
        }
    }

    private List<TaPlusApiClient.SkipInterval> lastSkips = new ArrayList<>();

    private String resolveStreamUrl() {
        if (qualities.isEmpty()) return null;
        if (QUALITY_AUTO.equals(selectedQualityKey)) {
            String key = TaPlusApiClient.pickAutoQuality(qualities);
            return key != null ? qualities.get(key) : null;
        }
        String url = qualities.get(selectedQualityKey);
        if (url != null) return url;
        String key = TaPlusApiClient.pickAutoQuality(qualities);
        return key != null ? qualities.get(key) : null;
    }

    private void reloadCurrentQualityKeepingPosition() {
        String url = resolveStreamUrl();
        if (url == null || player == null) return;
        pendingSeekSeconds = currentPositionSeconds();
        player.setMediaItem(MediaItem.fromUri(url));
        player.prepare();
        player.setPlaybackSpeed(playbackSpeed);
        player.play();
        updateQualityButton();
    }

    private void playNextEpisodeIfAny() {
        changeEpisodeBy(1);
    }

    private void changeEpisodeBy(int delta) {
        int next = episodeNumber + delta;
        for (TaPlusApiClient.EpisodeItem item : episodes) {
            if (item.seasonNumber == seasonNumber && item.episodeNumber == next) {
                changeEpisode(item.seasonNumber, item.episodeNumber);
                return;
            }
        }
    }

    private void changeEpisode(int season, int episode) {
        seasonNumber = season;
        episodeNumber = episode;
        pendingSeekSeconds = -1;
        progressReporter.forceSave();
        loadEpisode(true);
    }

    private void changeTranslation(String nextKodikId) {
        if (nextKodikId == null || nextKodikId.equals(kodikId)) {
            translationsSheet.setVisibility(View.GONE);
            return;
        }
        kodikId = nextKodikId;
        progressReporter.setEpisode(kodikId, seasonNumber, episodeNumber);
        progressReporter.forceSave();
        pendingSeekSeconds = currentPositionSeconds();
        translationsSheet.setVisibility(View.GONE);
        loadEpisode(true);
    }

    private void toggleTranslationsSheet() {
        if (translationsSheet.getVisibility() == View.VISIBLE) {
            translationsSheet.setVisibility(View.GONE);
            return;
        }
        translationsList.removeAllViews();
        for (NativePlayerPayload.Translation t : translations) {
            Button b = new Button(this);
            boolean active = t.kodikId.equals(kodikId);
            b.setText(t.title + (active ? " ✓" : ""));
            b.setFocusable(true);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(0, 0, 0, dp(6));
            b.setLayoutParams(lp);
            applyTranslationColors(b, t, active);
            b.setOnClickListener(v -> changeTranslation(t.kodikId));
            translationsList.addView(b);
        }
        translationsSheet.setVisibility(View.VISIBLE);
        showChrome(false);
    }

    private void applyTranslationColors(Button b, NativePlayerPayload.Translation t, boolean active) {
        String bgHex = active && !t.bgActive.isEmpty() ? t.bgActive : t.bg;
        String textHex = t.text;
        String borderHex = t.border;
        if (bgHex.isEmpty() && textHex.isEmpty()) {
            b.setTextColor(Color.WHITE);
            b.setBackgroundResource(active ? R.drawable.player_accent_btn : R.drawable.player_btn_bg);
            return;
        }
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(10));
        try {
            bg.setColor(Color.parseColor(bgHex.isEmpty() ? "#14FFFFFF" : bgHex));
        } catch (Exception e) {
            bg.setColor(Color.parseColor("#14FFFFFF"));
        }
        if (!borderHex.isEmpty()) {
            try {
                bg.setStroke(dp(1), Color.parseColor(borderHex));
            } catch (Exception ignored) {
            }
        }
        b.setBackground(bg);
        try {
            b.setTextColor(Color.parseColor(textHex.isEmpty() ? "#FFFFFFFF" : textHex));
        } catch (Exception e) {
            b.setTextColor(Color.WHITE);
        }
    }

    private void updateUiFromPlayer() {
        if (player == null) return;
        double pos = currentPositionSeconds();
        progressReporter.onPosition(pos);
        double autoEnd = skipController.pollAutoSkip(pos);
        if (autoEnd > 0) {
            player.seekTo((long) (autoEnd * 1000.0));
            return;
        }
        TaPlusApiClient.SkipInterval actionable = skipController.findActionable(pos);
        if (actionable != null) {
            btnSkip.setVisibility(View.VISIBLE);
            btnSkip.setText(SkipController.labelFor(actionable));
        } else {
            btnSkip.setVisibility(View.GONE);
        }
        long duration = player.getDuration();
        if (!userSeeking && duration > 0) {
            timeText.setText(TaPlusApiClient.formatTime(pos) + " / "
                    + TaPlusApiClient.formatTime(duration / 1000.0));
            seekBar.setProgress((int) Math.min(1000, Math.round(1000.0 * (pos * 1000.0) / duration)));
            if (skipMarkers.getWidth() > 0 && lastSkips != null) {
                redrawSkipMarkers(duration);
            }
        }
    }

    private double currentPositionSeconds() {
        if (player == null) return 0;
        return Math.max(0, player.getCurrentPosition() / 1000.0);
    }

    private void togglePlayPause() {
        if (player == null) return;
        if (player.isPlaying()) player.pause();
        else player.play();
        showChrome(true);
    }

    private void seekBy(int deltaSeconds) {
        if (player == null) return;
        long next = Math.max(0, player.getCurrentPosition() + deltaSeconds * 1000L);
        long duration = player.getDuration();
        if (duration > 0) next = Math.min(next, duration);
        player.seekTo(next);
        showChrome(true);
    }

    private void toggleMute() {
        if (player == null) return;
        if (muted) {
            player.setVolume(volumeBeforeMute > 0 ? volumeBeforeMute : 1f);
            muted = false;
        } else {
            volumeBeforeMute = player.getVolume();
            player.setVolume(0f);
            muted = true;
        }
        syncVolumeBar();
        updateMuteLabel();
        showChrome(true);
    }

    private void syncVolumeBar() {
        if (player == null || volumeBar == null) return;
        volumeBar.setProgress(Math.round(player.getVolume() * 100));
    }

    private void updateMuteLabel() {
        btnMute.setText(muted ? "Без звука" : "Звук");
    }

    private void adjustVolume(float deltaFraction) {
        if (player == null) return;
        float next = Math.max(0f, Math.min(1f, player.getVolume() + deltaFraction));
        player.setVolume(next);
        muted = next <= 0.001f;
        syncVolumeBar();
        updateMuteLabel();
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (am != null) {
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            if (max > 0) am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(next * max), 0);
        }
        gestureHud.setText(Math.round(next * 100) + "%");
        gestureHud.setVisibility(View.VISIBLE);
    }

    private void adjustBrightness(float deltaFraction) {
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        float current = lp.screenBrightness;
        if (current < 0) current = 0.85f;
        float next = Math.max(0.01f, Math.min(1f, current + deltaFraction));
        lp.screenBrightness = next;
        getWindow().setAttributes(lp);
        gestureHud.setText(Math.round(next * 100) + "%");
        gestureHud.setVisibility(View.VISIBLE);
    }

    private void showSpeedPicker() {
        String[] labels = new String[SPEEDS.length];
        for (int i = 0; i < SPEEDS.length; i++) {
            labels[i] = String.format(Locale.US, "%.2g×", SPEEDS[i]).replace(".00", "");
            if (Math.abs(SPEEDS[i] - playbackSpeed) < 0.01f) labels[i] += " ✓";
        }
        new AlertDialog.Builder(this)
                .setTitle("Скорость")
                .setItems(labels, (d, which) -> {
                    playbackSpeed = SPEEDS[which];
                    if (player != null) player.setPlaybackSpeed(playbackSpeed);
                    btnSpeed.setText(String.format(Locale.US, "%.2g×", playbackSpeed).replace(".00", ""));
                })
                .setNegativeButton("Закрыть", null)
                .show();
    }

    private void showQualityPicker() {
        if (qualities.isEmpty()) {
            Toast.makeText(this, "Качества ещё нет", Toast.LENGTH_SHORT).show();
            return;
        }
        List<String> keys = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        keys.add(QUALITY_AUTO);
        labels.add("Авто");
        for (String key : qualities.keySet()) {
            keys.add(key);
            labels.add(key + "p");
        }
        new AlertDialog.Builder(this)
                .setTitle("Качество")
                .setItems(labels.toArray(new String[0]), (d, which) -> {
                    selectedQualityKey = keys.get(which);
                    reloadCurrentQualityKeepingPosition();
                })
                .setNegativeButton("Закрыть", null)
                .show();
    }

    private void toggleFullscreen() {
        immersiveFs = !immersiveFs;
        applyImmersiveMode(immersiveFs);
        if (!tvMode) {
            setRequestedOrientation(immersiveFs
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
        showChrome(true);
    }

    private void updatePlayPauseLabel() {
        if (btnPlayPause == null || player == null) return;
        boolean playing = player.isPlaying();
        btnPlayPause.setText(playing ? "Пауза" : "Смотреть");
        btnCenterPlay.setText(playing ? "❚❚" : "▶");
        btnCenterPlay.setVisibility(chromeVisible && !awaitingContinueChoice ? View.VISIBLE : View.GONE);
    }

    private void updateEpisodeLabel() {
        episodeLabel.setText("S" + seasonNumber + "E" + episodeNumber);
    }

    private void updateQualityButton() {
        if (QUALITY_AUTO.equals(selectedQualityKey)) {
            String auto = TaPlusApiClient.pickAutoQuality(qualities);
            btnQuality.setText(auto != null ? "Авто " + auto + "p" : "Качество");
        } else {
            btnQuality.setText(selectedQualityKey + "p");
        }
    }

    private void showError(String message) {
        if (message == null || message.isEmpty()) {
            errorText.setVisibility(View.GONE);
            return;
        }
        errorText.setText(message);
        errorText.setVisibility(View.VISIBLE);
    }

    private void showChrome(boolean scheduleHide) {
        chromeVisible = true;
        chromeTop.setVisibility(View.VISIBLE);
        chromeBottom.setVisibility(View.VISIBLE);
        if (awaitingContinueChoice) {
            continuePillBar.setVisibility(View.VISIBLE);
            btnCenterPlay.setVisibility(View.GONE);
        }
        updatePlayPauseLabel();
        main.removeCallbacks(hideChromeRunnable);
        if (scheduleHide && !awaitingContinueChoice) scheduleHideChrome();
    }

    private void hideChrome() {
        if (awaitingContinueChoice) return;
        chromeVisible = false;
        chromeTop.setVisibility(View.GONE);
        chromeBottom.setVisibility(View.GONE);
        translationsSheet.setVisibility(View.GONE);
        btnCenterPlay.setVisibility(View.GONE);
        continuePillBar.setVisibility(View.GONE);
    }

    private void scheduleHideChrome() {
        main.removeCallbacks(hideChromeRunnable);
        main.postDelayed(hideChromeRunnable, CHROME_HIDE_MS);
    }

    private void applyImmersiveMode(boolean on) {
        View decor = getWindow().getDecorView();
        if (on) {
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void deliverResult() {
        try {
            JSONObject o = new JSONObject();
            o.put("shikimoriId", launch.shikimoriId);
            o.put("kodikId", kodikId);
            o.put("seasonNumber", seasonNumber);
            o.put("episodeNumber", episodeNumber);
            o.put("positionSeconds", progressReporter != null
                    ? progressReporter.getPositionSeconds()
                    : currentPositionSeconds());
            Intent data = new Intent();
            data.putExtra(EXTRA_RESULT_JSON, o.toString());
            setResult(RESULT_OK, data);
        } catch (Exception ignored) {
            setResult(RESULT_CANCELED);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (!tvMode) return super.onKeyDown(keyCode, event);
        if (awaitingContinueChoice) return super.onKeyDown(keyCode, event);
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT:
                if (!chromeVisible) { seekBy(-10); return true; }
                break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                if (!chromeVisible) { seekBy(10); return true; }
                break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                if (!chromeVisible) { togglePlayPause(); return true; }
                break;
            case KeyEvent.KEYCODE_DPAD_UP:
                if (!chromeVisible) {
                    showChrome(true);
                    if (episodeRow.getChildCount() > 0) episodeRow.getChildAt(0).requestFocus();
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                if (!chromeVisible) {
                    showChrome(true);
                    btnTranslations.requestFocus();
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlayPause();
                return true;
            default:
                break;
        }
        if (!chromeVisible && keyCode != KeyEvent.KEYCODE_BACK) showChrome(true);
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        if (translationsSheet.getVisibility() == View.VISIBLE) {
            translationsSheet.setVisibility(View.GONE);
            return;
        }
        if (chromeVisible && !awaitingContinueChoice && (tvMode || immersiveFs)) {
            if (immersiveFs && !tvMode) {
                toggleFullscreen();
                return;
            }
            hideChrome();
            return;
        }
        deliverResult();
        super.onBackPressed();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (progressReporter != null) progressReporter.onPause();
    }

    @Override
    protected void onDestroy() {
        deliverResult();
        main.removeCallbacks(uiTick);
        main.removeCallbacks(hideChromeRunnable);
        if (progressReporter != null) progressReporter.shutdown();
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        io.shutdownNow();
        super.onDestroy();
    }

    // Fix applyStream to store skips for markers
    private void applyStreamSkips(List<TaPlusApiClient.SkipInterval> skips) {
        lastSkips = skips != null ? new ArrayList<>(skips) : new ArrayList<>();
        skipController.setIntervals(lastSkips);
    }
}
