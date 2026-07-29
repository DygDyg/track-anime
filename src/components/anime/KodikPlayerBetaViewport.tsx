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
  KodikPlayerBetaControls,
  type KodikPlayerBetaTheaterMode,
  type KodikPlayerTimelineSegment,
} from "@/components/anime/KodikPlayerBetaControls";
import { KodikPlayerBetaEpisodeStrip } from "@/components/anime/KodikPlayerBetaEpisodeStrip";
import { SiteClock } from "@/components/SiteClock";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { toKodikPlayerEmbedUrl } from "@/lib/player-url";
import {
  applyPlayerBrightness,
  clearNativePlayerBrightness,
  hasNativePlayerBrightness,
  playerBrightnessOverlayOpacity,
  readStoredPlayerBrightness,
} from "@/lib/player-screen-brightness";

const CONTROLS_IDLE_MS = 2_500;
const SINGLE_CLICK_DELAY_MS = 220;
const SEEK_FEEDBACK_MS = 900;
const MOBILE_DOUBLE_TAP_SEEK_SECONDS = 10;
const MOBILE_DOCK_CONTROLS_MQ = "(max-width: 639px) and (orientation: portrait)";
const TOUCH_LIKE_MQ = "(hover: none), (pointer: coarse)";
const MOBILE_TRANSLATIONS_SWIPE_ZONE_PX = 96;
const MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX = 56;
const BRIGHTNESS_GESTURE_ACTIVATE_PX = 8;
const BRIGHTNESS_HUD_MS = 900;
const KODIK_NATIVE_SKIP_PASSTHROUGH_WIDTH = "min(18rem, 44vw)";
const KODIK_NATIVE_SKIP_PASSTHROUGH_HEIGHT = "3.75rem";
const KODIK_NATIVE_SKIP_PASSTHROUGH_RIGHT = "0.5rem";
const KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM = "4.25rem";

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
  onEpisodeSelect: (seasonNumber: number, episodeNumber: number) => void;
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
  onEnded?: () => void;
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
  const [uiVisible, setUiVisible] = useState(true);
  const [kodikUiAccess, setKodikUiAccess] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [dockControlsBelow, setDockControlsBelow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_DOCK_CONTROLS_MQ).matches;
  });
  const [touchLikeUi, setTouchLikeUi] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(TOUCH_LIKE_MQ).matches;
  });
  const [seekFeedback, setSeekFeedback] = useState({ backward: 0, forward: 0 });
  const [brightnessHud, setBrightnessHud] = useState<number | null>(null);
  const [overlayBrightness, setOverlayBrightness] = useState(1);
  const [nativeBrightness, setNativeBrightness] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const [qualityHover, setQualityHover] = useState(false);
  const [qualityPanelActive, setQualityPanelActive] = useState(false);
  const seekFeedbackTimersRef = useRef<{ backward: number | null; forward: number | null }>({
    backward: null,
    forward: null,
  });
  const brightnessHudTimerRef = useRef<number | null>(null);
  const brightnessValueRef = useRef(readStoredPlayerBrightness());
  const suppressClickAfterGestureRef = useRef(false);
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    startedNearBottom: boolean;
    startedOnRight: boolean;
    mode: "none" | "brightness" | "translations";
    startBrightness: number;
    shellHeight: number;
  } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const playbackRef = useRef(playback);
  const volumeReady = playback.durationSeconds > 0;
  const controlsDocked = dockControlsBelow && !fullscreenActive;
  // Overlay only when native device/window brightness is unavailable (browser/PWA).
  const brightnessOverlay = nativeBrightness
    ? 0
    : playerBrightnessOverlayOpacity(overlayBrightness);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    setNativeBrightness(hasNativePlayerBrightness());
    brightnessValueRef.current = readStoredPlayerBrightness();
  }, []);

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
      if (!playback.isPlaying || document.visibilityState !== "visible") {
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
  }, [playback.isPlaying]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!playback.isPlaying || controlsDisabled || kodikUiAccess || keepUiVisible) return;
    hideTimerRef.current = window.setTimeout(() => {
      setUiVisible(false);
      onFullscreenTranslationsIntent?.(false);
      viewportRef.current
        ?.closest(".kodik-player-beta-stage:fullscreen")
        ?.scrollTo({ top: 0, behavior: "smooth" });
      hideTimerRef.current = null;
    }, CONTROLS_IDLE_MS);
  }, [
    clearHideTimer,
    controlsDisabled,
    keepUiVisible,
    kodikUiAccess,
    onFullscreenTranslationsIntent,
    playback.isPlaying,
  ]);

  const revealUi = useCallback(() => {
    if (kodikUiAccess) return;
    setUiVisible(true);
    scheduleHide();
  }, [kodikUiAccess, scheduleHide]);

  const hideUi = useCallback(() => {
    clearHideTimer();
    setUiVisible(false);
    onFullscreenTranslationsIntent?.(false);
    viewportRef.current
      ?.closest(".kodik-player-beta-stage:fullscreen")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  }, [clearHideTimer, onFullscreenTranslationsIntent]);

  const toggleUi = useCallback(() => {
    if (kodikUiAccess) return;
    if (uiVisible) {
      hideUi();
      return;
    }
    setUiVisible(true);
    scheduleHide();
  }, [hideUi, kodikUiAccess, scheduleHide, uiVisible]);

  const toggleKodikUiAccess = useCallback(() => {
    setKodikUiAccess((current) => {
      const next = !current;
      setUiVisible(!next);
      if (next) onFullscreenTranslationsIntent?.(false);
      if (!next) scheduleHide();
      return next;
    });
  }, [onFullscreenTranslationsIntent, scheduleHide]);

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

  useEffect(() => {
    return () => {
      clearNativePlayerBrightness();
      clearBrightnessHudTimer();
    };
  }, [clearBrightnessHudTimer]);

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
        setSeekFeedback((current) => ({ ...current, [direction]: 0 }));
        seekFeedbackTimersRef.current[direction] = null;
      }, SEEK_FEEDBACK_MS);
    },
    [clearSeekFeedbackTimer],
  );

  const handleSeekSkip = useCallback(
    (deltaSeconds: number) => {
      onSeekSkip(deltaSeconds);
      showSeekFeedback(deltaSeconds);
    },
    [onSeekSkip, showSeekFeedback],
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.shiftKey) {
        revealUi();
        return;
      }

      revealUi();

      const node = viewportRef.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        const inHotspot =
          event.clientX >= rect.right - 200 &&
          event.clientY >= rect.bottom - 120;
        setQualityHover((prev) => (prev === inHotspot ? prev : inHotspot));
      }
    },
    [revealUi],
  );

  const markPlayerInteraction = useCallback(() => {
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
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
      touchGestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startedNearBottom:
          fullscreenActive && rect.bottom - touch.clientY <= MOBILE_TRANSLATIONS_SWIPE_ZONE_PX,
        startedOnRight: ratioX >= 0.5,
        mode: "none",
        startBrightness: brightnessValueRef.current,
        shellHeight: rect.height,
      };
      suppressClickAfterGestureRef.current = false;
    },
    [fullscreenActive, revealUi, touchLikeUi],
  );

  const handleTouchMove = useCallback(
    (_event: ReactTouchEvent<HTMLDivElement>) => {
      // Brightness / translations vertical handling lives on a non-passive capture listener
      // attached to the video shell (see useEffect above). React's touchmove is passive.
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const gesture = touchGestureRef.current;
      touchGestureRef.current = null;
      const touch = event.changedTouches[0];
      if (!gesture || !touch) return;

      if (gesture.mode === "brightness") {
        suppressClickAfterGestureRef.current = true;
        return;
      }

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
    [fullscreenTranslationsOpen, onFullscreenTranslationsIntent],
  );

  // Non-passive listeners: React's synthetic touchmove is often passive, so preventDefault
  // never sticks and the browser/page steals the vertical swipe before brightness activates.
  useEffect(() => {
    const shell = videoShellRef.current;
    if (!shell || !touchLikeUi) return;

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
          gesture.startedOnRight &&
          !gesture.startedNearBottom &&
          Math.abs(deltaY) >= BRIGHTNESS_GESTURE_ACTIVATE_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        ) {
          gesture.mode = "brightness";
          clearClickTimer();
          suppressClickAfterGestureRef.current = true;
          setUiVisible(false);
        }
      }

      if (gesture.mode === "brightness") {
        event.preventDefault();
        const span = Math.max(gesture.shellHeight * 0.55, 140);
        setBrightnessFromGesture(gesture.startBrightness - deltaY / span);
      } else if (gesture.mode === "translations") {
        if (
          deltaY < -MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.2
        ) {
          event.preventDefault();
        }
      }
    };

    shell.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    return () => shell.removeEventListener("touchmove", onTouchMove, true);
  }, [
    clearClickTimer,
    fullscreenTranslationsOpen,
    setBrightnessFromGesture,
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
      if (!fullscreenActive) return;

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
    [fullscreenActive, onFullscreenTranslationsIntent],
  );

  useEffect(() => {
    if (kodikUiAccess) {
      clearHideTimer();
      setUiVisible(false);
      return;
    }

    if (!playback.isPlaying || controlsDisabled || keepUiVisible) {
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
    playback.isPlaying,
    scheduleHide,
  ]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      clearClickTimer();
      clearSeekFeedbackTimer("backward");
      clearSeekFeedbackTimer("forward");
    };
  }, [clearClickTimer, clearHideTimer, clearSeekFeedbackTimer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
        if (event.code === "Space" || event.code === "KeyK") {
          event.preventDefault();
          if (event.repeat) return;
          onPlayPause();
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

      if (event.key !== "Shift" || !keyboardActive || isEditable) return;
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
          if (playbackRef.current.isPlaying && !controlsDisabled && !keepUiVisible) {
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
    onFullscreenToggle,
    onMuteToggle,
    onPlayPause,
    handleSeekSkip,
    onTheaterToggle,
    onVolumeChange,
    onFullscreenTranslationsIntent,
    keepUiVisible,
    scheduleHide,
    toggleKodikUiAccess,
    volumeReady,
  ]);

  const handleViewportClick = useCallback(() => {
    if (suppressClickAfterGestureRef.current) {
      suppressClickAfterGestureRef.current = false;
      clearClickTimer();
      return;
    }
    if (controlsDisabled || kodikUiAccess) return;
    clearClickTimer();
    clickTimerRef.current = window.setTimeout(() => {
      // YouTube-like mobile: tap toggles chrome; play/pause is the center button.
      if (touchLikeUi) {
        toggleUi();
      } else {
        onPlayPause();
      }
      clickTimerRef.current = null;
    }, SINGLE_CLICK_DELAY_MS);
  }, [
    clearClickTimer,
    controlsDisabled,
    kodikUiAccess,
    onPlayPause,
    toggleUi,
    touchLikeUi,
  ]);

  const handleCenterPlayPause = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearClickTimer();
      if (controlsDisabled || kodikUiAccess) return;
      onPlayPause();
      scheduleHide();
    },
    [clearClickTimer, controlsDisabled, kodikUiAccess, onPlayPause, scheduleHide],
  );

  const handleViewportDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      clearClickTimer();
      if (controlsDisabled || kodikUiAccess) return;

      // Phone / touch: double-tap left/right seeks; desktop keeps fullscreen toggle.
      if (touchLikeUi) {
        const rect = videoShellRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const ratio = (event.clientX - rect.left) / rect.width;
        handleSeekSkip(
          ratio < 0.5 ? -MOBILE_DOUBLE_TAP_SEEK_SECONDS : MOBILE_DOUBLE_TAP_SEEK_SECONDS,
        );
        return;
      }

      onFullscreenToggle();
    },
    [
      clearClickTimer,
      controlsDisabled,
      handleSeekSkip,
      kodikUiAccess,
      onFullscreenToggle,
      touchLikeUi,
    ],
  );

  const uiInteractive = uiVisible && !kodikUiAccess;
  const awaitKodikGesture = !playback.mediaUnlocked;
  const duration = Math.max(playback.durationSeconds, 0);
  const position = Math.min(Math.max(playback.positionSeconds, 0), duration || playback.positionSeconds);
  const progressMax = duration > 0 ? duration : Math.max(position, 1);
  const progressFill = `${(position / progressMax) * 100}%`;
  // Until the stream is fully ready (video_started + duration), no click-layer — taps go to iframe.
  // After videoReady the stub stays so taps can show/hide TA UI (including on pause).
  // When quality panel is open (hover/tap/always-split), pass clicks through to Kodik quality UI.
  const clickLayerInteractive =
    !kodikUiAccess &&
    playback.videoReady &&
    !qualityPanelActive;
  const hideCursor = playback.isPlaying && !uiInteractive && !kodikUiAccess;
  const clickLayerClass = [
    "absolute z-10 bg-transparent",
    "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]",
    "outline-none focus:outline-none focus-visible:outline-none",
    clickLayerInteractive ? "pointer-events-auto" : "pointer-events-none",
    hideCursor ? "" : "cursor-pointer",
    controlsDisabled ? "cursor-wait" : "",
  ].join(" ");
  const clickLayerStyle = hideCursor ? { cursor: "none" } : undefined;
  const showClickLayer = !controlsDocked && playback.videoReady;

  const controlsNode = (
    <KodikPlayerBetaControls
      disabled={controlsDisabled}
      playback={playback}
      timelineSegments={timelineSegments}
      fullscreenActive={fullscreenActive}
      seekSkipLabelSeconds={seekSkipLabelSeconds}
      overlay={!controlsDocked}
      onPlayPause={onPlayPause}
      onPreviousEpisode={onPreviousEpisode}
      onNextEpisode={onNextEpisode}
      previousEpisodeDisabled={previousEpisodeDisabled}
      nextEpisodeDisabled={nextEpisodeDisabled}
      onSeek={onSeek}
      onSeekSkip={handleSeekSkip}
      onVolumeChange={onVolumeChange}
      onMuteToggle={onMuteToggle}
      theaterMode={theaterMode}
      onTheaterToggle={onTheaterToggle}
      onFullscreenToggle={onFullscreenToggle}
      pipAvailable={false}
      onPictureInPicture={undefined}
      castAvailable={castAvailable}
      onCast={handleCast}
      fullscreenTranslationsOpen={fullscreenTranslationsOpen}
      onFullscreenTranslationsToggle={() =>
        onFullscreenTranslationsIntent?.(!fullscreenTranslationsOpen)
      }
      interactive={controlsDocked ? !kodikUiAccess : uiInteractive}
      qualityHover={qualityHover}
      controlsDocked={controlsDocked}
      qualityPanelDynamicWidth={settings.playerControlsDynamicWidth}
      onQualityPanelActiveChange={setQualityPanelActive}
    />
  );

  const bottomStackNode = (
    <div className="kodik-player-beta-bottom-stack pointer-events-none space-y-1 px-2 pb-1 sm:space-y-2 sm:px-3">
      <div className="flex items-center justify-between gap-2">
        {!controlsDocked && (
          <button
            type="button"
            onClick={toggleKodikUiAccess}
            className={[
              "kodik-player-beta-kodik-ui-toggle inline-flex rounded-md border border-white/10 bg-black/35 px-[clamp(0.5rem,0.42vw,0.8rem)] py-[clamp(0.25rem,0.21vw,0.4rem)] text-[clamp(11px,0.58vw,15px)] font-medium text-white/85 backdrop-blur-sm transition hover:bg-black/50 hover:text-white",
              uiInteractive
                ? "pointer-events-auto"
                : "pointer-events-none",
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
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setQualityHover(false)}
      onMouseDown={markPlayerInteraction}
      onWheel={handleViewportWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchGestureRef.current = null;
      }}
      onFocusCapture={revealUi}
    >
      <div ref={videoShellRef} className="kodik-player-beta-video-shell relative min-w-0">
        {continueOverlay}
        <KodikPlayer
          ref={playerRef}
          key={playerKey}
          src={src}
          title={title}
          sizeMode={sizeMode}
          chromelessBeta
          initialResume={initialResume}
          onReady={onReady}
          onContinueStateChange={onContinueStateChange}
          onProgress={onProgress}
          onPause={onPause}
          onTranslationChange={onTranslationChange}
          onPlaybackStateChange={onPlaybackStateChange}
          onEnded={onEnded}
        />
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
        {showClickLayer && <div
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
        >
          <div
            onClick={handleViewportClick}
            onDoubleClick={handleViewportDoubleClick}
            className={clickLayerClass}
            style={{
              ...clickLayerStyle,
              insetInline: 0,
              top: 0,
              bottom: `calc(${KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM} + ${KODIK_NATIVE_SKIP_PASSTHROUGH_HEIGHT})`,
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
              bottom: KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM,
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
              bottom: KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM,
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
              style={{ height: KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM }}
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
                height: KODIK_NATIVE_SKIP_PASSTHROUGH_BOTTOM,
              }}
            />
          )}
        </div>}
        {fullscreenActive && settings.showClock ? (
          <div className="pointer-events-none absolute right-2 top-2 z-30 sm:right-3 sm:top-3">
            <SiteClock className="border-white/10 bg-black/45 text-white/90" />
          </div>
        ) : null}
        {skipAction && !kodikUiAccess ? (
          <div
            className={[
              "pointer-events-none absolute inset-x-2 z-30 flex justify-center",
              controlsDocked ? "bottom-2" : "bottom-14 sm:bottom-16",
            ].join(" ")}
          >
            <div className={uiInteractive || controlsDocked ? "pointer-events-auto" : "pointer-events-none"}>
              {skipAction}
            </div>
          </div>
        ) : null}
        {seekFeedback.backward > 0 ? (
          <div className="pointer-events-none absolute left-[12%] top-1/2 z-30 flex h-20 min-w-20 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-xl font-bold tabular-nums text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:left-[16%] sm:h-24 sm:min-w-24 sm:text-2xl">
            -{seekFeedback.backward}
          </div>
        ) : null}
        {seekFeedback.forward > 0 ? (
          <div className="pointer-events-none absolute right-[12%] top-1/2 z-30 flex h-20 min-w-20 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-xl font-bold tabular-nums text-white shadow-2xl shadow-black/40 backdrop-blur-sm sm:right-[16%] sm:h-24 sm:min-w-24 sm:text-2xl">
            +{seekFeedback.forward}
          </div>
        ) : null}
        {kodikUiAccess && !controlsDocked ? (
          <div
            className={[
              "pointer-events-none absolute inset-x-0 z-40 px-2 pb-1 sm:px-3",
              "bottom-[4.25rem]",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={toggleKodikUiAccess}
              className="kodik-player-beta-kodik-ui-toggle pointer-events-auto inline-flex rounded-md border border-white/10 bg-black/35 px-[clamp(0.5rem,0.42vw,0.8rem)] py-[clamp(0.25rem,0.21vw,0.4rem)] text-[clamp(11px,0.58vw,15px)] font-medium text-white/85 backdrop-blur-sm transition hover:bg-black/50 hover:text-white"
            >
              <span className="hidden sm:inline">Shift — интерфейс TA</span>
              <span className="sm:hidden">TA UI</span>
            </button>
          </div>
        ) : null}
        {continueAction ? (
          <div
            className={[
              "pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-2",
              controlsDocked ? "bottom-10" : "bottom-20 sm:bottom-24",
            ].join(" ")}
          >
            {continueAction}
          </div>
        ) : null}
        <div
          className={[
            "kodik-player-beta-ui pointer-events-none absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300",
            uiInteractive ? "opacity-100" : "opacity-0",
          ].join(" ")}
          aria-hidden={!uiInteractive}
        >
          <div
            className={[
              "kodik-player-beta-ui-top",
              uiInteractive ? "pointer-events-auto" : "pointer-events-none",
            ].join(" ")}
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
          {touchLikeUi ? (
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
              <button
                type="button"
                disabled={controlsDisabled || awaitKodikGesture}
                aria-label={
                  awaitKodikGesture
                    ? "Нажмите на видео, чтобы начать"
                    : playback.isPlaying
                      ? "Пауза"
                      : "Воспроизведение"
                }
                title={awaitKodikGesture ? "Нажмите на видео, чтобы начать" : undefined}
                onClick={handleCenterPlayPause}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className={[
                  "kodik-player-beta-center-play",
                  uiInteractive && !awaitKodikGesture ? "pointer-events-auto" : "pointer-events-none",
                  awaitKodikGesture ? "opacity-90" : "",
                ].join(" ")}
              >
                {playback.isPlaying ? (
                  <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current" aria-hidden>
                    <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>
          ) : null}
          {!controlsDocked ? (
            <div className="kodik-player-beta-ui-bottom pointer-events-none">
              {bottomStackNode}
              {controlsNode}
            </div>
          ) : null}
        </div>
        {settings.betaHiddenProgressOpacity > 0 ? (
          <div
            className={[
              "pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 bg-white/20 transition-opacity duration-300",
              !uiInteractive && !kodikUiAccess && !controlsDocked ? "" : "opacity-0",
            ].join(" ")}
            style={{
              opacity:
                !uiInteractive && !kodikUiAccess && !controlsDocked
                  ? settings.betaHiddenProgressOpacity
                  : 0,
            }}
            aria-hidden
          >
            <div className="h-full bg-accent" style={{ width: progressFill }} />
          </div>
        ) : null}
      </div>
      {controlsDocked && !kodikUiAccess ? (
        <div className="kodik-player-beta-docked-chrome">
          {bottomStackNode}
          {controlsNode}
        </div>
      ) : null}
    </div>
  );
}
