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
  sortTaPlusQualityKeys,
  TA_PLUS_QUALITY_AUTO,
} from "@/lib/ta-plus-master-playlist";

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
  const autoMode = quality === TA_PLUS_QUALITY_AUTO || quality == null;

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

  useEffect(() => {
    const video = videoRef.current;
    const qualityKeys = sortTaPlusQualityKeys(qualities);
    const maxKey = qualityKeys[0] ?? null;
    const maxHeight = maxKey != null ? Number(maxKey) : null;
    let playUrl: string | null = null;

    if (autoMode && maxKey && qualities[maxKey]) {
      // Auto = best available rendition (no ABR). hls.js ABR on synthetic masters
      // was dropping to ~480p despite startLevel=max.
      playUrl = qualities[maxKey]!;
    } else if (!autoMode && quality && qualities[quality]) {
      playUrl = qualities[quality]!;
    } else {
      playUrl = src;
    }

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

    const activeHeight =
      autoMode
        ? maxHeight != null && Number.isFinite(maxHeight) && maxHeight > 0
          ? maxHeight
          : null
        : quality != null && Number.isFinite(Number(quality)) && Number(quality) > 0
          ? Number(quality)
          : null;

    const loadKey = `${autoMode ? TA_PLUS_QUALITY_AUTO : quality}:${playUrl}`;
    // Capture once per load — parent may clear taPlusSeekSeconds on ready; that must NOT reload HLS.
    const bootSeekAtLoad = bootSeekRef.current;
    setError(null);
    streamFailedSentRef.current = false;
    seekAppliedForSrcRef.current = null;
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
    video.removeAttribute("src");
    video.load();
    video.playbackRate = playbackRateRef.current;
    onActiveQualityChangeRef.current?.(activeHeight);
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
      const target = bootSeekAtLoad;
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
    };

    const failHard = (message: string) => {
      if (disposed) return;
      setError(message);
      notifyStreamFailed();
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, preparePlayback);
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
        failHard("Не удалось воспроизвести поток");
      });
    } else if (canPlayNativeHls(video)) {
      video.src = playUrl;
      video.addEventListener("loadedmetadata", preparePlayback, { once: true });
      const onNativeError = () => {
        if (disposed) return;
        failHard("Не удалось воспроизвести поток");
      };
      video.addEventListener("error", onNativeError);
      return () => {
        disposed = true;
        video.removeEventListener("error", onNativeError);
        destroyHls();
      };
    } else {
      setError("Браузер не поддерживает HLS");
    }

    return () => {
      disposed = true;
      destroyHls();
    };
    // Intentionally omit bootSeekSeconds: resume is applied once at load via bootSeekRef.
  }, [autoMode, qualities, quality, src]);

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
      onPlaying?.();
      emitProgress("time");
    };
    const onPauseEvent = () => {
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

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", onProgressEvent);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPauseEvent);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEndedEvent);
    video.addEventListener("volumechange", onVolumeChange);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", onProgressEvent);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPauseEvent);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
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
          className="absolute inset-0 h-full w-full object-contain"
          controls={false}
          playsInline
          preload="metadata"
          title={title}
        />
        {error ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-white">
            {error}
          </div>
        ) : null}
        {!src && !error ? (
          <div className="absolute inset-0 animate-pulse bg-surface-dim" />
        ) : null}
      </div>
    </div>
  );
});
