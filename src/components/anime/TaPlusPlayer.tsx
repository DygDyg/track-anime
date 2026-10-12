"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";
import type {
  KodikPlayerHandle,
  KodikPlayerPlaybackState,
  KodikPlayerProgressPayload,
  KodikPlayerResume,
  KodikPlayerResumeMode,
} from "@/components/anime/KodikPlayer";
import { VideoAmbientGlow } from "@/components/anime/VideoAmbientGlow";
import {
  readKodikPlayerVolumePreferences,
  writeKodikPlayerVolumePreferences,
} from "@/lib/kodik-player-volume-preferences";
import {
  createTaPlusMasterPlaylistUrl,
  getTaPlusMaxQualityUrl,
  sortTaPlusQualityKeys,
  TA_PLUS_QUALITY_AUTO,
} from "@/lib/ta-plus-master-playlist";
import {
  canUseTaPlusSafeMode,
  toTaPlusSafeModeUrl,
} from "@/lib/ta-plus-safe-mode";

export type TaPlusPlayerProgressPayload = KodikPlayerProgressPayload & {
  durationSeconds: number;
};

export type TaPlusPlayerHandle = KodikPlayerHandle & {
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  requestPictureInPicture: () => Promise<void>;
  getVideoElement: () => HTMLVideoElement | null;
  /** Last seekTo/sync mode — used so remount auto-start can respect watch-party pause. */
  getPendingResumeMode: () => KodikPlayerResumeMode;
};

type Props = {
  src: string | null;
  /** Match KodikPlayer: `viewport` fills theater/fullscreen host. */
  sizeMode?: "default" | "viewport";
  /** All /ftor quality URLs; `auto` plays the highest available key. */
  qualities?: Record<string, string>;
  /** `"auto"` (max available) or locked height key. */
  quality?: string | null;
  title?: string;
  /**
   * Poster while HLS has no painted frame (episode switch / `video.load()`).
   * Without it Chromium shows a white default stub with a play glyph.
   */
  poster?: string | null;
  seasonNumber: number;
  episodeNumber: number;
  initialResume?: KodikPlayerResume | null;
  initialPositionSeconds?: number | null;
  className?: string;
  onReady?: () => void;
  onProgress?: (payload: TaPlusPlayerProgressPayload) => void;
  onPause?: (payload: TaPlusPlayerProgressPayload) => void;
  onPlaying?: () => void;
  onPlaybackStateChange?: (state: KodikPlayerPlaybackState) => void;
  onEnded?: (progress?: KodikPlayerProgressPayload | null) => void;
  /** Exhausted local HLS recovery — parent should re-fetch /taplus. */
  onStreamFailed?: () => void;
  /** Furthest buffered end (seconds) for timeline UI. */
  onBufferedEndChange?: (bufferedEndSeconds: number) => void;
  /** Active ABR / locked height for UI label (e.g. 720). */
  onActiveQualityChange?: (height: number | null) => void;
  /**
   * Runtime ambient glow (tiny canvas + CSS blur). Parent gates by preference + display AR.
   * When false, glow is fully unmounted — no sampling.
   */
  ambientGlowActive?: boolean;
  ambientGlowSettings?: {
    blur: number;
    opacity: number;
    brightness: number;
    saturate: number;
    scale: number;
    downscale: number;
    updateIntervalMs: number;
  } | null;
};

const DEFAULT_PLAYBACK: KodikPlayerPlaybackState = {
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 1,
  muted: false,
  mediaUnlocked: false,
  videoReady: false,
};

const MAX_HLS_RECOVERIES = 2;
/** Avoid flicker on tiny stalls; show spinner only if still waiting. */
const STALL_SPINNER_DELAY_MS = 320;
/** After spinner is visible this long, offer Kodik-style progressive MP4 fallback. */
const SAFE_MODE_OFFER_AFTER_MS = 5000;
/**
 * Optimistic initial throughput so Auto does not immediately drop from startLevel
 * (hls.js default ~500 kbps pinned near 480p on synthetic masters).
 */
const ABR_DEFAULT_ESTIMATE_BPS = 4_000_000;

function heightFromHlsLevel(level: {
  height?: number;
  name?: string;
} | undefined): number | null {
  if (!level) return null;
  if (level.height != null && Number.isFinite(level.height) && level.height > 0) {
    return Math.round(level.height);
  }
  const nameMatch = level.name?.match(/(\d{3,4})\s*p?/i);
  if (nameMatch) {
    const n = Number(nameMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return (
    video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    video.canPlayType("application/x-mpegURL") !== ""
  );
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readBufferedEnd(video: HTMLVideoElement): number {
  try {
    const buffered = video.buffered;
    if (!buffered || buffered.length === 0) return 0;
    return buffered.end(buffered.length - 1);
  } catch {
    return 0;
  }
}

export const TaPlusPlayer = forwardRef<TaPlusPlayerHandle, Props>(function TaPlusPlayer(
  {
    src,
    sizeMode = "default",
    qualities = {},
    quality = TA_PLUS_QUALITY_AUTO,
    title,
    poster = null,
    seasonNumber,
    episodeNumber,
    initialResume = null,
    initialPositionSeconds = null,
    className,
    onReady,
    onProgress,
    onPause,
    onPlaying,
    onPlaybackStateChange,
    onEnded,
    onStreamFailed,
    onBufferedEndChange,
    onActiveQualityChange,
    ambientGlowActive = false,
    ambientGlowSettings = null,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const seekAppliedForSrcRef = useRef<string | null>(null);
  const pendingResumeModeRef = useRef<KodikPlayerResumeMode>("play");
  const playbackRef = useRef<KodikPlayerPlaybackState>(DEFAULT_PLAYBACK);
  const playbackRateRef = useRef(1);
  const episodeRef = useRef({ seasonNumber, episodeNumber });
  episodeRef.current = { seasonNumber, episodeNumber };
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  onPlaybackStateChangeRef.current = onPlaybackStateChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onStreamFailedRef = useRef(onStreamFailed);
  onStreamFailedRef.current = onStreamFailed;
  const onBufferedEndChangeRef = useRef(onBufferedEndChange);
  onBufferedEndChangeRef.current = onBufferedEndChange;
  const onActiveQualityChangeRef = useRef(onActiveQualityChange);
  onActiveQualityChangeRef.current = onActiveQualityChange;
  const streamFailedSentRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** Hide browser empty-video chrome until the first decoded frame. */
  const [awaitingFirstFrame, setAwaitingFirstFrame] = useState(true);
  /** Mid-playback rebuffer / hang — center spinner after a short delay. */
  const [stallSpinner, setStallSpinner] = useState(false);
  const stallSpinnerTimerRef = useRef<number | null>(null);
  /** Progressive MP4 fallback (URL cut at `.mp4`), like Kodik «безопасный режим». */
  const [safeMode, setSafeMode] = useState(false);
  const [safeModeOffer, setSafeModeOffer] = useState(false);
  const safeModeRef = useRef(false);
  safeModeRef.current = safeMode;
  const safeModeOfferRef = useRef(false);
  safeModeOfferRef.current = safeModeOffer;
  const stallSpinnerRef = useRef(false);
  stallSpinnerRef.current = stallSpinner;
  const safeModeOfferTimerRef = useRef<number | null>(null);
  const safeModeDismissedRef = useRef(false);
  const safeModeResumeRef = useRef<number | null>(null);
  const playUrlForOfferRef = useRef<string | null>(null);
  const fatalSafeModePendingRef = useRef(false);
  const autoMode = quality === TA_PLUS_QUALITY_AUTO || quality == null;
  const posterUrl = poster?.trim() || undefined;

  const clearStallSpinnerTimer = () => {
    if (stallSpinnerTimerRef.current != null) {
      window.clearTimeout(stallSpinnerTimerRef.current);
      stallSpinnerTimerRef.current = null;
    }
  };

  const clearSafeModeOfferTimer = () => {
    if (safeModeOfferTimerRef.current != null) {
      window.clearTimeout(safeModeOfferTimerRef.current);
      safeModeOfferTimerRef.current = null;
    }
  };

  const hideStallSpinner = () => {
    clearStallSpinnerTimer();
    setStallSpinner(false);
  };

  const scheduleSafeModeOffer = () => {
    if (safeModeRef.current || safeModeDismissedRef.current) return;
    if (!canUseTaPlusSafeMode(playUrlForOfferRef.current)) return;
    if (safeModeOfferTimerRef.current != null) return;
    safeModeOfferTimerRef.current = window.setTimeout(() => {
      safeModeOfferTimerRef.current = null;
      if (safeModeRef.current || safeModeDismissedRef.current) return;
      if (!canUseTaPlusSafeMode(playUrlForOfferRef.current)) return;
      setSafeModeOffer(true);
    }, SAFE_MODE_OFFER_AFTER_MS);
  };

  const scheduleStallSpinner = () => {
    if (stallSpinnerTimerRef.current != null) return;
    stallSpinnerTimerRef.current = window.setTimeout(() => {
      stallSpinnerTimerRef.current = null;
      setStallSpinner(true);
      scheduleSafeModeOffer();
    }, STALL_SPINNER_DELAY_MS);
  };

  const emitPlayback = (patch: Partial<KodikPlayerPlaybackState>) => {
    const next = { ...playbackRef.current, ...patch };
    playbackRef.current = next;
    onPlaybackStateChangeRef.current?.(next);
  };

  const applySeek = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(seconds)) return;
    try {
      video.currentTime = Math.max(0, seconds);
    } catch {
      /* ignore */
    }
    emitPlayback({ positionSeconds: Math.max(0, seconds) });
  };

  const emitBuffered = () => {
    const video = videoRef.current;
    if (!video) return;
    onBufferedEndChangeRef.current?.(readBufferedEnd(video));
  };

  const notifyStreamFailed = () => {
    if (streamFailedSentRef.current) return;
    streamFailedSentRef.current = true;
    onStreamFailedRef.current?.();
  };

  const enableSafeMode = () => {
    const video = videoRef.current;
    const pos = video?.currentTime ?? playbackRef.current.positionSeconds;
    safeModeResumeRef.current =
      pos != null && Number.isFinite(pos) && pos >= 1 ? pos : null;
    if (video?.paused) {
      pendingResumeModeRef.current = "pause";
    } else if (pendingResumeModeRef.current !== "pause") {
      pendingResumeModeRef.current = "play";
    }
    fatalSafeModePendingRef.current = false;
    safeModeDismissedRef.current = false;
    clearSafeModeOfferTimer();
    setSafeModeOffer(false);
    setSafeMode(true);
  };

  const dismissSafeModeOffer = () => {
    safeModeDismissedRef.current = true;
    clearSafeModeOfferTimer();
    setSafeModeOffer(false);
    if (fatalSafeModePendingRef.current) {
      fatalSafeModePendingRef.current = false;
      setError("Не удалось воспроизвести поток");
      notifyStreamFailed();
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (resume, mode = "play") => {
        pendingResumeModeRef.current = mode;
        applySeek(resume.positionSeconds);
        const video = videoRef.current;
        if (!video) return;
        if (mode === "play") void video.play().catch(() => undefined);
        else video.pause();
      },
      seekBy: (deltaSeconds: number) => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(deltaSeconds)) return;
        applySeek((video.currentTime || 0) + deltaSeconds);
      },
      abortContinue: () => {
        /* HLS has no continue handshake */
      },
      play: () => {
        void videoRef.current?.play().catch(() => undefined);
      },
      pause: () => {
        videoRef.current?.pause();
      },
      togglePlay: () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
      },
      seekToPosition: (seconds: number) => {
        applySeek(seconds);
      },
      syncToPosition: (seconds: number, mode: KodikPlayerResumeMode) => {
        pendingResumeModeRef.current = mode;
        applySeek(seconds);
        const video = videoRef.current;
        if (!video) return;
        if (mode === "play") void video.play().catch(() => undefined);
        else video.pause();
      },
      setVolume: (volume: number) => {
        const video = videoRef.current;
        if (!video) return;
        const next = clampVolume(volume);
        video.volume = next;
        if (next > 0 && video.muted) video.muted = false;
        emitPlayback({ volume: next, muted: video.muted });
        writeKodikPlayerVolumePreferences({ volume: next, muted: video.muted });
      },
      mute: () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = true;
        emitPlayback({ muted: true });
        writeKodikPlayerVolumePreferences({ volume: video.volume, muted: true });
      },
      unmute: () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = false;
        emitPlayback({ muted: false });
        writeKodikPlayerVolumePreferences({ volume: video.volume, muted: false });
      },
      setPlaybackRate: (rate: number) => {
        const video = videoRef.current;
        const next = Number.isFinite(rate) ? Math.min(2, Math.max(0.25, rate)) : 1;
        playbackRateRef.current = next;
        if (video) video.playbackRate = next;
      },
      getPlaybackRate: () => playbackRateRef.current,
      getPendingResumeMode: () => pendingResumeModeRef.current,
      requestPictureInPicture: async () => {
        const video = videoRef.current;
        if (!video || typeof video.requestPictureInPicture !== "function") {
          throw new Error("Picture-in-Picture недоступен");
        }
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
          return;
        }
        await video.requestPictureInPicture();
      },
      getVideoElement: () => videoRef.current,
    }),
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const prefs = readKodikPlayerVolumePreferences();
    if (prefs) {
      video.volume = prefs.volume;
      video.muted = prefs.muted;
      emitPlayback({ volume: prefs.volume, muted: prefs.muted });
    }
  }, []);

  const bootSeekSeconds =
    initialResume?.positionSeconds ??
    (initialPositionSeconds != null && Number.isFinite(initialPositionSeconds)
      ? initialPositionSeconds
      : null);
  const bootSeekRef = useRef(bootSeekSeconds);
  bootSeekRef.current = bootSeekSeconds;

  // New episode / quality / source → leave safe mode and re-offer on next hang.
  const streamIdentity = `${src ?? ""}|${quality ?? ""}|${seasonNumber}|${episodeNumber}`;
  const [trackedStreamIdentity, setTrackedStreamIdentity] = useState(streamIdentity);
  if (streamIdentity !== trackedStreamIdentity) {
    setTrackedStreamIdentity(streamIdentity);
    if (safeMode) setSafeMode(false);
    if (safeModeOffer) setSafeModeOffer(false);
    safeModeDismissedRef.current = false;
    fatalSafeModePendingRef.current = false;
    clearSafeModeOfferTimer();
  }

  useEffect(() => {
    const video = videoRef.current;
    const qualityKeys = sortTaPlusQualityKeys(qualities);
    const maxKey = qualityKeys[0] ?? null;
    const maxHeight = maxKey != null ? Number(maxKey) : null;
    const maxQualityUrl = getTaPlusMaxQualityUrl(qualities) ?? src;
    let playUrl: string | null = null;
    let masterObjectUrl: string | null = null;

    if (autoMode && qualityKeys.length > 0) {
      // Auto = synthetic multivariant master + hls.js ABR (start at max, adapt down/up).
      const masterUrl = createTaPlusMasterPlaylistUrl(qualities);
      playUrl = masterUrl;
      if (masterUrl?.startsWith("blob:")) masterObjectUrl = masterUrl;
    } else if (!autoMode && quality && qualities[quality]) {
      playUrl = qualities[quality]!;
    } else {
      playUrl = src;
    }

    // Safe-mode / offer need a real /ftor URL (blob master has no `.mp4`).
    playUrlForOfferRef.current = maxQualityUrl;

    if (!video || !playUrl) {
      setError(null);
      streamFailedSentRef.current = false;
      onActiveQualityChangeRef.current?.(null);
      emitPlayback({
        isPlaying: false,
        positionSeconds: 0,
        durationSeconds: 0,
        mediaUnlocked: false,
        videoReady: false,
      });
      onBufferedEndChangeRef.current?.(0);
      return;
    }

    const lockedHeight =
      !autoMode && quality != null && Number.isFinite(Number(quality)) && Number(quality) > 0
        ? Number(quality)
        : null;
    const bootActiveHeight =
      lockedHeight ??
      (maxHeight != null && Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : null);

    const safeSourceUrl = maxQualityUrl ?? playUrl;
    const safeUrl = safeMode ? toTaPlusSafeModeUrl(safeSourceUrl) : null;
    if (safeMode && !safeUrl) {
      setSafeMode(false);
      if (masterObjectUrl) URL.revokeObjectURL(masterObjectUrl);
      return;
    }
    const loadKey = `${safeMode ? "safe" : "hls"}:${autoMode ? "auto-abr" : quality}:${safeMode ? safeUrl : autoMode ? qualityKeys.join("-") : playUrl}`;
    // Capture once per load — parent may clear taPlusSeekSeconds on ready; that must NOT reload HLS.
    const bootSeekAtLoad = bootSeekRef.current;
    const resumeOverride = safeModeResumeRef.current;
    safeModeResumeRef.current = null;
    setError(null);
    streamFailedSentRef.current = false;
    fatalSafeModePendingRef.current = false;
    seekAppliedForSrcRef.current = null;
    clearSafeModeOfferTimer();
    setSafeModeOffer(false);
    // Default play for auto-next / unlock. Keep pause if seekTo already requested it
    // before MANIFEST_PARSED (watch-party remount race).
    if (pendingResumeModeRef.current !== "pause") {
      pendingResumeModeRef.current = "play";
    }
    let disposed = false;
    let readySent = false;
    let recoveries = 0;

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    destroyHls();
    setAwaitingFirstFrame(true);
    if (stallSpinnerTimerRef.current != null) {
      window.clearTimeout(stallSpinnerTimerRef.current);
      stallSpinnerTimerRef.current = null;
    }
    setStallSpinner(false);
    video.removeAttribute("src");
    video.load();
    video.playbackRate = playbackRateRef.current;
    onActiveQualityChangeRef.current?.(bootActiveHeight);
    emitPlayback({
      isPlaying: false,
      positionSeconds: 0,
      durationSeconds: 0,
      mediaUnlocked: false,
      videoReady: false,
    });
    onBufferedEndChangeRef.current?.(0);

    const markReady = () => {
      if (disposed || readySent) return;
      readySent = true;
      onReadyRef.current?.();
    };

    const applyInitialSeek = () => {
      if (seekAppliedForSrcRef.current === loadKey) return;
      const target = resumeOverride ?? bootSeekAtLoad;
      if (target == null || !Number.isFinite(target) || target < 1) {
        seekAppliedForSrcRef.current = loadKey;
        return;
      }
      applySeek(target);
      seekAppliedForSrcRef.current = loadKey;
    };

    const preparePlayback = () => {
      if (disposed) return;
      applyInitialSeek();
      markReady();
      emitBuffered();
      // Quality / stream reload must resume without another user gesture (menu click
      // may be gone by the time MANIFEST_PARSED fires after remount + setTimeout).
      if (pendingResumeModeRef.current !== "pause") {
        void video.play().catch(() => undefined);
      }
    };

    const failHard = (message: string) => {
      if (disposed) return;
      setError(message);
      notifyStreamFailed();
    };

    const offerSafeModeOrFail = () => {
      if (disposed) return;
      if (
        !safeMode &&
        canUseTaPlusSafeMode(safeSourceUrl) &&
        !safeModeDismissedRef.current
      ) {
        fatalSafeModePendingRef.current = true;
        setStallSpinner(true);
        setSafeModeOffer(true);
        return;
      }
      failHard("Не удалось воспроизвести поток");
    };

    const reportLevelHeight = (levelIndex: number, hls: Hls) => {
      const height = heightFromHlsLevel(hls.levels[levelIndex]);
      if (height != null) onActiveQualityChangeRef.current?.(height);
    };

    // Progressive MP4 (Kodik-style safe mode) — no HLS.js.
    if (safeMode && safeUrl) {
      video.src = safeUrl;
      video.addEventListener("loadedmetadata", preparePlayback, { once: true });
      const onSafeError = () => {
        if (disposed) return;
        failHard("Не удалось воспроизвести поток");
      };
      video.addEventListener("error", onSafeError);
      return () => {
        disposed = true;
        video.removeEventListener("error", onSafeError);
        destroyHls();
        if (masterObjectUrl) URL.revokeObjectURL(masterObjectUrl);
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: ABR_DEFAULT_ESTIMATE_BPS,
        abrMaxWithRealBitrate: true,
        // Prefer staying up when estimates are noisy; still allow downshift on starvation.
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
      });
      hlsRef.current = hls;
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (disposed) return;
        const levelCount = data.levels?.length ?? hls.levels.length;
        if (autoMode && levelCount > 0) {
          const maxLevel = levelCount - 1;
          hls.startLevel = maxLevel;
          hls.nextLevel = maxLevel;
          hls.loadLevel = maxLevel;
          reportLevelHeight(maxLevel, hls);
        } else if (!autoMode && lockedHeight != null && levelCount > 0) {
          // Single-rendition load — keep label in sync if manifest exposes height.
          reportLevelHeight(0, hls);
        }
        preparePlayback();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (disposed || !autoMode) return;
        reportLevelHeight(data.level, hls);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (disposed || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveries < MAX_HLS_RECOVERIES) {
          recoveries += 1;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries < MAX_HLS_RECOVERIES) {
          recoveries += 1;
          hls.recoverMediaError();
          return;
        }
        offerSafeModeOrFail();
      });
    } else if (canPlayNativeHls(video)) {
      // Safari: native ABR on multivariant master when Auto; single URL when locked.
      video.src = playUrl;
      video.addEventListener("loadedmetadata", preparePlayback, { once: true });
      const onNativeError = () => {
        if (disposed) return;
        offerSafeModeOrFail();
      };
      video.addEventListener("error", onNativeError);
      return () => {
        disposed = true;
        video.removeEventListener("error", onNativeError);
        destroyHls();
        if (masterObjectUrl) URL.revokeObjectURL(masterObjectUrl);
      };
    } else {
      setError("Браузер не поддерживает HLS");
    }

    return () => {
      disposed = true;
      destroyHls();
      if (masterObjectUrl) URL.revokeObjectURL(masterObjectUrl);
    };
    // Intentionally omit bootSeekSeconds: resume is applied once at load via bootSeekRef.
  }, [autoMode, qualities, quality, safeMode, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const emitProgress = (source: "episode" | "time") => {
      const ep = episodeRef.current;
      onProgress?.({
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        positionSeconds: video.currentTime || 0,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        source,
      });
    };

    const syncState = (extra?: Partial<KodikPlayerPlaybackState>) => {
      emitPlayback({
        isPlaying: !video.paused && !video.ended,
        positionSeconds: video.currentTime || 0,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        volume: video.volume,
        muted: video.muted,
        mediaUnlocked: true,
        videoReady: Number.isFinite(video.duration) && video.duration > 0,
        ...extra,
      });
    };

    const onTimeUpdate = () => {
      syncState();
      emitProgress("time");
      emitBuffered();
    };
    const onProgressEvent = () => emitBuffered();
    const onPlay = () => {
      syncState({ isPlaying: true, mediaUnlocked: true });
      emitProgress("time");
    };
    const onPauseEvent = () => {
      hideStallSpinner();
      const ep = episodeRef.current;
      syncState({ isPlaying: false });
      onPause?.({
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        positionSeconds: video.currentTime || 0,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        source: "time",
      });
    };
    const onLoadedMetadata = () => syncState({ videoReady: true, mediaUnlocked: true });
    const onEndedEvent = () => {
      const ep = episodeRef.current;
      syncState({ isPlaying: false });
      onEnded?.({
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        positionSeconds: video.currentTime || 0,
        source: "time",
      });
    };
    const onVolumeChange = () => {
      emitPlayback({ volume: video.volume, muted: video.muted });
      writeKodikPlayerVolumePreferences({ volume: video.volume, muted: video.muted });
    };

    const clearStallUiOnResume = () => {
      hideStallSpinner();
      clearSafeModeOfferTimer();
      fatalSafeModePendingRef.current = false;
      setSafeModeOffer(false);
    };
    /** Stall often resumes without a new `playing` — hide prompt when media advances again. */
    const dismissStallUiIfUnstuck = () => {
      if (video.paused || video.seeking) return;
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
      if (
        !safeModeOfferRef.current &&
        !stallSpinnerRef.current &&
        stallSpinnerTimerRef.current == null &&
        safeModeOfferTimerRef.current == null
      ) {
        return;
      }
      clearStallUiOnResume();
    };
    const onFirstFrame = () => {
      setAwaitingFirstFrame(false);
      clearStallUiOnResume();
    };
    const onWaiting = () => {
      // User pause — no spinner. Otherwise show after delay (rebuffer / hang).
      if (video.paused && !video.seeking) return;
      scheduleStallSpinner();
    };
    const onStalled = () => {
      if (video.paused && !video.seeking) return;
      scheduleStallSpinner();
    };
    const onSeeking = () => scheduleStallSpinner();
    const onSeeked = () => {
      dismissStallUiIfUnstuck();
    };
    const onPlayingClearStall = () => {
      setAwaitingFirstFrame(false);
      clearStallUiOnResume();
      onPlaying?.();
    };
    const onCanPlay = () => {
      dismissStallUiIfUnstuck();
    };

    const onTimeUpdateWithStallDismiss = () => {
      onTimeUpdate();
      dismissStallUiIfUnstuck();
    };

    video.addEventListener("timeupdate", onTimeUpdateWithStallDismiss);
    video.addEventListener("progress", onProgressEvent);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPauseEvent);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onFirstFrame);
    video.addEventListener("playing", onPlayingClearStall);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("ended", onEndedEvent);
    video.addEventListener("volumechange", onVolumeChange);
    return () => {
      clearStallSpinnerTimer();
      clearSafeModeOfferTimer();
      video.removeEventListener("timeupdate", onTimeUpdateWithStallDismiss);
      video.removeEventListener("progress", onProgressEvent);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPauseEvent);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onFirstFrame);
      video.removeEventListener("playing", onPlayingClearStall);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("ended", onEndedEvent);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, [onEnded, onPause, onPlaying, onProgress]);

  const fillViewport = sizeMode === "viewport";

  return (
    <div
      className={[
        /* Keep overflow clipped: glow scale must not widen the FS scrollport (thin black strip). */
        "relative overflow-hidden bg-black",
        fillViewport ? "anime-player-shell-viewport h-full w-full max-w-none" : "",
        className ?? "",
      ].join(" ")}
    >
      <VideoAmbientGlow
        video={videoEl}
        active={ambientGlowActive}
        settings={ambientGlowSettings}
      />
      <div
        className={[
          "kodik-player-beta-frame relative z-[1] w-full",
          fillViewport ? "anime-player-viewport-frame h-full max-h-full" : "aspect-video",
        ].join(" ")}
      >
        <video
          ref={(node) => {
            videoRef.current = node;
            setVideoEl(node);
          }}
          className={[
            /* Transparent letterbox when glow is on — otherwise bg-black covers VideoAmbientGlow. */
            "absolute inset-0 h-full w-full object-contain [color-scheme:dark]",
            ambientGlowActive ? "bg-transparent" : "bg-black",
          ].join(" ")}
          controls={false}
          playsInline
          preload="metadata"
          poster={posterUrl}
          title={title}
        />
        {awaitingFirstFrame && !error ? (
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-black bg-center bg-cover"
            style={posterUrl ? { backgroundImage: `url(${JSON.stringify(posterUrl)})` } : undefined}
            aria-hidden
          />
        ) : null}
        {(stallSpinner || awaitingFirstFrame) && !error && !safeModeOffer ? (
          <div
            className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center"
            aria-hidden
          >
            <div className="kodik-player-beta-buffering-spinner" />
          </div>
        ) : null}
        {safeMode && !error ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[4] rounded-md bg-black/70 px-2 py-1 text-[11px] text-white/90 ring-1 ring-white/15">
            Безопасный режим
          </div>
        ) : null}
        {safeModeOffer && !error ? (
          <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/55 px-4">
            <div className="max-w-sm rounded-xl bg-black/90 px-4 py-3 text-center text-sm text-white shadow-lg ring-1 ring-white/15">
              <p className="mb-1 font-medium">Видео зависло?</p>
              <p className="mb-3 text-xs leading-relaxed text-white/70">
                Можно перейти в безопасный режим — упрощённая загрузка без HLS, как в плеере
                Kodik.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90"
                  onClick={enableSafeMode}
                >
                  Безопасный режим
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                  onClick={dismissSafeModeOffer}
                >
                  Не сейчас
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-white">
            {error}
          </div>
        ) : null}
        {!src && !error ? (
          <div className="absolute inset-0 z-[2] animate-pulse bg-black" />
        ) : null}
      </div>
    </div>
  );
});
