package ru.dygdyg.trackanime;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ru.dygdyg.trackanime.player.NativePlayerPayload;
import ru.dygdyg.trackanime.player.SkipController;
import ru.dygdyg.trackanime.player.TaPlusApiClient;
import ru.dygdyg.trackanime.player.WatchProgressReporter;

public final class PlayerActivity extends Activity {
    public static final String EXTRA_PAYLOAD_JSON = "payload_json";
    public static final String EXTRA_IS_TV = "is_tv";

    private static final String LOG_TAG = "TaPlusNativePlayer";
    private static final String QUALITY_AUTO = "auto";
    private static final long UI_TICK_MS = 500L;
    private static final long CHROME_HIDE_MS = 4_000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final SkipController skipController = new SkipController();

    private boolean tvMode;
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
    private ProgressBar loading;
    private SeekBar seekBar;
    private Button btnPlayPause;
    private Button btnSkip;
    private Button btnEpisodes;
    private Button btnTranslations;
    private Button btnQuality;
    private View chromeTop;
    private View chromeBottom;
    private View continueOverlay;
    private TextView continueMessage;

    private String kodikId;
    private int seasonNumber;
    private int episodeNumber;
    private Map<String, String> qualities = new LinkedHashMap<>();
    private String selectedQualityKey = QUALITY_AUTO;
    private List<TaPlusApiClient.EpisodeItem> episodes = new ArrayList<>();
    private List<Integer> seasons = new ArrayList<>();
    private List<NativePlayerPayload.Translation> translations = new ArrayList<>();

    private double pendingSeekSeconds = -1;
    private boolean awaitingContinueChoice;
    private boolean userSeeking;
    private boolean chromeVisible = true;

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
        from.startActivity(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tvMode = getIntent().getBooleanExtra(EXTRA_IS_TV, false);
        if (tvMode) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setImmersive();
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

        api = new TaPlusApiClient(launch.baseUrl);
        progressReporter = new WatchProgressReporter(api, launch.shikimoriId);
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

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY && pendingSeekSeconds >= 0 && !awaitingContinueChoice) {
                    long ms = (long) (pendingSeekSeconds * 1000.0);
                    player.seekTo(ms);
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
                if (!isPlaying) {
                    progressReporter.onPause();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.w(LOG_TAG, "playback error", error);
                showError("Ошибка воспроизведения");
            }
        });

        btnPlayPause.setOnClickListener(v -> togglePlayPause());
        findViewById(R.id.btn_seek_back).setOnClickListener(v -> seekBy(-10));
        findViewById(R.id.btn_seek_fwd).setOnClickListener(v -> seekBy(10));
        btnSkip.setOnClickListener(v -> {
            TaPlusApiClient.SkipInterval skip = skipController.findActionable(currentPositionSeconds());
            if (skip != null) player.seekTo((long) (skip.endTime * 1000.0));
        });
        btnEpisodes.setOnClickListener(v -> showEpisodesPicker());
        btnTranslations.setOnClickListener(v -> showTranslationsPicker());
        btnQuality.setOnClickListener(v -> showQualityPicker());
        findViewById(R.id.btn_continue).setOnClickListener(v -> resolveContinue(true));
        findViewById(R.id.btn_from_start).setOnClickListener(v -> resolveContinue(false));

        if (!tvMode && seekBar != null) {
            seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                    if (!fromUser || player == null) return;
                    long duration = player.getDuration();
                    if (duration <= 0) return;
                    long pos = (long) (duration * (progress / 1000.0));
                    timeText.setText(
                            TaPlusApiClient.formatTime(pos / 1000.0)
                                    + " / "
                                    + TaPlusApiClient.formatTime(duration / 1000.0)
                    );
                }

                @Override
                public void onStartTrackingTouch(SeekBar bar) {
                    userSeeking = true;
                    showChrome(true);
                }

                @Override
                public void onStopTrackingTouch(SeekBar bar) {
                    userSeeking = false;
                    long duration = player.getDuration();
                    if (duration > 0) {
                        player.seekTo((long) (duration * (bar.getProgress() / 1000.0)));
                    }
                    scheduleHideChrome();
                }
            });
        }

        View root = findViewById(R.id.player_root);
        root.setOnClickListener(v -> {
            if (awaitingContinueChoice) return;
            if (chromeVisible) hideChrome();
            else showChrome(true);
        });

        if (launch.positionSeconds >= WatchProgressReporter.MIN_SAVE_POSITION_SECONDS) {
            showContinueOverlay(launch.positionSeconds);
        } else {
            pendingSeekSeconds = launch.positionSeconds > 1 ? launch.positionSeconds : -1;
            loadEpisode(true);
        }

        progressReporter.start();
        main.post(uiTick);
        if (tvMode) {
            btnPlayPause.post(btnPlayPause::requestFocus);
        }
    }

    private void bindViews() {
        playerView = findViewById(R.id.player_view);
        titleText = findViewById(R.id.title_text);
        episodeLabel = findViewById(R.id.episode_label);
        timeText = findViewById(R.id.time_text);
        errorText = findViewById(R.id.error_text);
        loading = findViewById(R.id.loading);
        seekBar = findViewById(R.id.seek_bar);
        btnPlayPause = findViewById(R.id.btn_play_pause);
        btnSkip = findViewById(R.id.btn_skip);
        btnEpisodes = findViewById(R.id.btn_episodes);
        btnTranslations = findViewById(R.id.btn_translations);
        btnQuality = findViewById(R.id.btn_quality);
        chromeTop = findViewById(R.id.chrome_top);
        chromeBottom = findViewById(R.id.chrome_bottom);
        continueOverlay = findViewById(R.id.continue_overlay);
        continueMessage = findViewById(R.id.continue_message);
    }

    private void showContinueOverlay(double positionSeconds) {
        awaitingContinueChoice = true;
        continueMessage.setText("Продолжить с " + TaPlusApiClient.formatTime(positionSeconds) + "?");
        continueOverlay.setVisibility(View.VISIBLE);
        hideChrome();
        findViewById(R.id.btn_continue).requestFocus();
        // Prefetch stream while user chooses.
        loadEpisode(false);
    }

    private void resolveContinue(boolean resume) {
        awaitingContinueChoice = false;
        continueOverlay.setVisibility(View.GONE);
        if (resume) {
            pendingSeekSeconds = launch.positionSeconds;
        } else {
            pendingSeekSeconds = -1;
            if (player != null) player.seekTo(0);
        }
        showChrome(true);
        if (launch.autoplay || resume) {
            player.play();
        }
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
        skipController.setIntervals(skips);
        if (eps != null) {
            episodes = new ArrayList<>(eps.episodes);
            seasons = new ArrayList<>(eps.seasons);
        }
        String url = resolveStreamUrl();
        if (url == null) {
            showError("Нет HLS-потока");
            return;
        }
        double keepPos = currentPositionSeconds();
        boolean keep = keepPos > 2 && !awaitingContinueChoice && pendingSeekSeconds < 0;
        player.setMediaItem(MediaItem.fromUri(url));
        player.prepare();
        if (keep) {
            pendingSeekSeconds = keepPos;
        }
        if (autoPlay && !awaitingContinueChoice) {
            player.play();
        }
        updateQualityButton();
        showChrome(true);
    }

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
        double pos = currentPositionSeconds();
        player.setMediaItem(MediaItem.fromUri(url));
        player.prepare();
        pendingSeekSeconds = pos;
        player.play();
        updateQualityButton();
    }

    private void playNextEpisodeIfAny() {
        int next = episodeNumber + 1;
        boolean found = false;
        for (TaPlusApiClient.EpisodeItem item : episodes) {
            if (item.seasonNumber == seasonNumber && item.episodeNumber == next) {
                found = true;
                break;
            }
        }
        if (!found) return;
        episodeNumber = next;
        pendingSeekSeconds = -1;
        loadEpisode(true);
    }

    private void changeEpisode(int season, int episode) {
        seasonNumber = season;
        episodeNumber = episode;
        pendingSeekSeconds = -1;
        progressReporter.forceSave();
        loadEpisode(true);
    }

    private void changeTranslation(String nextKodikId) {
        if (nextKodikId == null || nextKodikId.equals(kodikId)) return;
        kodikId = nextKodikId;
        progressReporter.setEpisode(kodikId, seasonNumber, episodeNumber);
        progressReporter.forceSave();
        pendingSeekSeconds = currentPositionSeconds();
        loadEpisode(true);
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
            timeText.setText(
                    TaPlusApiClient.formatTime(pos)
                            + " / "
                            + TaPlusApiClient.formatTime(duration / 1000.0)
            );
            if (seekBar != null && seekBar.getVisibility() == View.VISIBLE) {
                seekBar.setProgress((int) Math.min(1000, Math.round(1000.0 * (pos * 1000.0) / duration)));
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

    private void updatePlayPauseLabel() {
        if (btnPlayPause == null || player == null) return;
        btnPlayPause.setText(player.isPlaying() ? "Пауза" : "Смотреть");
    }

    private void updateEpisodeLabel() {
        episodeLabel.setText("S" + seasonNumber + "E" + episodeNumber);
    }

    private void updateQualityButton() {
        if (QUALITY_AUTO.equals(selectedQualityKey)) {
            String auto = TaPlusApiClient.pickAutoQuality(qualities);
            btnQuality.setText(auto != null ? "Авто (" + auto + ")" : "Качество");
        } else {
            btnQuality.setText(selectedQualityKey + "p");
        }
    }

    private void showEpisodesPicker() {
        if (episodes.isEmpty()) {
            Toast.makeText(this, "Список серий загружается…", Toast.LENGTH_SHORT).show();
            io.execute(() -> {
                try {
                    TaPlusApiClient.EpisodesResult eps = api.fetchEpisodes(
                            launch.shikimoriId, kodikId, seasonNumber);
                    main.post(() -> {
                        episodes = new ArrayList<>(eps.episodes);
                        seasons = new ArrayList<>(eps.seasons);
                        showEpisodesPicker();
                    });
                } catch (Exception error) {
                    main.post(() -> Toast.makeText(this, "Не удалось загрузить серии", Toast.LENGTH_SHORT).show());
                }
            });
            return;
        }
        List<String> labels = new ArrayList<>();
        List<TaPlusApiClient.EpisodeItem> items = new ArrayList<>();
        for (TaPlusApiClient.EpisodeItem item : episodes) {
            if (item.seasonNumber != seasonNumber) continue;
            labels.add("Серия " + item.episodeNumber);
            items.add(item);
        }
        if (labels.isEmpty()) {
            for (TaPlusApiClient.EpisodeItem item : episodes) {
                labels.add("S" + item.seasonNumber + "E" + item.episodeNumber);
                items.add(item);
            }
        }
        new AlertDialog.Builder(this)
                .setTitle("Серии")
                .setItems(labels.toArray(new String[0]), (d, which) -> {
                    TaPlusApiClient.EpisodeItem item = items.get(which);
                    changeEpisode(item.seasonNumber, item.episodeNumber);
                })
                .setNegativeButton("Закрыть", null)
                .show();
    }

    private void showTranslationsPicker() {
        if (translations.isEmpty()) {
            Toast.makeText(this, "Нет озвучек", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] labels = new String[translations.size()];
        for (int i = 0; i < translations.size(); i++) {
            NativePlayerPayload.Translation t = translations.get(i);
            labels[i] = t.title + (t.kodikId.equals(kodikId) ? " ✓" : "");
        }
        new AlertDialog.Builder(this)
                .setTitle("Озвучка")
                .setItems(labels, (d, which) -> changeTranslation(translations.get(which).kodikId))
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
        main.removeCallbacks(hideChromeRunnable);
        if (scheduleHide && !awaitingContinueChoice) {
            scheduleHideChrome();
        }
    }

    private void hideChrome() {
        if (awaitingContinueChoice) return;
        chromeVisible = false;
        chromeTop.setVisibility(View.GONE);
        chromeBottom.setVisibility(View.GONE);
    }

    private void scheduleHideChrome() {
        main.removeCallbacks(hideChromeRunnable);
        main.postDelayed(hideChromeRunnable, CHROME_HIDE_MS);
    }

    private void setImmersive() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (!tvMode) return super.onKeyDown(keyCode, event);
        if (awaitingContinueChoice) return super.onKeyDown(keyCode, event);
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_LEFT:
                if (!chromeVisible) {
                    seekBy(-10);
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                if (!chromeVisible) {
                    seekBy(10);
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                if (!chromeVisible) {
                    togglePlayPause();
                    return true;
                }
                break;
            case KeyEvent.KEYCODE_DPAD_UP:
                if (!chromeVisible) {
                    showChrome(true);
                    btnEpisodes.requestFocus();
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
        if (!chromeVisible && keyCode != KeyEvent.KEYCODE_BACK) {
            showChrome(true);
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        if (chromeVisible && !awaitingContinueChoice && tvMode) {
            hideChrome();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (progressReporter != null) progressReporter.onPause();
    }

    @Override
    protected void onDestroy() {
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
}
