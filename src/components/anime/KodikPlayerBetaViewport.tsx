"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  KodikPlayer,
  type KodikPlayerHandle,
  type KodikPlayerPlaybackState,
  type KodikPlayerProgressPayload,
  type KodikPlayerResume,
} from "@/components/anime/KodikPlayer";
import {
  buildTimelineSegmentBackground,
  KodikPlayerBetaControls,
  type KodikPlayerBetaTheaterMode,
  type KodikPlayerTimelineSegment,
} from "@/components/anime/KodikPlayerBetaControls";
import { KodikPlayerBetaEpisodeStrip } from "@/components/anime/KodikPlayerBetaEpisodeStrip";
import { TaPlusIdleBackdrop } from "@/components/anime/TaPlusIdleBackdrop";
import { TaPlusPlayer, type TaPlusPlayerHandle } from "@/components/anime/TaPlusPlayer";
import { SiteClock } from "@/components/SiteClock";
import { TA_PLUS_QUALITY_AUTO } from "@/lib/ta-plus-master-playlist";
import { toTaPlusDisplayPreviewUrl } from "@/lib/ta-plus-previews";
import {
  listTaPlusTileSheetDisplayUrls,
  resolveTaPlusTilePreview,
  taPlusTilePreviewStyle,
  type TaPlusTiles,
} from "@/lib/ta-plus-tiles";
import { preloadTaPlusTileSheets } from "@/lib/ta-plus-tiles-preload";
import { coverCacheUrl } from "@/lib/poster";
import { formatWatchPosition } from "@/lib/watch-history";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { isTrackAnimeAndroidApp } from "@/lib/android-app";
import { toKodikPlayerEmbedUrl } from "@/lib/player-url";
import {
  focusTvElement,
  invalidateTvFocusableCache,
  isTvNavigationSessionActive,
} from "@/lib/tv-navigation";
import {
  applyPlayerBrightness,
  clearNativePlayerBrightness,
  hasNativePlayerBrightness,
  playerBrightnessOverlayOpacity,
  readStoredPlayerBrightness,
} from "@/lib/player-screen-brightness";
import {
  DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS,
  isDisplayWiderThan16x9,
  readPlayerAmbientGlowSettings,
  writePlayerAmbientGlowSettings,
  type PlayerAmbientGlowSettings,
} from "@/lib/player-ambient-glow";
import {
  readTaPlusVideoFitPreference,
  TA_PLUS_VIDEO_FIT_DEFAULT,
  writeTaPlusVideoFitPreference,
  type TaPlusVideoFit,
} from "@/lib/ta-plus-video-fit-preferences";
import {
  applyPlayerStreamVolume,
  clampPlayerStreamVolume,
  hasNativePlayerStreamVolume,
  readNativePlayerStreamVolume,
} from "@/lib/player-stream-volume";

const SINGLE_CLICK_DELAY_MS = 220;
/** Touch: wait longer so a slow double-tap doesn’t fire play/pause before dblclick. */
const TOUCH_SINGLE_CLICK_DELAY_MS = 350;
const CLICK_LAYER_APPEAR_DELAY_MS = 2_000;
/** Kodik iframe steals focus; reclaim on interaction/keydown so Space/arrows reach TA (no polling). */
const SEEK_FEEDBACK_MS = 900;
/** Center play/pause flash after isPlaying flips (click / Space / controls). */
const PLAY_PAUSE_FLASH_MS = 550;
const MOBILE_DOUBLE_TAP_SEEK_SECONDS = 10;
/** TA Plus mobile double-tap: accumulate ±10, apply once after idle (matches feedback fade). */
const MOBILE_TAP_SEEK_COMMIT_MS = SEEK_FEEDBACK_MS;
/** Fallback episode length for TA Plus scrub before HLS reports duration (~24 min). */
const TA_PLUS_IDLE_DURATION_FALLBACK_SECONDS = 24 * 60;
const MOBILE_DOCK_CONTROLS_MQ = "(max-width: 639px) and (orientation: portrait)";
const TOUCH_LIKE_MQ = "(hover: none), (pointer: coarse)";
const MOBILE_TRANSLATIONS_SWIPE_ZONE_PX = 96;
const MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX = 56;
const BRIGHTNESS_GESTURE_ACTIVATE_PX = 8;
const VOLUME_GESTURE_ACTIVATE_PX = 8;
/** Ignore volume/brightness if touch started near top (Android notification shade). */
const VOLUME_BRIGHTNESS_TOP_IGNORE_PX = 72;
/** Horizontal swipe seek: lock axis after this distance. */
const SEEK_GESTURE_ACTIVATE_PX = 24;
/** Ignore horizontal seek if touch started near left/right edge (system back). */
const SEEK_GESTURE_EDGE_IGNORE_PX = 20;
/** Horizontal swipe seek: ±10s per this fraction of shell width. */
const SEEK_GESTURE_STEP_RATIO = 0.05;
/** Guide label/target: ±(steps × 10s) from gesture origin (9 × 10 = ±90). */
const SEEK_GESTURE_GUIDE_STEPS = 9;
/**
 * Place markers slightly past the trunc boundary (9.5 × step ≈ ±95s distance)
 * so the finger on the circle already yields ±90 (`Math.trunc`), not ±80.
 */
const SEEK_GESTURE_GUIDE_PLACE_STEPS = 9.5;
const SEEK_GESTURE_GUIDE_SIZE_PX = 40;
/** Intermediate notch height (px); ends use the round ±90 caps. */
const SEEK_GESTURE_GUIDE_TICK_H_PX = 12;
const SEEK_GESTURE_GUIDE_TICK_W_PX = 2;
const BRIGHTNESS_HUD_MS = 900;
const VOLUME_HUD_MS = 900;

function clampSeekGuideCoord(ideal: number, shellSize: number, half: number): number {
  if (shellSize <= half * 2) return shellSize / 2;
  return Math.min(Math.max(ideal, half), shellSize - half);
}

function seekGuidePointStyle(
  idealX: number,
  idealY: number,
  shellWidth: number,
  shellHeight: number,
  half: number,
): { left: number; top: number; opacity: number } {
  const left = clampSeekGuideCoord(idealX, shellWidth, half);
  const top = clampSeekGuideCoord(idealY, shellHeight, half);
  const drift = Math.hypot(left - idealX, top - idealY);
  const fadeSpan = Math.max(shellWidth * 0.25, 48);
  const opacity = Math.max(0.35, 1 - drift / fadeSpan);
  return { left, top, opacity };
}
const KODIK_NATIVE_SKIP_PASSTHROUGH_WIDTH = "min(18rem, 44vw)";
const KODIK_NATIVE_SKIP_PASSTHROUGH_HEIGHT = "3.75rem";
const KODIK_NATIVE_SKIP_PASSTHROUGH_RIGHT = "0.5rem";
/** Clearance above normal TA bottom chrome so Kodik OP/ED skip stays clickable. */
const KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM = "4.25rem";
/** Same hole raised for `playerLargeUi` — taller TA controls (~3rem buttons + padding). */
const KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM_LARGE = "5.75rem";
/** Hole over Kodik’s big center play/pause so TA chrome doesn’t steal the tap. */
const KODIK_CENTER_PLAY_HOLE = "min(10.5rem, 34vmin)";
const KODIK_CENTER_PLAY_HOLE_HALF = "min(5.25rem, 17vmin)";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

export type KodikPlayerBetaBackend = "kodik" | "taplus";

type Props = {
  playerRef: RefObject<KodikPlayerHandle | null>;
  playerKey: string;
  src: string;
  title: string;
  sizeMode: "default" | "viewport";
  initialResume?: KodikPlayerResume | null;
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  currentEpisode: number;
  playback: KodikPlayerPlaybackState;
  timelineSegments?: KodikPlayerTimelineSegment[];
  fullscreenActive: boolean;
  theaterMode: KodikPlayerBetaTheaterMode;
  seekSkipLabelSeconds: number;
  controlsDisabled?: boolean;
  keepUiVisible?: boolean;
  continueOverlay?: ReactNode;
  continueAction?: ReactNode;
  skipAction?: ReactNode;
  /** Default Kodik iframe; `taplus` = HLS via TaPlusPlayer. */
  backend?: KodikPlayerBetaBackend;
  qualities?: Record<string, string>;
  quality?: string | null;
  onQualityChange?: (quality: string) => void;
  tiles?: TaPlusTiles | null;
  /** Full-frame idle previews for TA Plus (screenshots / CDN thumbs). */
  previews?: string[] | null;
  /** Optional known episode length (AniSkip / last play) for idle scrub before HLS. */
  episodeDurationHint?: number | null;
  /** HLS recovery — re-fetch /taplus with refresh=1 (parent). */
  onStreamFailed?: () => void;
  /** Parent `/taplus` in flight (silent refresh / episode load). */
  streamLoading?: boolean;
  /**
   * Mount+play HLS immediately (Continue / deep-link «Воспроизвести»).
   * Balancer switch alone must NOT set this — idle storyboard stays until user plays.
   */
  autoStart?: boolean;
  onReady?: () => void;
  onContinueStateChange?: (active: boolean) => void;
  onProgress?: (payload: KodikPlayerProgressPayload) => void;
  onPause?: (payload: {
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  }) => void;
  onTranslationChange?: (translation: { id: number; title: string }) => void;
  onPlaybackStateChange?: (state: KodikPlayerPlaybackState) => void;
  onEpisodeSelect: (seasonNumber: number, episodeNumber: number, playerLink?: string | null) => void;
  onPlayPause: () => void;
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  previousEpisodeDisabled?: boolean;
  nextEpisodeDisabled?: boolean;
  onSeek: (seconds: number) => void;
  onSeekSkip: (deltaSeconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onTheaterToggle: () => void;
  onFullscreenToggle: () => void;
  onFullscreenTranslationsIntent?: (open: boolean) => void;
  fullscreenTranslationsOpen?: boolean;
  onEnded?: (progress?: KodikPlayerProgressPayload | null) => void;
};

export function KodikPlayerBetaViewport({
  playerRef,
  playerKey,
  src,
  title,
  sizeMode,
  initialResume,
  shikimoriId,
  kodikId,
  seasonNumber,
  currentEpisode,
  playback,
  timelineSegments = [],
  fullscreenActive,
  theaterMode,
  seekSkipLabelSeconds,
  controlsDisabled = false,
  keepUiVisible = false,
  continueOverlay,
  continueAction,
  skipAction,
  backend = "kodik",
  qualities = {},
  quality = null,
  onQualityChange,
  tiles = null,
  previews = null,
  episodeDurationHint = null,
  onStreamFailed,
  streamLoading = false,
  autoStart = false,
  onReady,
  onContinueStateChange,
  onProgress,
  onPause,
  onTranslationChange,
  onPlaybackStateChange,
  onEpisodeSelect,
  onPlayPause,
  onPreviousEpisode,
  onNextEpisode,
  previousEpisodeDisabled = false,
  nextEpisodeDisabled = false,
  onSeek,
  onSeekSkip,
  onVolumeChange,
  onMuteToggle,
  onTheaterToggle,
  onFullscreenToggle,
  onFullscreenTranslationsIntent,
  fullscreenTranslationsOpen = false,
  onEnded,
}: Props) {
  const { settings } = useSiteSettings();
  const isTaPlus = backend === "taplus";
  const [uiVisible, setUiVisible] = useState(true);
  const [kodikUiAccess, setKodikUiAccess] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [bufferedEndSeconds, setBufferedEndSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [activeQualityHeight, setActiveQualityHeight] = useState<number | null>(null);
  /** HLS not mounted until user hits play (idle storyboard backdrop). */
  const [taPlusStarted, setTaPlusStarted] = useState(false);
  /** Logical settings — kept even when display AR ≤ 16:9 (runtime glow stays off). */
  const [ambientGlowSettings, setAmbientGlowSettings] = useState<PlayerAmbientGlowSettings>(
    () => ({ ...DEFAULT_PLAYER_AMBIENT_GLOW_SETTINGS }),
  );
  const [videoFit, setVideoFit] = useState<TaPlusVideoFit>(TA_PLUS_VIDEO_FIT_DEFAULT);
  const [displayWiderThan16x9, setDisplayWiderThan16x9] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  /** Scrub position while HLS is not mounted yet. */
  const [idleSeekSeconds, setIdleSeekSeconds] = useState(() => {
    const fromResume = initialResume?.positionSeconds;
    return fromResume != null && Number.isFinite(fromResume) && fromResume >= 0 ? fromResume : 0;
  });
  const lastKnownDurationRef = useRef(0);
  const pendingPlayAfterStartRef = useRef(false);
  /**
   * After first play/Continue in this TA Plus session, keep HLS auto-starting on
   * episode changes (auto-next). Reset when leaving TA Plus.
   */
  const taPlusSessionUnlockedRef = useRef(false);
  const [dockControlsBelow, setDockControlsBelow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_DOCK_CONTROLS_MQ).matches;
  });
  const [touchLikeUi, setTouchLikeUi] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(TOUCH_LIKE_MQ).matches;
  });
  const [tvNavActive, setTvNavActive] = useState(() => {
    if (typeof document === "undefined") return false;
    return isTvNavigationSessionActive();
  });
  /** Keep chrome visible while TV focus is on episodes / bottom bar (not center seek surface). */
  const [tvChromePinned, setTvChromePinned] = useState(false);
  const primaryFocusDoneRef = useRef(false);
  const [seekFeedback, setSeekFeedback] = useState({ backward: 0, forward: 0 });
  /** ±90s drag targets while horizontal seek swipe is active. */
  const [seekGuide, setSeekGuide] = useState<{
    originX: number;
    originY: number;
    stepPx: number;
    shellWidth: number;
    shellHeight: number;
  } | null>(null);
  /** Brief center icon when playback starts/pauses (`key` restarts CSS animation). */
  const [playPauseFlash, setPlayPauseFlash] = useState<"play" | "pause" | null>(null);
  const [playPauseFlashKey, setPlayPauseFlashKey] = useState(0);
  /** Storyboard target while ±seek feedback is visible (TA Plus). */
  const [seekPreview, setSeekPreview] = useState<{
    seconds: number;
    side: "backward" | "forward";
  } | null>(null);
  const [brightnessHud, setBrightnessHud] = useState<number | null>(null);
  const [volumeHud, setVolumeHud] = useState<number | null>(null);
  const [overlayBrightness, setOverlayBrightness] = useState(1);
  const [nativeBrightness, setNativeBrightness] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const [qualityPanelActive, setQualityPanelActive] = useState(false);
  const [clickLayerArmed, setClickLayerArmed] = useState(false);
  /** Android WebView only: pass taps through to Kodik while continue/episode switch loads. */
  const [passThroughUntilPlay, setPassThroughUntilPlay] = useState(false);
  const [androidShell, setAndroidShell] = useState(false);
  const seekFeedbackTimersRef = useRef<{ backward: number | null; forward: number | null }>({
    backward: null,
    forward: null,
  });
  const seekFeedbackRef = useRef(seekFeedback);
  seekFeedbackRef.current = seekFeedback;
  const playPauseFlashTimerRef = useRef<number | null>(null);
  const prevPlayingForFlashRef = useRef<boolean | null>(null);
  /** TA Plus touch double-tap: net ±seconds waiting for idle commit. */
  const pendingMobileSeekDeltaRef = useRef(0);
  const pendingMobileSeekBaseRef = useRef(0);
  const pendingMobileSeekTimerRef = useRef<number | null>(null);
  /** Latest scrub position/duration for tap-seek preview (updated each render). */
  const playbackAnchorRef = useRef({ position: 0, duration: 0 });
  const brightnessHudTimerRef = useRef<number | null>(null);
  const volumeHudTimerRef = useRef<number | null>(null);
  const brightnessValueRef = useRef(readStoredPlayerBrightness());
  const volumeValueRef = useRef(1);
  const suppressClickAfterGestureRef = useRef(false);
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    startedNearTop: boolean;
    startedNearBottom: boolean;
    startedNearHorizontalEdge: boolean;
    startedOnRight: boolean;
    startedOnLeft: boolean;
    mode: "none" | "brightness" | "volume" | "translations" | "seek";
    startBrightness: number;
    startVolume: number;
    shellHeight: number;
    shellWidth: number;
    /** Playback position when seek gesture locked. */
    seekBasePosition: number;
    /** Signed ±10s steps already shown in HUD for this gesture. */
    lastSeekSteps: number;
  } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  /** Local copy for timeline UI — parent skips position-only React updates to avoid panel thrash. */
  const [viewPlayback, setViewPlayback] = useState(playback);
  const playbackRef = useRef(viewPlayback);
  const volumeReady = viewPlayback.durationSeconds > 0;
  const controlsDocked = dockControlsBelow && !fullscreenActive;
  // Overlay only when native device/window brightness is unavailable (browser/PWA).
  const brightnessOverlay = nativeBrightness
    ? 0
    : playerBrightnessOverlayOpacity(overlayBrightness);

  useEffect(() => {
    playbackRef.current = viewPlayback;
  }, [viewPlayback]);

  // Sync rare fields from parent (watch party play/pause, remount); keep fresher local position.
  useEffect(() => {
    setViewPlayback((previous) => {
      if (
        previous.isPlaying === playback.isPlaying &&
        previous.durationSeconds === playback.durationSeconds &&
        previous.volume === playback.volume &&
        previous.muted === playback.muted &&
        previous.mediaUnlocked === playback.mediaUnlocked &&
        previous.videoReady === playback.videoReady
      ) {
        return previous;
      }
      return {
        ...previous,
        isPlaying: playback.isPlaying,
        durationSeconds: playback.durationSeconds,
        volume: playback.volume,
        muted: playback.muted,
        mediaUnlocked: playback.mediaUnlocked,
        videoReady: playback.videoReady,
      };
    });
  }, [
    playback.isPlaying,
    playback.durationSeconds,
    playback.volume,
    playback.muted,
    playback.mediaUnlocked,
    playback.videoReady,
  ]);

  const handlePlaybackStateChange = useCallback(
    (state: KodikPlayerPlaybackState) => {
      setViewPlayback(state);
      onPlaybackStateChange?.(state);
    },
    [onPlaybackStateChange],
  );

  useEffect(() => {
    setNativeBrightness(hasNativePlayerBrightness());
    brightnessValueRef.current = readStoredPlayerBrightness();
    if (hasNativePlayerStreamVolume()) {
      const native = readNativePlayerStreamVolume();
      if (native != null) volumeValueRef.current = native;
    }
  }, []);

  useEffect(() => {
    setAmbientGlowSettings(readPlayerAmbientGlowSettings());
    setVideoFit(readTaPlusVideoFitPreference());
    const syncWide = () => setDisplayWiderThan16x9(isDisplayWiderThan16x9());
    syncWide();
    window.addEventListener("resize", syncWide);
    window.addEventListener("orientationchange", syncWide);
    return () => {
      window.removeEventListener("resize", syncWide);
      window.removeEventListener("orientationchange", syncWide);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (hasNativePlayerStreamVolume()) return;
    volumeValueRef.current = clampPlayerStreamVolume(playback.volume);
  }, [playback.volume]);

  useEffect(() => {
    if (fullscreenActive) {
      const applied = applyPlayerBrightness(readStoredPlayerBrightness());
      brightnessValueRef.current = applied.value;
      setNativeBrightness(applied.native);
      if (applied.native) {
        setOverlayBrightness(1);
      } else {
        setOverlayBrightness(applied.value);
      }
      return;
    }
    clearNativePlayerBrightness();
  }, [fullscreenActive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCastAvailable("PresentationRequest" in window && "presentation" in navigator);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(MOBILE_DOCK_CONTROLS_MQ);
    const sync = () => setDockControlsBelow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(TOUCH_LIKE_MQ);
    const sync = () => setTouchLikeUi(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setAndroidShell(isTrackAnimeAndroidApp());
  }, []);

  useEffect(() => {
    if (!androidShell) {
      setPassThroughUntilPlay(false);
      return;
    }
    if (controlsDisabled) {
      setPassThroughUntilPlay(true);
      return;
    }
    // Loading finished — always restore TA chrome. Clearing only on isPlaying left
    // Continue / controls / center play stuck after load while still paused (common on
    // Android tablets: page header «Продолжить» vanishes in fullscreen).
    setPassThroughUntilPlay(false);
  }, [androidShell, controlsDisabled]);

  // Effective only inside the Android WebView shell — desktop/browser keep previous hit-testing.
  const passThroughHits = androidShell && passThroughUntilPlay;

  useEffect(() => {
    if (!viewPlayback.mediaUnlocked || passThroughHits) {
      setClickLayerArmed(false);
      return;
    }
    const timer = window.setTimeout(() => setClickLayerArmed(true), CLICK_LAYER_APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [viewPlayback.mediaUnlocked, passThroughHits]);

  const reclaimFocusFromKodikIframe = useCallback(() => {
    if (kodikUiAccess || qualityPanelActive || passThroughHits) return;
    if (!viewPlayback.mediaUnlocked) return;
    if (!document.hasFocus()) return;
    const root = viewportRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLIFrameElement) || !root.contains(active)) return;
    root.focus({ preventScroll: true });
  }, [
    kodikUiAccess,
    passThroughHits,
    qualityPanelActive,
    viewPlayback.mediaUnlocked,
  ]);

  useEffect(() => {
    const sync = () => setTvNavActive(isTvNavigationSessionActive());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-tv-nav", "data-tv-nav-enabled"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = async () => {
      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (!wakeLock || wakeLock.released) return;
      try {
        await wakeLock.release();
      } catch {
        /* Wake Lock release can fail if the browser already revoked it. */
      }
    };

    const requestWakeLock = async () => {
      if (!viewPlayback.isPlaying || document.visibilityState !== "visible") {
        await releaseWakeLock();
        return;
      }
      if (wakeLockRef.current || !("wakeLock" in navigator)) return;

      try {
        const wakeLock = await (navigator as WakeLockNavigator).wakeLock?.request("screen");
        if (cancelled || !wakeLock) {
          await wakeLock?.release();
          return;
        }
        wakeLockRef.current = wakeLock;
        const onRelease = () => {
          wakeLock.removeEventListener("release", onRelease);
          if (wakeLockRef.current === wakeLock) wakeLockRef.current = null;
        };
        wakeLock.addEventListener("release", onRelease);
      } catch {
        /* Unsupported, denied by the browser, or not triggered from an allowed context. */
      }
    };

    const onVisibilityChange = () => {
      void requestWakeLock();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void requestWakeLock();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseWakeLock();
    };
  }, [viewPlayback.isPlaying]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (
      !viewPlayback.isPlaying ||
      controlsDisabled ||
      kodikUiAccess ||
      keepUiVisible ||
      tvChromePinned
    ) {
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setUiVisible(false);
      onFullscreenTranslationsIntent?.(false);
      viewportRef.current
        ?.closest(".kodik-player-beta-stage:fullscreen")
        ?.scrollTo({ top: 0, behavior: "smooth" });
      hideTimerRef.current = null;
    }, settings.playerControlsIdleMs);
  }, [
    clearHideTimer,
    controlsDisabled,
    keepUiVisible,
    kodikUiAccess,
    onFullscreenTranslationsIntent,
    viewPlayback.isPlaying,
    settings.playerControlsIdleMs,
    tvChromePinned,
  ]);

  useEffect(() => {
    if (!tvNavActive) {
      setTvChromePinned(false);
      return;
    }

    const root = viewportRef.current;
    if (!root) return;

    const syncTvChromePin = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !root.contains(active)) {
        setTvChromePinned(false);
        return;
      }
      setUiVisible(true);
      // Center seek surface may auto-hide; bar / episodes / continue stay visible.
      const pinChrome = !active.hasAttribute("data-tv-player-seek-keys");
      setTvChromePinned(pinChrome);
      if (pinChrome) {
        clearHideTimer();
      } else {
        scheduleHide();
      }
    };

    const onFocusOut = () => {
      window.setTimeout(syncTvChromePin, 0);
    };

    root.addEventListener("focusin", syncTvChromePin);
    root.addEventListener("focusout", onFocusOut);
    syncTvChromePin();
    return () => {
      root.removeEventListener("focusin", syncTvChromePin);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, [tvNavActive, clearHideTimer, scheduleHide]);

  useEffect(() => {
    if (!fullscreenActive) {
      primaryFocusDoneRef.current = false;
    }
  }, [fullscreenActive]);

  useEffect(() => {
    // One-shot: only when entering fullscreen while paused (Continue / bottom Play).
    if (!tvNavActive || !fullscreenActive || viewPlayback.isPlaying || controlsDisabled) return;
    if (primaryFocusDoneRef.current) return;

    const focusPrimary = () => {
      const root = viewportRef.current;
      if (!root) return false;
      const primary = root.querySelector<HTMLElement>("[data-tv-player-primary]");
      if (!primary) return false;
      if (primary instanceof HTMLButtonElement && primary.disabled) return false;
      if (primaryFocusDoneRef.current) return true;
      primaryFocusDoneRef.current = true;
      setUiVisible(true);
      clearHideTimer();
      invalidateTvFocusableCache();
      focusTvElement(primary);
      return true;
    };

    let retryId: number | null = null;
    const timer = window.setTimeout(() => {
      if (focusPrimary()) return;
      let tries = 0;
      retryId = window.setInterval(() => {
        tries += 1;
        if (focusPrimary() || tries >= 20) {
          if (retryId != null) window.clearInterval(retryId);
          retryId = null;
        }
      }, 100);
    }, 80);

    return () => {
      window.clearTimeout(timer);
      if (retryId != null) window.clearInterval(retryId);
    };
  }, [
    tvNavActive,
    fullscreenActive,
    viewPlayback.isPlaying,
    controlsDisabled,
    clearHideTimer,
  ]);

  const revealUi = useCallback(() => {
    if (kodikUiAccess) return;
    setUiVisible(true);
    scheduleHide();
  }, [kodikUiAccess, scheduleHide]);

  const handleAmbientGlowSettingsChange = useCallback(
    (patch: Partial<PlayerAmbientGlowSettings>) => {
      setAmbientGlowSettings((prev) => {
        const next = { ...prev, ...patch };
        writePlayerAmbientGlowSettings(next);
        return next;
      });
      revealUi();
    },
    [revealUi],
  );

  const handleVideoFitToggle = useCallback(() => {
    setVideoFit((prev) => {
      const next: TaPlusVideoFit = prev === "contain" ? "cover" : "contain";
      writeTaPlusVideoFitPreference(next);
      return next;
    });
    revealUi();
  }, [revealUi]);

  useEffect(() => {
    if (!isTaPlus) {
      setPipAvailable(false);
      setBufferedEndSeconds(0);
      return;
    }
    setPipAvailable(
      typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        Boolean(document.pictureInPictureEnabled),
    );
  }, [isTaPlus, playerKey]);

  useEffect(() => {
    if (!isTaPlus) return;
    const handle = playerRef.current as TaPlusPlayerHandle | null;
    handle?.setPlaybackRate(playbackRate);
  }, [isTaPlus, playerKey, playbackRate, playerRef]);

  const handlePictureInPicture = useCallback(() => {
    const handle = playerRef.current as TaPlusPlayerHandle | null;
    void handle?.requestPictureInPicture().catch(() => undefined);
  }, [playerRef]);

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      const handle = playerRef.current as TaPlusPlayerHandle | null;
      handle?.setPlaybackRate(rate);
      revealUi();
    },
    [playerRef, revealUi],
  );

  useEffect(() => {
    if (theaterMode !== "height") {
      document.documentElement.removeAttribute("data-player-theater-chrome");
      return;
    }
    document.documentElement.setAttribute(
      "data-player-theater-chrome",
      uiVisible ? "visible" : "hidden",
    );
    return () => {
      document.documentElement.removeAttribute("data-player-theater-chrome");
    };
  }, [theaterMode, uiVisible]);

  useEffect(() => {
    if (theaterMode !== "height") return;
    const onPointerMove = () => {
      revealUi();
    };
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
    };
  }, [theaterMode, revealUi]);

  const handleQualityPanelActiveChange = useCallback(
    (active: boolean) => {
      setQualityPanelActive(active);
      // Restart idle hide so the quality gap stays open until chrome auto-hides.
      if (active) revealUi();
    },
    [revealUi],
  );

  useEffect(() => {
    if (isTaPlus) {
      setKodikUiAccess(false);
      setQualityMenuOpen(false);
    }
  }, [isTaPlus, src, seasonNumber, currentEpisode]);

  useEffect(() => {
    setActiveQualityHeight(null);
    setBufferedEndSeconds(0);

    if (!isTaPlus) {
      taPlusSessionUnlockedRef.current = false;
      pendingPlayAfterStartRef.current = false;
      setTaPlusStarted(false);
      return;
    }

    // Continue / deep-link / already unlocked session (auto-next episode) → mount+play HLS.
    // Fresh balancer switch without Continue stays on idle until user hits play.
    if (autoStart || taPlusSessionUnlockedRef.current) {
      taPlusSessionUnlockedRef.current = true;
      pendingPlayAfterStartRef.current = true;
      setTaPlusStarted(true);
      return;
    }

    pendingPlayAfterStartRef.current = false;
    setTaPlusStarted(false);
  }, [isTaPlus, autoStart, kodikId, seasonNumber, currentEpisode]);

  useEffect(() => {
    const fromResume = initialResume?.positionSeconds;
    setIdleSeekSeconds(
      fromResume != null && Number.isFinite(fromResume) && fromResume >= 0 ? fromResume : 0,
    );
  }, [kodikId, seasonNumber, currentEpisode, isTaPlus]);

  useEffect(() => {
    if (!isTaPlus || taPlusStarted) return;
    const fromResume = initialResume?.positionSeconds;
    if (fromResume != null && Number.isFinite(fromResume) && fromResume >= 0) {
      setIdleSeekSeconds(fromResume);
    }
  }, [initialResume?.positionSeconds, isTaPlus, taPlusStarted]);

  useEffect(() => {
    if (viewPlayback.durationSeconds > 1) {
      lastKnownDurationRef.current = viewPlayback.durationSeconds;
    }
  }, [viewPlayback.durationSeconds]);

  const resolveTaPlusIdleDuration = useCallback(() => {
    if (viewPlayback.durationSeconds > 1) return viewPlayback.durationSeconds;
    if (episodeDurationHint != null && episodeDurationHint > 1) return episodeDurationHint;
    if (lastKnownDurationRef.current > 1) return lastKnownDurationRef.current;
    if (tiles) {
      const cols = Math.max(1, tiles.x);
      const rows = Math.max(1, tiles.y);
      const interval = Math.max(1, tiles.interval);
      return Math.max(
        TA_PLUS_IDLE_DURATION_FALLBACK_SECONDS,
        interval * cols * rows * 8,
      );
    }
    return TA_PLUS_IDLE_DURATION_FALLBACK_SECONDS;
  }, [episodeDurationHint, tiles, viewPlayback.durationSeconds]);

  // Warm all storyboard sheets in the background (scrub / ±seek preview).
  // Starts when tiles arrive; expands when HLS reports a longer duration.
  useEffect(() => {
    if (!isTaPlus || !tiles) return;
    const duration =
      viewPlayback.durationSeconds > 1
        ? viewPlayback.durationSeconds
        : resolveTaPlusIdleDuration();
    const urls = listTaPlusTileSheetDisplayUrls(tiles, duration);
    if (urls.length === 0) return;

    const controller = new AbortController();
    void preloadTaPlusTileSheets(urls, {
      concurrency: taPlusStarted ? 2 : 3,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [
    isTaPlus,
    tiles,
    taPlusStarted,
    viewPlayback.durationSeconds,
    episodeDurationHint,
    resolveTaPlusIdleDuration,
    kodikId,
    seasonNumber,
    currentEpisode,
  ]);

  const clearPlayPauseFlashTimer = useCallback(() => {
    if (playPauseFlashTimerRef.current != null) {
      window.clearTimeout(playPauseFlashTimerRef.current);
      playPauseFlashTimerRef.current = null;
    }
  }, []);

  const flashPlayPauseIcon = useCallback(
    (kind: "play" | "pause") => {
      // Align baseline so the isPlaying-effect does not flash twice when TA Plus
      // catches up after HLS start / toggle.
      prevPlayingForFlashRef.current = kind === "play";
      setPlayPauseFlash(kind);
      setPlayPauseFlashKey((key) => key + 1);
      clearPlayPauseFlashTimer();
      playPauseFlashTimerRef.current = window.setTimeout(() => {
        setPlayPauseFlash(null);
        playPauseFlashTimerRef.current = null;
      }, PLAY_PAUSE_FLASH_MS);
    },
    [clearPlayPauseFlashTimer],
  );

  // Episode remount: re-baseline without flashing (auto-next / continue).
  // Do NOT depend on `src` — TA Plus stream URL / quality changes would wipe the flash.
  useEffect(() => {
    prevPlayingForFlashRef.current = null;
    clearPlayPauseFlashTimer();
    setPlayPauseFlash(null);
  }, [kodikId, seasonNumber, currentEpisode, clearPlayPauseFlashTimer]);

  // Fallback for remote play/pause (watch party, media session). User toggles flash
  // eagerly via flashPlayPauseIcon in startTaPlusMedia / handlePlayPauseWithFlash.
  useEffect(() => {
    if (kodikUiAccess) {
      prevPlayingForFlashRef.current = viewPlayback.isPlaying;
      return;
    }
    if (prevPlayingForFlashRef.current === null) {
      prevPlayingForFlashRef.current = viewPlayback.isPlaying;
      return;
    }
    if (prevPlayingForFlashRef.current === viewPlayback.isPlaying) return;
    prevPlayingForFlashRef.current = viewPlayback.isPlaying;
    flashPlayPauseIcon(viewPlayback.isPlaying ? "play" : "pause");
  }, [flashPlayPauseIcon, kodikUiAccess, viewPlayback.isPlaying]);

  const handlePlayPauseWithFlash = useCallback(() => {
    flashPlayPauseIcon(playbackRef.current.isPlaying ? "pause" : "play");
    onPlayPause();
  }, [flashPlayPauseIcon, onPlayPause]);

  const startTaPlusMedia = useCallback(() => {
    if (!isTaPlus) {
      handlePlayPauseWithFlash();
      return;
    }
    if (taPlusStarted) {
      handlePlayPauseWithFlash();
      return;
    }
    // Idle → first HLS start: show play immediately (isPlaying flips later after mount).
    flashPlayPauseIcon("play");
    const duration = resolveTaPlusIdleDuration();
    const position = Math.min(Math.max(0, idleSeekSeconds), duration);
    // Only persist meaningful idle scrub — onSeek(0) flips taPlusSeekSeconds null→0 and
    // used to reload HLS via initialResume before play could stick.
    if (position >= 1) {
      onSeek(position);
    }
    taPlusSessionUnlockedRef.current = true;
    pendingPlayAfterStartRef.current = true;
    setTaPlusStarted(true);
    setUiVisible(true);
    scheduleHide();
  }, [
    flashPlayPauseIcon,
    handlePlayPauseWithFlash,
    idleSeekSeconds,
    isTaPlus,
    onSeek,
    resolveTaPlusIdleDuration,
    scheduleHide,
    taPlusStarted,
  ]);

  const handleTaPlusReady = useCallback(() => {
    onReady?.();
    // Session unlocked (auto-next / Continue) or explicit pending play after idle start.
    // onReady may seekTo(..., "pause") for watch party — respect that instead of forcing play.
    if (!pendingPlayAfterStartRef.current && !taPlusSessionUnlockedRef.current) return;
    pendingPlayAfterStartRef.current = false;
    const tryApplyStart = (attempt: number) => {
      const handle = playerRef.current as TaPlusPlayerHandle | null;
      if (!handle) {
        if (attempt < 8) window.setTimeout(() => tryApplyStart(attempt + 1), 50);
        return;
      }
      if (handle.getPendingResumeMode() === "pause") {
        handle.pause();
        return;
      }
      handle.play();
      const video = handle.getVideoElement();
      if (video?.paused && attempt < 8) {
        window.setTimeout(() => tryApplyStart(attempt + 1), 80);
      }
    };
    window.setTimeout(() => tryApplyStart(0), 0);
  }, [onReady, playerRef]);

  const toggleKodikUiAccess = useCallback(() => {
    if (isTaPlus) return;
    setKodikUiAccess((current) => {
      const next = !current;
      setUiVisible(!next);
      if (next) onFullscreenTranslationsIntent?.(false);
      if (!next) scheduleHide();
      return next;
    });
  }, [isTaPlus, onFullscreenTranslationsIntent, scheduleHide]);

  const clearClickTimer = useCallback(() => {
    if (clickTimerRef.current != null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const clearBrightnessHudTimer = useCallback(() => {
    if (brightnessHudTimerRef.current != null) {
      window.clearTimeout(brightnessHudTimerRef.current);
      brightnessHudTimerRef.current = null;
    }
  }, []);

  const clearVolumeHudTimer = useCallback(() => {
    if (volumeHudTimerRef.current != null) {
      window.clearTimeout(volumeHudTimerRef.current);
      volumeHudTimerRef.current = null;
    }
  }, []);

  const showBrightnessHud = useCallback(
    (value: number) => {
      clearBrightnessHudTimer();
      setBrightnessHud(value);
      brightnessHudTimerRef.current = window.setTimeout(() => {
        setBrightnessHud(null);
        brightnessHudTimerRef.current = null;
      }, BRIGHTNESS_HUD_MS);
    },
    [clearBrightnessHudTimer],
  );

  const showVolumeHud = useCallback(
    (value: number) => {
      clearVolumeHudTimer();
      setVolumeHud(value);
      volumeHudTimerRef.current = window.setTimeout(() => {
        setVolumeHud(null);
        volumeHudTimerRef.current = null;
      }, VOLUME_HUD_MS);
    },
    [clearVolumeHudTimer],
  );

  const setBrightnessFromGesture = useCallback(
    (value: number) => {
      const applied = applyPlayerBrightness(value);
      brightnessValueRef.current = applied.value;
      setNativeBrightness(applied.native);
      if (applied.native) {
        setOverlayBrightness(1);
      } else {
        setOverlayBrightness(applied.value);
      }
      showBrightnessHud(applied.value);
    },
    [showBrightnessHud],
  );

  const setVolumeFromGesture = useCallback(
    (value: number) => {
      const next = clampPlayerStreamVolume(value);
      const nativeApplied = applyPlayerStreamVolume(next);
      if (nativeApplied != null) {
        volumeValueRef.current = nativeApplied;
        showVolumeHud(nativeApplied);
        return;
      }
      volumeValueRef.current = next;
      playbackRef.current = { ...playbackRef.current, volume: next };
      onVolumeChange(next);
      showVolumeHud(next);
    },
    [onVolumeChange, showVolumeHud],
  );

  useEffect(() => {
    return () => {
      clearNativePlayerBrightness();
      clearBrightnessHudTimer();
      clearVolumeHudTimer();
    };
  }, [clearBrightnessHudTimer, clearVolumeHudTimer]);

  const clearSeekFeedbackTimer = useCallback((direction: "backward" | "forward") => {
    const timer = seekFeedbackTimersRef.current[direction];
    if (timer != null) {
      window.clearTimeout(timer);
      seekFeedbackTimersRef.current[direction] = null;
    }
  }, []);

  const showSeekFeedback = useCallback(
    (deltaSeconds: number) => {
      if (deltaSeconds === 0) return;
      const direction = deltaSeconds < 0 ? "backward" : "forward";
      clearSeekFeedbackTimer(direction);
      setSeekFeedback((current) => ({
        ...current,
        [direction]: current[direction] + Math.abs(deltaSeconds),
      }));
      seekFeedbackTimersRef.current[direction] = window.setTimeout(() => {
        setSeekFeedback((current) => {
          const next = { ...current, [direction]: 0 };
          if (next.backward === 0 && next.forward === 0) {
            setSeekPreview(null);
          }
          return next;
        });
        seekFeedbackTimersRef.current[direction] = null;
      }, SEEK_FEEDBACK_MS);
    },
    [clearSeekFeedbackTimer],
  );

  const updateSeekPreviewTarget = useCallback((seconds: number, side: "backward" | "forward") => {
    const duration = playbackAnchorRef.current.duration;
    const clamped =
      duration > 0 ? Math.min(Math.max(0, seconds), duration) : Math.max(0, seconds);
    setSeekPreview({ seconds: clamped, side });
  }, []);

  /** Absolute ±HUD while horizontal seek swipe is active (not additive like tap bursts). */
  const setSeekGestureHud = useCallback(
    (deltaSeconds: number, basePosition: number) => {
      clearSeekFeedbackTimer("backward");
      clearSeekFeedbackTimer("forward");
      if (deltaSeconds === 0) {
        setSeekFeedback({ backward: 0, forward: 0 });
        setSeekPreview(null);
        return;
      }
      const side = deltaSeconds < 0 ? "backward" : "forward";
      const abs = Math.abs(deltaSeconds);
      setSeekFeedback({
        backward: side === "backward" ? abs : 0,
        forward: side === "forward" ? abs : 0,
      });
      updateSeekPreviewTarget(basePosition + deltaSeconds, side);
    },
    [clearSeekFeedbackTimer, updateSeekPreviewTarget],
  );

  const armSeekFeedbackFade = useCallback(() => {
    const feedback = seekFeedbackRef.current;
    if (feedback.backward > 0) {
      clearSeekFeedbackTimer("backward");
      seekFeedbackTimersRef.current.backward = window.setTimeout(() => {
        setSeekFeedback((current) => {
          const next = { ...current, backward: 0 };
          if (next.forward === 0) setSeekPreview(null);
          return next;
        });
        seekFeedbackTimersRef.current.backward = null;
      }, SEEK_FEEDBACK_MS);
    }
    if (feedback.forward > 0) {
      clearSeekFeedbackTimer("forward");
      seekFeedbackTimersRef.current.forward = window.setTimeout(() => {
        setSeekFeedback((current) => {
          const next = { ...current, forward: 0 };
          if (next.backward === 0) setSeekPreview(null);
          return next;
        });
        seekFeedbackTimersRef.current.forward = null;
      }, SEEK_FEEDBACK_MS);
    }
  }, [clearSeekFeedbackTimer]);

  const applyTaPlusIdleSeek = useCallback(
    (seconds: number) => {
      const duration = resolveTaPlusIdleDuration();
      const next = Math.min(Math.max(0, seconds), duration);
      setIdleSeekSeconds(next);
      setViewPlayback((previous) => ({
        ...previous,
        positionSeconds: next,
        durationSeconds: duration,
      }));
      onSeek(next);
      return next;
    },
    [onSeek, resolveTaPlusIdleDuration],
  );

  const handleControlsSeek = useCallback(
    (seconds: number) => {
      if (isTaPlus && !taPlusStarted) {
        applyTaPlusIdleSeek(seconds);
        return;
      }
      onSeek(seconds);
    },
    [applyTaPlusIdleSeek, isTaPlus, onSeek, taPlusStarted],
  );

  const applySeekSkipDelta = useCallback(
    (deltaSeconds: number) => {
      if (deltaSeconds === 0) return;
      if (isTaPlus && !taPlusStarted) {
        applyTaPlusIdleSeek(idleSeekSeconds + deltaSeconds);
        return;
      }
      onSeekSkip(deltaSeconds);
    },
    [applyTaPlusIdleSeek, idleSeekSeconds, isTaPlus, onSeekSkip, taPlusStarted],
  );

  const clearPendingMobileSeekTimer = useCallback(() => {
    if (pendingMobileSeekTimerRef.current != null) {
      window.clearTimeout(pendingMobileSeekTimerRef.current);
      pendingMobileSeekTimerRef.current = null;
    }
  }, []);

  const flushPendingMobileSeek = useCallback(() => {
    clearPendingMobileSeekTimer();
    const total = pendingMobileSeekDeltaRef.current;
    pendingMobileSeekDeltaRef.current = 0;
    if (total !== 0) applySeekSkipDelta(total);
    return total;
  }, [applySeekSkipDelta, clearPendingMobileSeekTimer]);

  const queueMobileTapSeek = useCallback(
    (deltaSeconds: number) => {
      if (deltaSeconds === 0) return;
      if (pendingMobileSeekDeltaRef.current === 0) {
        pendingMobileSeekBaseRef.current = playbackAnchorRef.current.position;
      }
      pendingMobileSeekDeltaRef.current += deltaSeconds;
      const target = pendingMobileSeekBaseRef.current + pendingMobileSeekDeltaRef.current;
      updateSeekPreviewTarget(target, deltaSeconds < 0 ? "backward" : "forward");
      showSeekFeedback(deltaSeconds);
      clearPendingMobileSeekTimer();
      pendingMobileSeekTimerRef.current = window.setTimeout(() => {
        const total = pendingMobileSeekDeltaRef.current;
        pendingMobileSeekDeltaRef.current = 0;
        pendingMobileSeekTimerRef.current = null;
        applySeekSkipDelta(total);
      }, MOBILE_TAP_SEEK_COMMIT_MS);
    },
    [
      applySeekSkipDelta,
      clearPendingMobileSeekTimer,
      showSeekFeedback,
      updateSeekPreviewTarget,
    ],
  );

  const handleSeekSkip = useCallback(
    (deltaSeconds: number) => {
      // Buttons / keys apply immediately; flush any queued double-tap first.
      const flushed = flushPendingMobileSeek();
      applySeekSkipDelta(deltaSeconds);
      const side = deltaSeconds < 0 ? "backward" : "forward";
      updateSeekPreviewTarget(
        playbackAnchorRef.current.position + flushed + deltaSeconds,
        side,
      );
      showSeekFeedback(deltaSeconds);
    },
    [
      applySeekSkipDelta,
      flushPendingMobileSeek,
      showSeekFeedback,
      updateSeekPreviewTarget,
    ],
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.shiftKey) {
        revealUi();
        return;
      }

      revealUi();
    },
    [revealUi],
  );

  const markPlayerInteraction = useCallback(() => {
    reclaimFocusFromKodikIframe();
    viewportRef.current?.focus({ preventScroll: true });
  }, [reclaimFocusFromKodikIframe]);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (kodikUiAccess || passThroughHits) {
        touchGestureRef.current = null;
        return;
      }
      // Touch/mobile: single tap toggles UI via click handler — don't force-reveal here
      // or a show+hide race happens with toggle.
      if (!touchLikeUi) {
        revealUi();
      }

      const touch = event.touches[0];
      const shell = videoShellRef.current;
      if (!touch || !shell || event.touches.length > 1) {
        touchGestureRef.current = null;
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "button, input, a, .kodik-player-beta-controls, .kodik-player-beta-episodes, .kodik-player-beta-range",
        )
      ) {
        touchGestureRef.current = null;
        return;
      }

      const rect = shell.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        touchGestureRef.current = null;
        return;
      }

      const ratioX = (touch.clientX - rect.left) / rect.width;
      const startedOnRight = ratioX >= 0.5;
      const insetLeft = touch.clientX - rect.left;
      const insetRight = rect.right - touch.clientX;
      let startVolume = volumeValueRef.current;
      if (fullscreenActive && !startedOnRight) {
        if (hasNativePlayerStreamVolume()) {
          const native = readNativePlayerStreamVolume();
          if (native != null) startVolume = native;
        } else {
          startVolume = clampPlayerStreamVolume(playbackRef.current.volume);
        }
        volumeValueRef.current = startVolume;
      }
      touchGestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startedNearTop:
          fullscreenActive && touch.clientY - rect.top <= VOLUME_BRIGHTNESS_TOP_IGNORE_PX,
        startedNearBottom:
          fullscreenActive && rect.bottom - touch.clientY <= MOBILE_TRANSLATIONS_SWIPE_ZONE_PX,
        startedNearHorizontalEdge:
          insetLeft <= SEEK_GESTURE_EDGE_IGNORE_PX || insetRight <= SEEK_GESTURE_EDGE_IGNORE_PX,
        startedOnRight,
        startedOnLeft: !startedOnRight,
        mode: "none",
        startBrightness: brightnessValueRef.current,
        startVolume,
        shellHeight: rect.height,
        shellWidth: rect.width,
        seekBasePosition: playbackAnchorRef.current.position,
        lastSeekSteps: 0,
      };
      suppressClickAfterGestureRef.current = false;
    },
    [fullscreenActive, kodikUiAccess, passThroughHits, revealUi, touchLikeUi],
  );

  const handleTouchMove = useCallback(
    (_event: ReactTouchEvent<HTMLDivElement>) => {
      // Brightness / translations vertical handling lives on a non-passive capture listener
      // attached to the video shell (see useEffect above). React's touchmove is passive.
    },
    [],
  );

  /**
   * Finish volume/brightness/seek locked by preventDefault touchmove.
   * Must run from native shell/window listeners — React onTouchEnd often never fires
   * after non-passive preventDefault on Android WebView / Chrome.
   */
  const endLockedTouchGesture = useCallback(
    (applySeek: boolean): boolean => {
      const gesture = touchGestureRef.current;
      if (!gesture) return false;
      if (
        gesture.mode !== "seek" &&
        gesture.mode !== "brightness" &&
        gesture.mode !== "volume"
      ) {
        return false;
      }
      touchGestureRef.current = null;
      suppressClickAfterGestureRef.current = true;
      if (gesture.mode === "seek") {
        setSeekGuide(null);
        const total = gesture.lastSeekSteps * MOBILE_DOUBLE_TAP_SEEK_SECONDS;
        if (applySeek) {
          if (total !== 0) applySeekSkipDelta(total);
          armSeekFeedbackFade();
        } else {
          setSeekGestureHud(0, 0);
        }
      }
      return true;
    },
    [applySeekSkipDelta, armSeekFeedbackFade, setSeekGestureHud],
  );
  const endLockedTouchGestureRef = useRef(endLockedTouchGesture);
  endLockedTouchGestureRef.current = endLockedTouchGesture;

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (endLockedTouchGesture(true)) return;

      const gesture = touchGestureRef.current;
      touchGestureRef.current = null;
      const touch = event.changedTouches[0];
      if (!gesture || !touch) return;

      if (!gesture.startedNearBottom || fullscreenTranslationsOpen) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (
        deltaY < -MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
        Math.abs(deltaY) > Math.abs(deltaX) * 1.2
      ) {
        onFullscreenTranslationsIntent?.(true);
      }
    },
    [endLockedTouchGesture, fullscreenTranslationsOpen, onFullscreenTranslationsIntent],
  );

  // Non-passive listeners: React's synthetic touchmove is often passive, so preventDefault
  // never sticks and the browser/page steals the vertical swipe before brightness activates.
  useEffect(() => {
    const shell = videoShellRef.current;
    if (!shell || !touchLikeUi || kodikUiAccess || passThroughHits) return;

    const onTouchMove = (event: TouchEvent) => {
      const gesture = touchGestureRef.current;
      const touch = event.touches[0];
      if (!gesture || !touch || event.touches.length > 1) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (gesture.mode === "none") {
        if (
          gesture.startedNearBottom &&
          !fullscreenTranslationsOpen &&
          deltaY < -MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        ) {
          gesture.mode = "translations";
        } else if (
          fullscreenActive &&
          gesture.startedOnRight &&
          !gesture.startedNearBottom &&
          !gesture.startedNearTop &&
          Math.abs(deltaY) >= BRIGHTNESS_GESTURE_ACTIVATE_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        ) {
          gesture.mode = "brightness";
          clearClickTimer();
          suppressClickAfterGestureRef.current = true;
          setUiVisible(false);
        } else if (
          fullscreenActive &&
          gesture.startedOnLeft &&
          !gesture.startedNearBottom &&
          !gesture.startedNearTop &&
          Math.abs(deltaY) >= VOLUME_GESTURE_ACTIVATE_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        ) {
          gesture.mode = "volume";
          clearClickTimer();
          suppressClickAfterGestureRef.current = true;
          setUiVisible(false);
        } else if (
          !gesture.startedNearBottom &&
          !gesture.startedNearHorizontalEdge &&
          Math.abs(deltaX) >= SEEK_GESTURE_ACTIVATE_PX &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.2
        ) {
          gesture.mode = "seek";
          gesture.seekBasePosition = playbackAnchorRef.current.position;
          gesture.lastSeekSteps = 0;
          clearClickTimer();
          clearPendingMobileSeekTimer();
          pendingMobileSeekDeltaRef.current = 0;
          suppressClickAfterGestureRef.current = true;
          setUiVisible(false);
          const rect = shell.getBoundingClientRect();
          const stepPx = gesture.shellWidth * SEEK_GESTURE_STEP_RATIO;
          setSeekGuide({
            originX: gesture.startX - rect.left,
            originY: gesture.startY - rect.top,
            stepPx,
            shellWidth: gesture.shellWidth,
            shellHeight: gesture.shellHeight,
          });
        }
      }

      if (gesture.mode === "brightness") {
        event.preventDefault();
        const span = Math.max(gesture.shellHeight * 0.55, 140);
        setBrightnessFromGesture(gesture.startBrightness - deltaY / span);
      } else if (gesture.mode === "volume") {
        event.preventDefault();
        const span = Math.max(gesture.shellHeight * 0.55, 140);
        setVolumeFromGesture(gesture.startVolume - deltaY / span);
      } else if (gesture.mode === "seek") {
        event.preventDefault();
        const stepPx = gesture.shellWidth * SEEK_GESTURE_STEP_RATIO;
        const rawSteps = Math.trunc(deltaX / stepPx);
        if (rawSteps !== gesture.lastSeekSteps) {
          gesture.lastSeekSteps = rawSteps;
          setSeekGestureHud(
            rawSteps * MOBILE_DOUBLE_TAP_SEEK_SECONDS,
            gesture.seekBasePosition,
          );
        }
      } else if (gesture.mode === "translations") {
        if (
          deltaY < -MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        ) {
          event.preventDefault();
        }
      }
    };

    const onTouchEndOrCancel = (event: TouchEvent) => {
      // Still touching with another finger — keep the gesture.
      if (event.touches.length > 0) return;
      // Apply seek on cancel too: after preventDefault, Android often sends
      // touchcancel instead of touchend, and React onTouchEnd may never run.
      endLockedTouchGestureRef.current(true);
    };

    shell.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    shell.addEventListener("touchend", onTouchEndOrCancel, { capture: true });
    shell.addEventListener("touchcancel", onTouchEndOrCancel, { capture: true });
    window.addEventListener("touchend", onTouchEndOrCancel, true);
    window.addEventListener("touchcancel", onTouchEndOrCancel, true);
    return () => {
      shell.removeEventListener("touchmove", onTouchMove, true);
      shell.removeEventListener("touchend", onTouchEndOrCancel, true);
      shell.removeEventListener("touchcancel", onTouchEndOrCancel, true);
      window.removeEventListener("touchend", onTouchEndOrCancel, true);
      window.removeEventListener("touchcancel", onTouchEndOrCancel, true);
    };
  }, [
    clearClickTimer,
    clearPendingMobileSeekTimer,
    fullscreenActive,
    fullscreenTranslationsOpen,
    kodikUiAccess,
    passThroughHits,
    setBrightnessFromGesture,
    setSeekGestureHud,
    setVolumeFromGesture,
    touchLikeUi,
  ]);

  const handleCast = useCallback(async () => {
    const PresentationRequestCtor = (window as Window & {
      PresentationRequest?: new (urls: string[]) => {
        start: () => Promise<unknown>;
      };
    }).PresentationRequest;
    if (!PresentationRequestCtor) return;

    try {
      const request = new PresentationRequestCtor([toKodikPlayerEmbedUrl(src)]);
      await request.start();
    } catch {
      /* no compatible device, browser denied, or API unavailable */
    }
  }, [src]);

  const handleViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!fullscreenActive || kodikUiAccess || passThroughHits) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".kodik-player-beta-episodes-shell, .kodik-player-beta-progress, .kodik-player-beta-volume",
        )
      ) {
        return;
      }

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;

      event.preventDefault();
      event.stopPropagation();
      onFullscreenTranslationsIntent?.(delta > 0);
    },
    [fullscreenActive, kodikUiAccess, onFullscreenTranslationsIntent, passThroughHits],
  );

  useEffect(() => {
    if (kodikUiAccess) {
      clearHideTimer();
      setUiVisible(false);
      return;
    }

    if (!viewPlayback.isPlaying || controlsDisabled || keepUiVisible || tvChromePinned) {
      clearHideTimer();
      setUiVisible(true);
      return;
    }
    scheduleHide();
    return clearHideTimer;
  }, [
    clearHideTimer,
    controlsDisabled,
    keepUiVisible,
    kodikUiAccess,
    viewPlayback.isPlaying,
    scheduleHide,
    tvChromePinned,
  ]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      clearClickTimer();
      clearSeekFeedbackTimer("backward");
      clearSeekFeedbackTimer("forward");
      clearPlayPauseFlashTimer();
      clearPendingMobileSeekTimer();
      pendingMobileSeekDeltaRef.current = 0;
      setSeekPreview(null);
    };
  }, [
    clearClickTimer,
    clearHideTimer,
    clearPendingMobileSeekTimer,
    clearPlayPauseFlashTimer,
    clearSeekFeedbackTimer,
  ]);

  useEffect(() => {
    const focusPlayerChrome = (kind: "episodes" | "bar") => {
      const root = viewportRef.current;
      if (!root) return false;
      setUiVisible(true);
      clearHideTimer();
      invalidateTvFocusableCache();

      if (kind === "episodes") {
        const current =
          root.querySelector<HTMLElement>(
            ".kodik-player-beta-episodes button[aria-current='true']",
          ) ?? root.querySelector<HTMLElement>(".kodik-player-beta-episodes button:not([disabled])");
        if (!current) return false;
        focusTvElement(current);
        return true;
      }

      const continueBtn = root.querySelector<HTMLElement>("[data-tv-player-primary]");
      if (
        continueBtn &&
        continueBtn.hasAttribute("data-tv-player-primary") &&
        !continueBtn.hasAttribute("data-tv-player-seek-keys") &&
        !(continueBtn instanceof HTMLButtonElement && continueBtn.disabled)
      ) {
        focusTvElement(continueBtn);
        return true;
      }

      const barPlay =
        root.querySelector<HTMLElement>("[data-tv-player-bar-play]:not([disabled])") ??
        root.querySelector<HTMLElement>(".kodik-player-beta-controls button:not([disabled])");
      if (!barPlay) return false;
      focusTvElement(barPlay);
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      reclaimFocusFromKodikIframe();

      const target = event.target;
      const targetInput = target instanceof HTMLInputElement ? target : null;
      const isEditable =
        (targetInput != null &&
          !["button", "checkbox", "radio", "range"].includes(targetInput.type)) ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const activeElement = document.activeElement;
      const keyboardActive =
        fullscreenActive ||
        Boolean(activeElement && viewportRef.current?.contains(activeElement));

      const focusOnControl =
        activeElement instanceof HTMLElement &&
        activeElement !== viewportRef.current &&
        Boolean(viewportRef.current?.contains(activeElement)) &&
        (activeElement.tagName === "BUTTON" ||
          activeElement.tagName === "SELECT" ||
          activeElement.tagName === "A" ||
          activeElement.hasAttribute("data-tv-focus"));

      const seekKeysFocus =
        activeElement instanceof HTMLElement &&
        activeElement.hasAttribute("data-tv-player-seek-keys") &&
        Boolean(viewportRef.current?.contains(activeElement));

      const tvNavOn = isTvNavigationSessionActive();

      // TV: chrome buttons keep spatial nav + native OK. Seek surface owns arrows.
      if (tvNavOn && focusOnControl && !seekKeysFocus) {
        if (
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.code === "Space" ||
          event.key === "Enter" ||
          event.key === "MediaEnter"
        ) {
          return;
        }
      }

      if (tvNavOn && seekKeysFocus) {
        if (
          event.code === "Space" ||
          event.key === "Enter" ||
          event.key === "MediaEnter"
        ) {
          // Native button activation (play/pause).
          return;
        }
      }

      if (keyboardActive && event.key === "Tab") {
        event.preventDefault();
        return;
      }

      if (
        keyboardActive &&
        !isEditable &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        if (tvNavOn && seekKeysFocus) {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            handleSeekSkip(-10);
            return;
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            handleSeekSkip(10);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (event.repeat) return;
            if (!focusPlayerChrome("episodes") && volumeReady) {
              const nextVolume = Math.min(1, playbackRef.current.volume + 0.05);
              playbackRef.current = { ...playbackRef.current, volume: nextVolume };
              onVolumeChange(nextVolume);
            }
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (event.repeat) return;
            if (!focusPlayerChrome("bar") && volumeReady) {
              const nextVolume = Math.max(0, playbackRef.current.volume - 0.05);
              playbackRef.current = { ...playbackRef.current, volume: nextVolume };
              onVolumeChange(nextVolume);
            }
            return;
          }
        }

        if (event.code === "Space" || event.code === "KeyK") {
          event.preventDefault();
          if (event.repeat) return;
          if (isTaPlus) startTaPlusMedia();
          else handlePlayPauseWithFlash();
          return;
        }

        if (event.code === "KeyA") {
          event.preventDefault();
          handleSeekSkip(-90);
          return;
        }

        if (event.code === "KeyD") {
          event.preventDefault();
          handleSeekSkip(90);
          return;
        }

        if (event.code === "ArrowLeft" || event.code === "KeyJ") {
          event.preventDefault();
          handleSeekSkip(-10);
          return;
        }

        if (event.code === "ArrowRight" || event.code === "KeyL") {
          event.preventDefault();
          handleSeekSkip(10);
          return;
        }

        if (event.code === "ArrowUp") {
          event.preventDefault();
          if (!volumeReady) return;
          const nextVolume = Math.min(1, playbackRef.current.volume + 0.05);
          playbackRef.current = { ...playbackRef.current, volume: nextVolume };
          onVolumeChange(nextVolume);
          return;
        }

        if (event.code === "ArrowDown") {
          event.preventDefault();
          if (!volumeReady) return;
          const nextVolume = Math.max(0, playbackRef.current.volume - 0.05);
          playbackRef.current = { ...playbackRef.current, volume: nextVolume };
          onVolumeChange(nextVolume);
          return;
        }

        if (event.code === "KeyM") {
          event.preventDefault();
          if (!volumeReady) return;
          if (event.repeat) return;
          onMuteToggle();
          return;
        }

        if (event.code === "KeyF") {
          event.preventDefault();
          if (event.repeat) return;
          onFullscreenToggle();
          return;
        }

        if (event.code === "KeyT") {
          event.preventDefault();
          if (event.repeat) return;
          onTheaterToggle();
          return;
        }
      }

      if (isTaPlus || event.key !== "Shift" || !keyboardActive || isEditable) return;
      event.preventDefault();
      if (event.repeat) return;
      toggleKodikUiAccess();
    };

    const onBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) return;
        setKodikUiAccess(false);

        if (!document.hasFocus()) {
          clearHideTimer();
          if (
            playbackRef.current.isPlaying &&
            !controlsDisabled &&
            !keepUiVisible &&
            !tvChromePinned
          ) {
            setUiVisible(false);
            onFullscreenTranslationsIntent?.(false);
          }
          return;
        }

        setUiVisible(true);
        scheduleHide();
      }, 0);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    fullscreenActive,
    clearHideTimer,
    controlsDisabled,
    handlePlayPauseWithFlash,
    isTaPlus,
    onFullscreenToggle,
    onMuteToggle,
    startTaPlusMedia,
    handleSeekSkip,
    onTheaterToggle,
    onVolumeChange,
    onFullscreenTranslationsIntent,
    keepUiVisible,
    scheduleHide,
    toggleKodikUiAccess,
    volumeReady,
    tvChromePinned,
    reclaimFocusFromKodikIframe,
  ]);

  const resolveTouchSeekDelta = useCallback((clientX: number) => {
    const rect = videoShellRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    return ratio < 0.5 ? -MOBILE_DOUBLE_TAP_SEEK_SECONDS : MOBILE_DOUBLE_TAP_SEEK_SECONDS;
  }, []);

  const applyTouchSeekDelta = useCallback(
    (delta: number) => {
      if (isTaPlus) queueMobileTapSeek(delta);
      else handleSeekSkip(delta);
    },
    [handleSeekSkip, isTaPlus, queueMobileTapSeek],
  );

  const handleViewportClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (suppressClickAfterGestureRef.current) {
        suppressClickAfterGestureRef.current = false;
        clearClickTimer();
        return;
      }
      if (controlsDisabled || kodikUiAccess) return;

      // Touch seek burst: more taps add ±10 — never toggle play/pause while badge is up.
      if (touchLikeUi) {
        const feedback = seekFeedbackRef.current;
        const seekBurstActive =
          pendingMobileSeekDeltaRef.current !== 0 ||
          feedback.backward > 0 ||
          feedback.forward > 0;
        if (seekBurstActive) {
          const delta = resolveTouchSeekDelta(event.clientX);
          clearClickTimer();
          if (delta != null) applyTouchSeekDelta(delta);
          return;
        }
      }

      clearClickTimer();
      const clickDelay = touchLikeUi ? TOUCH_SINGLE_CLICK_DELAY_MS : SINGLE_CLICK_DELAY_MS;
      clickTimerRef.current = window.setTimeout(() => {
        // Hidden chrome: first tap only reveals UI.
        if (!uiVisible) {
          revealUi();
          clickTimerRef.current = null;
          return;
        }
        // TA Plus (YouTube-style): tap on the frame only toggles chrome.
        // Play/pause is the center button / bottom bar / Space — not the whole surface.
        if (isTaPlus) {
          clearHideTimer();
          setUiVisible(false);
          onFullscreenTranslationsIntent?.(false);
          clickTimerRef.current = null;
          return;
        }
        handlePlayPauseWithFlash();
        revealUi();
        clickTimerRef.current = null;
      }, clickDelay);
    },
    [
      applyTouchSeekDelta,
      clearClickTimer,
      clearHideTimer,
      controlsDisabled,
      handlePlayPauseWithFlash,
      isTaPlus,
      kodikUiAccess,
      onFullscreenTranslationsIntent,
      resolveTouchSeekDelta,
      revealUi,
      touchLikeUi,
      uiVisible,
    ],
  );

  const handleViewportDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      clearClickTimer();
      if (controlsDisabled || kodikUiAccess) return;

      // Phone / touch: double-tap left/right seeks; desktop keeps fullscreen toggle.
      if (touchLikeUi) {
        const delta = resolveTouchSeekDelta(event.clientX);
        if (delta == null) return;
        // Swallow the trailing click after dblclick so play/pause doesn’t fire.
        suppressClickAfterGestureRef.current = true;
        applyTouchSeekDelta(delta);
        return;
      }

      onFullscreenToggle();
    },
    [
      applyTouchSeekDelta,
      clearClickTimer,
      controlsDisabled,
      kodikUiAccess,
      onFullscreenToggle,
      resolveTouchSeekDelta,
      touchLikeUi,
    ],
  );

  const uiInteractive = uiVisible && !kodikUiAccess;
  const chromeHitTest = uiInteractive && !passThroughHits;
  const taPlusIdle = isTaPlus && !taPlusStarted;
  const firstPreview = previews?.find((url) => typeof url === "string" && url.trim()) ?? null;
  const taPlusPoster = firstPreview
    ? toTaPlusDisplayPreviewUrl(firstPreview)
    : coverCacheUrl(shikimoriId);
  const idleDurationSeconds = taPlusIdle ? resolveTaPlusIdleDuration() : 0;
  const duration = Math.max(
    taPlusIdle ? idleDurationSeconds : viewPlayback.durationSeconds,
    0,
  );
  const position = Math.min(
    Math.max(taPlusIdle ? idleSeekSeconds : viewPlayback.positionSeconds, 0),
    duration || (taPlusIdle ? idleSeekSeconds : viewPlayback.positionSeconds),
  );
  const progressMax = duration > 0 ? duration : Math.max(position, 1);
  playbackAnchorRef.current = { position, duration: progressMax };
  const seekTapTilePreview =
    isTaPlus && seekPreview != null && tiles
      ? resolveTaPlusTilePreview(tiles, seekPreview.seconds)
      : null;
  const seekTapPreviewChrome =
    seekTapTilePreview && seekPreview && tiles ? (
      <>
        <div
          className="overflow-hidden rounded-md border border-white/25 bg-black/85 shadow-xl"
          style={{
            ...taPlusTilePreviewStyle(
              {
                ...seekTapTilePreview,
                cellWidth: Math.max(160, seekTapTilePreview.cellWidth),
                cellHeight: Math.max(90, seekTapTilePreview.cellHeight),
              },
              tiles,
            ),
            width: Math.max(160, seekTapTilePreview.cellWidth),
            height: Math.max(90, seekTapTilePreview.cellHeight),
          }}
        />
        <span className="rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 shadow-lg backdrop-blur-sm">
          {formatWatchPosition(seekPreview.seconds)}
        </span>
      </>
    ) : null;
  const progressFill = `${(position / progressMax) * 100}%`;
  const timelineSegmentBackground = buildTimelineSegmentBackground(
    timelineSegments,
    duration,
  );
  // Until first media unlock (+ short delay), no click-layer — taps go to iframe (Android WebView first play).
  // After arming, the stub appears so mouse/taps can show/hide TA UI during watching.
  // Quality «Авто» press temporarily pass clicks through to Kodik.
  // During continue/episode switch, keep overlays non-hit-testable until playback resumes.
  const clickLayerInteractive =
    !kodikUiAccess &&
    clickLayerArmed &&
    !qualityPanelActive &&
    !passThroughHits;
  const hideCursor = viewPlayback.isPlaying && !uiInteractive && !kodikUiAccess;
  const clickLayerClass = [
    "absolute z-10 bg-transparent",
    "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]",
    "outline-none focus:outline-none focus-visible:outline-none",
    clickLayerInteractive ? "pointer-events-auto" : "pointer-events-none",
    hideCursor ? "" : "cursor-pointer",
    controlsDisabled ? "cursor-wait" : "",
  ].join(" ");
  const clickLayerStyle = hideCursor ? { cursor: "none" } : undefined;
  /** Kodik-only: bands with holes for native iframe UI (center play, OP/ED skip). */
  const showClickLayer = !isTaPlus && !controlsDocked && clickLayerArmed;
  /**
   * TA Plus: solid full-frame catcher — no Kodik passthrough holes.
   * Sits under chrome (z-20) so controls stay clickable; center hits this layer.
   * Also used when controls are docked below the frame.
   */
  const showTaPlusClickCatcher = isTaPlus && taPlusStarted && !kodikUiAccess;
  const taPlusCatcherInteractive = !controlsDisabled && !passThroughHits;
  /**
   * YouTube-style center play/pause while chrome is up.
   * Hit zone ≈ 45% × 45% of the frame; edges stay free for UI toggle and
   * double-tap ±seek. Visible icon stays compact; while playing the glyph is
   * opacity-0 until hover/focus over the hit zone.
   * Below chrome (z-20) and Continue/Skip (z-40) so those stay clickable on top.
   */
  const showTaPlusCenterPlay =
    showTaPlusClickCatcher &&
    uiVisible &&
    !passThroughHits &&
    !playPauseFlash &&
    seekFeedback.backward <= 0 &&
    seekFeedback.forward <= 0 &&
    brightnessHud == null &&
    volumeHud == null;
  const skipPassthroughBottom = settings.playerLargeUi
    ? KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM_LARGE
    : KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM;
  const clickLayerAboveSkipBottom = `calc(${skipPassthroughBottom} + ${KODIK_NATIVE_SKIP_PASSTHROUGH_HEIGHT})`;
  const centerHoleTop = `calc(50% - ${KODIK_CENTER_PLAY_HOLE_HALF})`;
  const centerHoleSideWidth = `calc(50% - ${KODIK_CENTER_PLAY_HOLE_HALF})`;

  const qualityKeys = Object.keys(qualities).sort((a, b) => Number(b) - Number(a));
  const qualityIsAuto = isTaPlus && (quality == null || quality === TA_PLUS_QUALITY_AUTO);
  const qualityLabel = !isTaPlus
    ? "Авто"
    : qualityIsAuto
      ? activeQualityHeight
        ? `Авто ${activeQualityHeight}p`
        : "Авто"
      : quality
        ? `${quality}p`
        : "Авто";
  const controlsPlayback = taPlusIdle
    ? {
        ...viewPlayback,
        durationSeconds: idleDurationSeconds,
        positionSeconds: Math.min(Math.max(0, idleSeekSeconds), idleDurationSeconds),
      }
    : viewPlayback;
  const bufferedRatio =
    isTaPlus && controlsPlayback.durationSeconds > 0 && !taPlusIdle
      ? Math.min(1, Math.max(0, bufferedEndSeconds / controlsPlayback.durationSeconds))
      : null;
  const hiddenBufferFill =
    bufferedRatio != null && Number.isFinite(bufferedRatio)
      ? `${Math.min(100, Math.max(0, bufferedRatio * 100))}%`
      : null;

  const ambientGlowActive =
    isTaPlus &&
    ambientGlowSettings.enabled &&
    displayWiderThan16x9 &&
    fullscreenActive &&
    !prefersReducedMotion;

  const controlsNode = (
    <KodikPlayerBetaControls
      disabled={controlsDisabled}
      playback={controlsPlayback}
      timelineSegments={timelineSegments}
      fullscreenActive={fullscreenActive}
      seekSkipLabelSeconds={seekSkipLabelSeconds}
      overlay={!controlsDocked}
      onPlayPause={isTaPlus ? startTaPlusMedia : handlePlayPauseWithFlash}
      onPreviousEpisode={onPreviousEpisode}
      onNextEpisode={onNextEpisode}
      previousEpisodeDisabled={previousEpisodeDisabled}
      nextEpisodeDisabled={nextEpisodeDisabled}
      onSeek={handleControlsSeek}
      onSeekSkip={handleSeekSkip}
      onVolumeChange={onVolumeChange}
      onMuteToggle={onMuteToggle}
      theaterMode={theaterMode}
      onTheaterToggle={onTheaterToggle}
      onFullscreenToggle={onFullscreenToggle}
      pipAvailable={isTaPlus && taPlusStarted && pipAvailable}
      onPictureInPicture={
        isTaPlus && taPlusStarted && pipAvailable ? handlePictureInPicture : undefined
      }
      castAvailable={!isTaPlus && castAvailable}
      onCast={isTaPlus ? undefined : handleCast}
      fullscreenTranslationsOpen={fullscreenTranslationsOpen}
      onFullscreenTranslationsToggle={() =>
        onFullscreenTranslationsIntent?.(!fullscreenTranslationsOpen)
      }
      interactive={controlsDocked ? !kodikUiAccess && !passThroughHits : chromeHitTest}
      controlsDocked={controlsDocked}
      qualityPanelIdleMs={settings.playerControlsIdleMs}
      onQualityPanelActiveChange={isTaPlus ? undefined : handleQualityPanelActiveChange}
      qualityLabel={qualityLabel}
      onQualityClick={
        isTaPlus
          ? () => {
              setQualityMenuOpen((open) => !open);
              revealUi();
            }
          : undefined
      }
      qualityPressed={isTaPlus ? qualityMenuOpen : undefined}
      bufferedRatio={bufferedRatio}
      tiles={isTaPlus ? tiles : null}
      playbackRate={playbackRate}
      onPlaybackRateChange={
        isTaPlus && taPlusStarted ? handlePlaybackRateChange : undefined
      }
      ambientGlowAvailable={isTaPlus && displayWiderThan16x9 && fullscreenActive}
      ambientGlowSettings={ambientGlowSettings}
      onAmbientGlowSettingsChange={
        isTaPlus && displayWiderThan16x9 && fullscreenActive
          ? handleAmbientGlowSettingsChange
          : undefined
      }
      videoFitAvailable={isTaPlus}
      videoFit={videoFit}
      videoFitDisabled={ambientGlowActive}
      onVideoFitToggle={isTaPlus ? handleVideoFitToggle : undefined}
      tvBarPlayPrimary={!continueAction}
    />
  );

  const seekGuideSeconds = SEEK_GESTURE_GUIDE_STEPS * MOBILE_DOUBLE_TAP_SEEK_SECONDS;
  const seekGuideRuler = seekGuide
    ? (() => {
        const { originX, originY, stepPx, shellWidth, shellHeight } = seekGuide;
        const placeOffset = SEEK_GESTURE_GUIDE_PLACE_STEPS * stepPx;
        const endHalf = SEEK_GESTURE_GUIDE_SIZE_PX / 2;
        const tickHalf = SEEK_GESTURE_GUIDE_TICK_W_PX / 2;
        const center = seekGuidePointStyle(originX, originY, shellWidth, shellHeight, 10);
        const backward = {
          ...seekGuidePointStyle(
            originX - placeOffset,
            originY,
            shellWidth,
            shellHeight,
            endHalf,
          ),
          reached: seekFeedback.backward >= seekGuideSeconds,
        };
        const forward = {
          ...seekGuidePointStyle(
            originX + placeOffset,
            originY,
            shellWidth,
            shellHeight,
            endHalf,
          ),
          reached: seekFeedback.forward >= seekGuideSeconds,
        };
        const lineLeft = Math.min(backward.left, forward.left);
        const lineRight = Math.max(backward.left, forward.left);
        const activeBackwardSteps = Math.floor(
          seekFeedback.backward / MOBILE_DOUBLE_TAP_SEEK_SECONDS,
        );
        const activeForwardSteps = Math.floor(
          seekFeedback.forward / MOBILE_DOUBLE_TAP_SEEK_SECONDS,
        );
        const ticks: Array<{
          key: string;
          left: number;
          top: number;
          opacity: number;
          active: boolean;
        }> = [];
        for (let i = 1; i <= SEEK_GESTURE_GUIDE_STEPS - 1; i++) {
          const back = seekGuidePointStyle(
            originX - i * stepPx,
            originY,
            shellWidth,
            shellHeight,
            tickHalf,
          );
          const fwd = seekGuidePointStyle(
            originX + i * stepPx,
            originY,
            shellWidth,
            shellHeight,
            tickHalf,
          );
          ticks.push({
            key: `b${i}`,
            ...back,
            active: activeBackwardSteps >= i,
          });
          ticks.push({
            key: `f${i}`,
            ...fwd,
            active: activeForwardSteps >= i,
          });
        }
        const activeLine =
          activeForwardSteps > 0
            ? {
                left: center.left,
                width: Math.max(0, forward.left - center.left) *
                  Math.min(1, activeForwardSteps / SEEK_GESTURE_GUIDE_PLACE_STEPS),
              }
            : activeBackwardSteps > 0
              ? {
                  left:
                    center.left -
                    Math.max(0, center.left - backward.left) *
                      Math.min(1, activeBackwardSteps / SEEK_GESTURE_GUIDE_PLACE_STEPS),
                  width:
                    Math.max(0, center.left - backward.left) *
                    Math.min(1, activeBackwardSteps / SEEK_GESTURE_GUIDE_PLACE_STEPS),
                }
              : null;
        return {
          center,
          backward,
          forward,
          ticks,
          lineLeft,
          lineWidth: Math.max(0, lineRight - lineLeft),
          lineTop: center.top,
          lineOpacity: Math.min(center.opacity, backward.opacity, forward.opacity),
          activeLine,
        };
      })()
    : null;

  const bottomStackNode = isTaPlus ? null : (
    <div className="kodik-player-beta-bottom-stack pointer-events-none space-y-1 px-2 pb-1 sm:space-y-2 sm:px-3">
      <div className="flex items-center justify-between gap-2">
        {!controlsDocked && (
          <button
            type="button"
            onClick={toggleKodikUiAccess}
            className={[
              "kodik-player-beta-kodik-ui-toggle inline-flex rounded-md border border-white/10 bg-black/35 px-[clamp(0.5rem,0.42vw,0.8rem)] py-[clamp(0.25rem,0.21vw,0.4rem)] text-[clamp(11px,0.58vw,15px)] font-medium text-white/85 backdrop-blur-sm transition hover:bg-black/50 hover:text-white",
              chromeHitTest ? "pointer-events-auto" : "pointer-events-none",
            ].join(" ")}
          >
            <span className="hidden sm:inline">
              Shift — {kodikUiAccess ? "интерфейс TA" : "интерфейс Kodik"}
            </span>
            <span className="sm:hidden">{kodikUiAccess ? "TA UI" : "Kodik UI"}</span>
          </button>
        )}
        <span className="hidden min-w-[7.5rem] sm:block" aria-hidden />
      </div>
    </div>
  );

  return (
    <div
      ref={viewportRef}
      tabIndex={-1}
      className={[
        "kodik-player-beta-viewport relative min-w-0",
        controlsDocked ? "kodik-player-beta-viewport--dock-controls" : "",
      ].join(" ")}
      data-player-keyboard-scope
      data-kodik-ui-access={kodikUiAccess ? "true" : undefined}
      onMouseMove={kodikUiAccess ? undefined : handleMouseMove}
      onMouseDown={kodikUiAccess ? undefined : markPlayerInteraction}
      onWheel={kodikUiAccess ? undefined : handleViewportWheel}
      onTouchStart={kodikUiAccess ? undefined : handleTouchStart}
      onTouchMove={kodikUiAccess ? undefined : handleTouchMove}
      onTouchEnd={kodikUiAccess ? undefined : handleTouchEnd}
      onTouchCancel={kodikUiAccess ? undefined : () => endLockedTouchGesture(true)}
      onFocusCapture={kodikUiAccess ? undefined : revealUi}
    >
      <div
        ref={videoShellRef}
        className={[
          "kodik-player-beta-video-shell relative min-w-0",
          sizeMode === "viewport" || fullscreenActive ? "h-full" : "",
        ].join(" ")}
      >
        {continueOverlay}
        {isTaPlus ? (
          <div
            className={[
              "relative min-w-0",
              sizeMode === "viewport" || fullscreenActive ? "h-full" : "",
            ].join(" ")}
          >
            {taPlusStarted ? (
              <TaPlusPlayer
                ref={playerRef as RefObject<TaPlusPlayerHandle | null>}
                key={playerKey}
                src={src || null}
                sizeMode={sizeMode}
                qualities={qualities}
                quality={quality}
                title={title}
                poster={taPlusPoster}
                seasonNumber={seasonNumber}
                episodeNumber={currentEpisode}
                initialResume={initialResume}
                ambientGlowActive={ambientGlowActive}
                ambientGlowSettings={{
                  blur: ambientGlowSettings.blur,
                  opacity: ambientGlowSettings.opacity,
                  brightness: ambientGlowSettings.brightness,
                  saturate: ambientGlowSettings.saturate,
                  scale: ambientGlowSettings.scale,
                  downscale: ambientGlowSettings.downscale,
                  updateIntervalMs: ambientGlowSettings.updateIntervalMs,
                }}
                videoFit={videoFit}
                onReady={handleTaPlusReady}
                onProgress={onProgress}
                onPause={onPause}
                onPlaybackStateChange={handlePlaybackStateChange}
                onEnded={onEnded}
                onStreamFailed={onStreamFailed}
                streamLoading={streamLoading}
                onBufferedEndChange={setBufferedEndSeconds}
                onActiveQualityChange={setActiveQualityHeight}
              />
            ) : (
              <TaPlusIdleBackdrop
                previews={previews}
                tiles={tiles}
                loading={controlsDisabled || !src}
                fillViewport={sizeMode === "viewport" || fullscreenActive}
                onPlay={startTaPlusMedia}
              />
            )}
          </div>
        ) : (
          <KodikPlayer
            ref={playerRef}
            key={playerKey}
            src={src}
            title={title}
            sizeMode={sizeMode}
            chromelessBeta
            initialResume={initialResume}
            activeEpisode={{ seasonNumber, episodeNumber: currentEpisode }}
            onReady={onReady}
            onContinueStateChange={onContinueStateChange}
            onProgress={onProgress}
            onPause={onPause}
            onTranslationChange={onTranslationChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onEnded={onEnded}
          />
        )}
        {isTaPlus && qualityMenuOpen && qualityKeys.length > 0 ? (
          <div
            className={[
              "kodik-player-beta-ta-chrome absolute z-40 min-w-[6.5rem] rounded-lg border border-white/15 bg-black/80 p-1.5 shadow-xl backdrop-blur-md",
              controlsDocked ? "bottom-2 right-2" : "bottom-14 right-3 sm:bottom-16",
              chromeHitTest ? "pointer-events-auto" : "pointer-events-none",
            ].join(" ")}
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Качество
            </p>
            <ul className="flex flex-col gap-0.5">
              <li>
                <button
                  type="button"
                  aria-pressed={qualityIsAuto}
                  onClick={() => {
                    // Keep / force playback after HLS remount for the new rendition.
                    taPlusSessionUnlockedRef.current = true;
                    pendingPlayAfterStartRef.current = true;
                    onQualityChange?.(TA_PLUS_QUALITY_AUTO);
                    setQualityMenuOpen(false);
                    revealUi();
                  }}
                  className={[
                    "w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition",
                    qualityIsAuto
                      ? "bg-white/15 text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  Авто
                  {qualityIsAuto && activeQualityHeight ? ` · ${activeQualityHeight}p` : ""}
                </button>
              </li>
              {qualityKeys.map((key) => {
                const active = !qualityIsAuto && key === quality;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        taPlusSessionUnlockedRef.current = true;
                        pendingPlayAfterStartRef.current = true;
                        onQualityChange?.(key);
                        setQualityMenuOpen(false);
                        revealUi();
                      }}
                      className={[
                        "w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition",
                        active
                          ? "bg-white/15 text-white"
                          : "text-white/75 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      {key}p
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {brightnessOverlay > 0.01 ? (
          <div
            className="pointer-events-none absolute inset-0 z-[5] bg-black"
            style={{ opacity: brightnessOverlay }}
            aria-hidden
          />
        ) : null}
        {brightnessHud != null ? (
          <div className="pointer-events-none absolute right-[10%] top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-white/15 bg-black/65 px-4 py-3 text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:right-[14%]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current opacity-90" aria-hidden>
              <path d="M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0-5.2.9 2.7h2.8l-2.3 1.7.9 2.7L12 12.7l-2.3 1.7.9-2.7-2.3-1.7h2.8L12 2.3Zm0 19.4-.9-2.7H8.3l2.3-1.7-.9-2.7 2.3 1.7 2.3-1.7-.9 2.7 2.3 1.7h-2.8L12 21.7Z" />
            </svg>
            <div className="flex h-24 w-1.5 flex-col justify-end overflow-hidden rounded-full bg-white/20">
              <div
                className="w-full rounded-full bg-white transition-[height] duration-75"
                style={{ height: `${Math.round(brightnessHud * 100)}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">{Math.round(brightnessHud * 100)}%</span>
          </div>
        ) : null}
        {volumeHud != null ? (
          <div className="pointer-events-none absolute left-[10%] top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-white/15 bg-black/65 px-4 py-3 text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:left-[14%]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current opacity-90" aria-hidden>
              <path d="M3 10v4h3.2L11 19V5L6.2 10H3Zm10.5 1.1v1.8a2.8 2.8 0 0 0 0-1.8Zm2.3-3.1v8a5.4 5.4 0 0 0 0-8Z" />
            </svg>
            <div className="flex h-24 w-1.5 flex-col justify-end overflow-hidden rounded-full bg-white/20">
              <div
                className="w-full rounded-full bg-white transition-[height] duration-75"
                style={{ height: `${Math.round(volumeHud * 100)}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">{Math.round(volumeHud * 100)}%</span>
          </div>
        ) : null}
        {showTaPlusClickCatcher ? (
          <div
            onClick={handleViewportClick}
            onDoubleClick={handleViewportDoubleClick}
            className={[
              "absolute inset-0 z-10 bg-transparent",
              "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]",
              "outline-none focus:outline-none focus-visible:outline-none",
              taPlusCatcherInteractive ? "pointer-events-auto" : "pointer-events-none",
              hideCursor ? "" : "cursor-pointer",
              controlsDisabled ? "cursor-wait" : "",
            ].join(" ")}
            style={hideCursor ? { cursor: "none" } : undefined}
            aria-hidden="true"
          />
        ) : null}
        {showClickLayer && !kodikUiAccess ? (
          <div
            className="kodik-player-beta-ta-chrome pointer-events-none absolute inset-0 z-10"
            aria-hidden="true"
          >
            {/* Top band — above Kodik center play hole */}
            <div
              onClick={handleViewportClick}
              onDoubleClick={handleViewportDoubleClick}
              className={clickLayerClass}
              style={{
                ...clickLayerStyle,
                insetInline: 0,
                top: 0,
                height: centerHoleTop,
              }}
            />
            {/* Left of center hole */}
            <div
              onClick={handleViewportClick}
              onDoubleClick={handleViewportDoubleClick}
              className={clickLayerClass}
              style={{
                ...clickLayerStyle,
                left: 0,
                top: centerHoleTop,
                width: centerHoleSideWidth,
                height: KODIK_CENTER_PLAY_HOLE,
              }}
            />
            {/* Right of center hole */}
            <div
              onClick={handleViewportClick}
              onDoubleClick={handleViewportDoubleClick}
              className={clickLayerClass}
              style={{
                ...clickLayerStyle,
                right: 0,
                top: centerHoleTop,
                width: centerHoleSideWidth,
                height: KODIK_CENTER_PLAY_HOLE,
              }}
            />
            {/* Below center hole, above Kodik skip passthrough */}
            <div
              onClick={handleViewportClick}
              onDoubleClick={handleViewportDoubleClick}
              className={clickLayerClass}
              style={{
                ...clickLayerStyle,
                insetInline: 0,
                top: `calc(50% + ${KODIK_CENTER_PLAY_HOLE_HALF})`,
                bottom: clickLayerAboveSkipBottom,
              }}
            />
            <div
              onClick={handleViewportClick}
              onDoubleClick={handleViewportDoubleClick}
              className={clickLayerClass}
              style={{
                ...clickLayerStyle,
                left: 0,
                right: `calc(${KODIK_NATIVE_SKIP_PASSTHROUGH_RIGHT} + ${KODIK_NATIVE_SKIP_PASSTHROUGH_WIDTH})`,
                bottom: skipPassthroughBottom,
                height: KODIK_NATIVE_SKIP_PASSTHROUGH_HEIGHT,
              }}
            />
            <div
              onClick={handleViewportClick}
              onDoubleClick={handleViewportDoubleClick}
              className={clickLayerClass}
              style={{
                ...clickLayerStyle,
                right: 0,
                bottom: skipPassthroughBottom,
                width: KODIK_NATIVE_SKIP_PASSTHROUGH_RIGHT,
                height: KODIK_NATIVE_SKIP_PASSTHROUGH_HEIGHT,
              }}
            />
            {fullscreenActive ? (
              <div
                className={[
                  "absolute inset-x-0 bottom-0 z-10",
                  clickLayerInteractive ? "pointer-events-auto" : "pointer-events-none",
                ].join(" ")}
                style={{ height: skipPassthroughBottom }}
              />
            ) : (
              <div
                onClick={handleViewportClick}
                onDoubleClick={handleViewportDoubleClick}
                className={clickLayerClass}
                style={{
                  ...clickLayerStyle,
                  insetInline: 0,
                  bottom: 0,
                  height: skipPassthroughBottom,
                }}
              />
            )}
          </div>
        ) : null}
        {fullscreenActive && settings.showClock ? (
          <div className="pointer-events-none absolute right-2 top-2 z-30 sm:right-3 sm:top-3">
            <SiteClock className="border-white/10 bg-black/45 text-white/90" />
          </div>
        ) : null}
        {skipAction && !kodikUiAccess ? (
          <div
            className={[
              "kodik-player-beta-ta-chrome pointer-events-none absolute inset-x-2 z-40 flex justify-center",
              controlsDocked
                ? "bottom-2"
                : settings.playerLargeUi
                  ? "bottom-20 sm:bottom-24"
                  : "bottom-14 sm:bottom-16",
            ].join(" ")}
          >
            {/* Keep skip clickable even when chrome auto-hides / Android passThrough. */}
            <div className="pointer-events-auto">{skipAction}</div>
          </div>
        ) : null}
        {seekGuideRuler ? (
          <div className="pointer-events-none absolute inset-0 z-[28]" aria-hidden>
            <div
              className="absolute h-0.5 -translate-y-1/2 rounded-full bg-white/25"
              style={{
                left: seekGuideRuler.lineLeft,
                top: seekGuideRuler.lineTop,
                width: seekGuideRuler.lineWidth,
                opacity: seekGuideRuler.lineOpacity,
              }}
            />
            {seekGuideRuler.activeLine && seekGuideRuler.activeLine.width > 0 ? (
              <div
                className="absolute h-0.5 -translate-y-1/2 rounded-full bg-white/70"
                style={{
                  left: seekGuideRuler.activeLine.left,
                  top: seekGuideRuler.lineTop,
                  width: seekGuideRuler.activeLine.width,
                  opacity: seekGuideRuler.lineOpacity,
                }}
              />
            ) : null}
            {seekGuideRuler.ticks.map((tick) => (
              <div
                key={tick.key}
                className={[
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-sm",
                  tick.active ? "bg-white/85" : "bg-white/35",
                ].join(" ")}
                style={{
                  left: tick.left,
                  top: tick.top,
                  width: SEEK_GESTURE_GUIDE_TICK_W_PX,
                  height: SEEK_GESTURE_GUIDE_TICK_H_PX,
                  opacity: tick.opacity,
                }}
              />
            ))}
            <div
              className="absolute -translate-x-1/2"
              style={{
                left: seekGuideRuler.center.left,
                top: seekGuideRuler.center.top,
                opacity: seekGuideRuler.center.opacity,
              }}
            >
              <div className="absolute left-1/2 top-0 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white/70" />
              <span className="absolute left-1/2 top-2.5 -translate-x-1/2 rounded bg-black/45 px-1 text-[10px] font-semibold tabular-nums leading-none text-white/90 ring-1 ring-white/20">
                0
              </span>
            </div>
            <div
              className={[
                "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums text-white shadow-lg shadow-black/30 backdrop-blur-sm",
                seekGuideRuler.backward.reached
                  ? "border border-white/55 bg-white/25"
                  : "border border-white/25 bg-black/45",
              ].join(" ")}
              style={{
                left: seekGuideRuler.backward.left,
                top: seekGuideRuler.backward.top,
                width: SEEK_GESTURE_GUIDE_SIZE_PX,
                height: SEEK_GESTURE_GUIDE_SIZE_PX,
                opacity: seekGuideRuler.backward.opacity,
              }}
            >
              −{seekGuideSeconds}
            </div>
            <div
              className={[
                "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums text-white shadow-lg shadow-black/30 backdrop-blur-sm",
                seekGuideRuler.forward.reached
                  ? "border border-white/55 bg-white/25"
                  : "border border-white/25 bg-black/45",
              ].join(" ")}
              style={{
                left: seekGuideRuler.forward.left,
                top: seekGuideRuler.forward.top,
                width: SEEK_GESTURE_GUIDE_SIZE_PX,
                height: SEEK_GESTURE_GUIDE_SIZE_PX,
                opacity: seekGuideRuler.forward.opacity,
              }}
            >
              +{seekGuideSeconds}
            </div>
          </div>
        ) : null}
        {seekFeedback.backward > 0 ? (
          <div className="pointer-events-none absolute left-[12%] top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 sm:left-[16%]">
            {seekPreview?.side === "backward" ? seekTapPreviewChrome : null}
            <div className="flex h-20 min-w-20 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-xl font-bold tabular-nums text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:h-24 sm:min-w-24 sm:text-2xl">
              -{seekFeedback.backward}
            </div>
          </div>
        ) : null}
        {seekFeedback.forward > 0 ? (
          <div className="pointer-events-none absolute right-[12%] top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 sm:right-[16%]">
            {seekPreview?.side === "forward" ? seekTapPreviewChrome : null}
            <div className="flex h-20 min-w-20 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-xl font-bold tabular-nums text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:h-24 sm:min-w-24 sm:text-2xl">
              +{seekFeedback.forward}
            </div>
          </div>
        ) : null}
        {showTaPlusCenterPlay ? (
          <button
            type="button"
            data-tv-focus
            data-tv-player-seek-keys
            disabled={controlsDisabled}
            aria-label={viewPlayback.isPlaying ? "Пауза" : "Воспроизведение"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              startTaPlusMedia();
              revealUi();
            }}
            className={[
              // Hit target ≈ 45% × 45% centered; under chrome / Continue / Skip.
              "group absolute left-1/2 top-1/2 z-[15] flex h-[45%] w-[45%] -translate-x-1/2 -translate-y-1/2",
              "items-center justify-center bg-transparent",
              "disabled:cursor-wait",
              "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]",
              "outline-none focus-visible:outline-none",
            ].join(" ")}
          >
            <span
              className={[
                "pointer-events-none flex h-20 w-20 items-center justify-center rounded-full",
                "border border-white/20 bg-black/60 text-white shadow-2xl shadow-black/40 backdrop-blur-sm",
                "transition group-hover:border-white/30 group-hover:bg-black/75 group-active:scale-95",
                "group-disabled:opacity-50 group-focus-visible:ring-2 group-focus-visible:ring-white/50",
                "sm:h-24 sm:w-24",
                // While playing: keep the large hit target, show the glyph only on hover/focus.
                viewPlayback.isPlaying
                  ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  : "",
              ].join(" ")}
              aria-hidden
            >
              {viewPlayback.isPlaying ? (
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current sm:h-12 sm:w-12" aria-hidden>
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ml-1 h-10 w-10 fill-current sm:h-12 sm:w-12" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </span>
          </button>
        ) : null}
        {playPauseFlash ? (
          <div
            key={playPauseFlashKey}
            className="kodik-player-beta-play-pause-flash pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
            aria-hidden
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:h-24 sm:w-24">
              {playPauseFlash === "play" ? (
                <svg viewBox="0 0 24 24" className="ml-1 h-10 w-10 fill-current sm:h-12 sm:w-12" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current sm:h-12 sm:w-12" aria-hidden>
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              )}
            </div>
          </div>
        ) : null}
        {kodikUiAccess ? (
          <div
            className={[
              "pointer-events-none absolute inset-x-0 z-40 px-2 pb-1 sm:px-3",
              controlsDocked
                ? "bottom-2"
                : settings.playerLargeUi
                  ? "bottom-[5.75rem]"
                  : "bottom-[4.25rem]",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={toggleKodikUiAccess}
              className="kodik-player-beta-kodik-ui-return pointer-events-auto inline-flex rounded-md border border-white/10 bg-black/35 px-[clamp(0.5rem,0.42vw,0.8rem)] py-[clamp(0.25rem,0.21vw,0.4rem)] text-[clamp(11px,0.58vw,15px)] font-medium text-white/85 backdrop-blur-sm transition hover:bg-black/50 hover:text-white"
            >
              <span className="hidden sm:inline">Shift — интерфейс TA</span>
              <span className="sm:hidden">TA UI</span>
            </button>
          </div>
        ) : null}
        {continueAction && !kodikUiAccess ? (
          <div
            className={[
              "kodik-player-beta-ta-chrome pointer-events-none absolute inset-x-0 z-40 flex justify-center px-2",
              taPlusIdle
                ? "bottom-6 sm:bottom-8"
                : controlsDocked
                  ? "bottom-10"
                  : settings.playerLargeUi
                    ? "bottom-24 sm:bottom-28"
                    : "bottom-20 sm:bottom-24",
              // Fullscreen tablets / notched devices: keep above the home indicator.
              fullscreenActive ? "mb-[env(safe-area-inset-bottom,0px)]" : "",
            ].join(" ")}
          >
            {/* Always clickable — do not gate on Android passThrough (iframe hit-through). */}
            <div className="pointer-events-auto">{continueAction}</div>
          </div>
        ) : null}
        {!kodikUiAccess ? (
          <div
            className={[
              "kodik-player-beta-ta-chrome kodik-player-beta-ui pointer-events-none absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300",
              uiInteractive || taPlusIdle ? "opacity-100" : "opacity-0",
            ].join(" ")}
            aria-hidden={!uiInteractive && !taPlusIdle}
          >
            <div className="kodik-player-beta-ui-top pointer-events-none">
              <div
                className={
                  chromeHitTest || taPlusIdle ? "pointer-events-auto" : "pointer-events-none"
                }
              >
                <KodikPlayerBetaEpisodeStrip
                  shikimoriId={shikimoriId}
                  kodikId={kodikId}
                  seasonNumber={seasonNumber}
                  currentEpisode={currentEpisode}
                  disabled={controlsDisabled}
                  onSelect={onEpisodeSelect}
                  overlay
                />
              </div>
            </div>
            {!controlsDocked && !taPlusIdle ? (
              <div className="kodik-player-beta-ui-bottom pointer-events-none">
                {bottomStackNode}
                {controlsNode}
              </div>
            ) : null}
          </div>
        ) : null}
        {settings.betaHiddenProgressOpacity > 0 && !taPlusIdle ? (
          <div
            className={[
              "pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden bg-white/20 transition-opacity duration-300",
              !uiInteractive && !kodikUiAccess && !controlsDocked ? "" : "opacity-0",
            ].join(" ")}
            style={{
              height: `${settings.betaHiddenProgressThickness}px`,
              opacity:
                !uiInteractive && !kodikUiAccess && !controlsDocked
                  ? settings.betaHiddenProgressOpacity
                  : 0,
            }}
            aria-hidden
          >
            {hiddenBufferFill ? (
              <div
                className="absolute inset-y-0 left-0 bg-white/40"
                style={{ width: hiddenBufferFill }}
              />
            ) : null}
            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: progressFill }} />
            {timelineSegmentBackground ? (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: timelineSegmentBackground }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {controlsDocked && !kodikUiAccess && !taPlusIdle ? (
        <div className="kodik-player-beta-ta-chrome kodik-player-beta-docked-chrome">
          {bottomStackNode}
          {controlsNode}
        </div>
      ) : null}
    </div>
  );
}
