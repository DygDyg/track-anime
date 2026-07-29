"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  isKodikPlayerMessage,
  sendKodikCommand,
  type KodikCurrentEpisode,
} from "@/lib/kodik-player-api";
import {
  readKodikPlayerVolumePreferences,
  writeKodikPlayerVolumePreferences,
} from "@/lib/kodik-player-volume-preferences";
import { toKodikPlayerEmbedUrl } from "@/lib/player-url";

export type KodikPlayerResume = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
};

export type KodikPlayerResumeMode = "play" | "pause";

export type KodikPlayerPlaybackState = {
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
  muted: boolean;
};

export type KodikPlayerProgressPayload = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  source?: "episode" | "time";
};

export type KodikPlayerHandle = {
  seekTo: (resume: KodikPlayerResume, mode?: KodikPlayerResumeMode) => void;
  seekBy: (deltaSeconds: number) => void;
  abortContinue: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekToPosition: (seconds: number) => void;
  syncToPosition: (seconds: number, mode: KodikPlayerResumeMode) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unmute: () => void;
};

const CONTINUE_HARD_TIMEOUT_MS = 15_000;
const CONTINUE_PAUSE_AFTER_SEEK_MS = 500;
const CONTINUE_PAUSE_RETRY_DELAYS_MS = [200, 500, 1000, 1800] as const;
const SEEK_BY_FLUSH_DELAY_MS = 120;
const INITIAL_STATE_REQUEST_DELAYS_MS = [0, 250, 750, 1500] as const;

const DEFAULT_PLAYBACK_STATE: KodikPlayerPlaybackState = {
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 1,
  muted: false,
};

type Props = {
  src: string;
  title: string;
  initialResume?: KodikPlayerResume | null;
  /** viewport — по высоте окна (минус шапка), с сохранением 16:9 */
  sizeMode?: "default" | "viewport";
  /** TA-плеер: внешний кадр 16:9, внутренний iframe 16:9 на всю область (настройка crop в CSS) */
  chromelessBeta?: boolean;
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
  onEnded?: () => void;
};

type EpisodeState = { seasonNumber: number; episodeNumber: number };

type ContinueFlow = {
  resume: KodikPlayerResume;
  autoplay: boolean;
  stage: "episode" | "play" | "seek" | "pausing";
  timers: number[];
};

function clearFlowTimers(flow: ContinueFlow): void {
  for (const id of flow.timers) window.clearTimeout(id);
  flow.timers.length = 0;
}

function completeContinueFlow(
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearContinueFlow(flow);
  if (continueFlowRef.current === flow) {
    continueFlowRef.current = null;
  }
  onContinueStateChange?.(false);
}

function beginPausingAfterSeek(
  iframe: HTMLIFrameElement,
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearFlowTimers(flow);
  flow.stage = "pausing";
  sendKodikCommand(iframe, { method: "pause" });

  for (const delay of CONTINUE_PAUSE_RETRY_DELAYS_MS) {
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow || flow.stage !== "pausing") return;
        sendKodikCommand(iframe, { method: "pause" });
      }, delay),
    );
  }

  const lastRetry = CONTINUE_PAUSE_RETRY_DELAYS_MS[CONTINUE_PAUSE_RETRY_DELAYS_MS.length - 1] ?? 0;
  flow.timers.push(
    window.setTimeout(() => {
      if (continueFlowRef.current !== flow) return;
      completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
    }, lastRetry + 400),
  );
}

function commandSeason(seasonNumber: number): number | undefined {
  return seasonNumber === 1 ? undefined : seasonNumber;
}

function normalizeEpisode(value: KodikCurrentEpisode): EpisodeState {
  return {
    seasonNumber: value.season ?? 1,
    episodeNumber: value.episode ?? 1,
  };
}

function episodeMatches(resume: KodikPlayerResume, current: EpisodeState): boolean {
  return (
    current.episodeNumber === resume.episodeNumber && current.seasonNumber === resume.seasonNumber
  );
}

function clearContinueFlow(flow: ContinueFlow | null): void {
  if (!flow) return;
  for (const id of flow.timers) window.clearTimeout(id);
}

function savePlaybackVolume(state: KodikPlayerPlaybackState): void {
  writeKodikPlayerVolumePreferences({
    volume: state.volume,
    muted: state.muted,
  });
}

function applyInitialSeek(
  iframe: HTMLIFrameElement,
  resume: KodikPlayerResume,
  current: EpisodeState,
): void {
  const needsEpisodeChange = !episodeMatches(resume, current);

  if (needsEpisodeChange) {
    sendKodikCommand(iframe, {
      method: "change_episode",
      season: commandSeason(resume.seasonNumber),
      episode: resume.episodeNumber,
    });
  }

  if (resume.positionSeconds < 1) return;

  const seekDelay = needsEpisodeChange ? 700 : 150;
  window.setTimeout(() => {
    sendKodikCommand(iframe, { method: "seek", seconds: resume.positionSeconds });
  }, seekDelay);
}

function finishContinueSeek(
  iframe: HTMLIFrameElement,
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearFlowTimers(flow);

  if (!episodeMatches(flow.resume, episodeRef.current)) {
    flow.stage = "episode";
    sendKodikCommand(iframe, {
      method: "change_episode",
      season: commandSeason(flow.resume.seasonNumber),
      episode: flow.resume.episodeNumber,
    });

    const retryId = window.setTimeout(() => {
      if (continueFlowRef.current !== flow || flow.stage !== "episode") return;
      requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    }, 1_800);
    flow.timers.push(retryId);
    return;
  }

  if (flow.resume.positionSeconds >= 1) {
    if (!flow.autoplay) {
      flow.stage = "seek";
      sendKodikCommand(iframe, { method: "seek", seconds: flow.resume.positionSeconds });
      // Kodik often ignores an immediate pause and/or resumes after buffering.
      // Wait for seek ack (or timeout), then pause with retries.
      flow.timers.push(
        window.setTimeout(() => {
          if (continueFlowRef.current !== flow || flow.stage !== "seek") return;
          beginPausingAfterSeek(iframe, flow, continueFlowRef, onContinueStateChange);
        }, CONTINUE_PAUSE_AFTER_SEEK_MS),
      );
      return;
    }

    sendKodikCommand(iframe, { method: "seek", seconds: flow.resume.positionSeconds });
    completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
    return;
  }

  if (!flow.autoplay) {
    beginPausingAfterSeek(iframe, flow, continueFlowRef, onContinueStateChange);
    return;
  }

  completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
}

function requestPlayThenSeek(
  iframe: HTMLIFrameElement,
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearFlowTimers(flow);
  flow.stage = "play";
  sendKodikCommand(iframe, { method: "play" });

  // Pause resume needs the media to actually start; `play` alone is too early.
  const fallbackId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow || flow.stage !== "play") return;
    finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
  }, flow.autoplay ? 5_000 : 2_500);
  flow.timers.push(fallbackId);
}

function startContinueFlow(
  iframe: HTMLIFrameElement,
  resume: KodikPlayerResume,
  autoplay: boolean,
  current: EpisodeState,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearContinueFlow(continueFlowRef.current);
  onContinueStateChange?.(true);

  const flow: ContinueFlow = { resume, autoplay, stage: "episode", timers: [] };
  continueFlowRef.current = flow;

  sendKodikCommand(iframe, {
    method: "change_episode",
    season: commandSeason(resume.seasonNumber),
    episode: resume.episodeNumber,
  });

  const episodeFallbackId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow || flow.stage !== "episode") return;
    requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
  }, episodeMatches(resume, current) ? 450 : 1_800);
  flow.timers.push(episodeFallbackId);

  const hardTimeoutId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow) return;
    completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
  }, CONTINUE_HARD_TIMEOUT_MS);
  flow.timers.push(hardTimeoutId);
}

function handleContinueFlowMessage(
  event: MessageEvent,
  iframe: HTMLIFrameElement | null,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  const flow = continueFlowRef.current;
  if (!flow || !iframe || !isKodikPlayerMessage(event.data)) return;

  if (
    flow.stage === "episode" &&
    event.data.key === "kodik_player_current_episode" &&
    event.data.value
  ) {
    const episode = normalizeEpisode(event.data.value as KodikCurrentEpisode);
    if (episodeMatches(flow.resume, episode)) {
      clearFlowTimers(flow);
      requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    }
    return;
  }

  if (flow.stage === "play") {
    const playReady = event.data.key === "kodik_player_play";
    const videoStarted = event.data.key === "kodik_player_video_started";
    // For pause resume, wait until media actually started — early `play` + pause is ignored.
    if (videoStarted || (flow.autoplay && playReady)) {
      finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    }
    return;
  }

  if (flow.stage === "seek" && event.data.key === "kodik_player_seek") {
    beginPausingAfterSeek(iframe, flow, continueFlowRef, onContinueStateChange);
    return;
  }

  if (
    flow.stage === "pausing" &&
    (event.data.key === "kodik_player_play" || event.data.key === "kodik_player_video_started")
  ) {
    sendKodikCommand(iframe, { method: "pause" });
  }
}

export const KodikPlayer = forwardRef<KodikPlayerHandle, Props>(function KodikPlayer(
  {
    src,
    title,
    initialResume,
    sizeMode = "default",
    chromelessBeta = false,
    onReady,
    onContinueStateChange,
    onProgress,
    onPause,
    onTranslationChange,
    onPlaybackStateChange,
    onEnded,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const episodeRef = useRef<EpisodeState>({ seasonNumber: 1, episodeNumber: 1 });
  const positionRef = useRef(0);
  const playbackRef = useRef<KodikPlayerPlaybackState>({ ...DEFAULT_PLAYBACK_STATE });
  const translationIdRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);
  const playerReadyRef = useRef(false);
  const continueFlowRef = useRef<ContinueFlow | null>(null);
  const bufferedSeekTargetRef = useRef<number | null>(null);
  const bufferedSeekTimerRef = useRef<number | null>(null);
  const stateRequestTimersRef = useRef<number[]>([]);
  const onProgressRef = useRef(onProgress);
  const onPauseRef = useRef(onPause);
  const onTranslationChangeRef = useRef(onTranslationChange);
  const onReadyRef = useRef(onReady);
  const onContinueStateChangeRef = useRef(onContinueStateChange);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  const onEndedRef = useRef(onEnded);

  const emitPlaybackState = () => {
    onPlaybackStateChangeRef.current?.({ ...playbackRef.current });
  };

  const patchPlayback = (patch: Partial<KodikPlayerPlaybackState>) => {
    playbackRef.current = { ...playbackRef.current, ...patch };
    emitPlaybackState();
  };

  const clearBufferedSeek = () => {
    if (bufferedSeekTimerRef.current != null) {
      window.clearTimeout(bufferedSeekTimerRef.current);
      bufferedSeekTimerRef.current = null;
    }
    bufferedSeekTargetRef.current = null;
  };

  const clearStateRequestTimers = () => {
    for (const id of stateRequestTimersRef.current) window.clearTimeout(id);
    stateRequestTimersRef.current = [];
  };

  const hydratePlaybackVolumeFromStorage = () => {
    const preferences = readKodikPlayerVolumePreferences();
    if (!preferences) return;

    playbackRef.current = {
      ...playbackRef.current,
      volume: preferences.volume,
      muted: preferences.muted,
    };
    emitPlaybackState();
  };

  const requestInitialPlayerState = () => {
    clearStateRequestTimers();
    stateRequestTimersRef.current = INITIAL_STATE_REQUEST_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        if (!iframeRef.current) return;
        sendKodikCommand(iframeRef.current, { method: "get_time" });
      }, delay),
    );
  };

  const flushBufferedSeek = () => {
    const target = bufferedSeekTargetRef.current;
    bufferedSeekTimerRef.current = null;
    bufferedSeekTargetRef.current = null;
    if (!iframeRef.current || target == null) return;
    sendKodikCommand(iframeRef.current, { method: "seek", seconds: target });
  };

  const scheduleBufferedSeek = (target: number) => {
    bufferedSeekTargetRef.current = target;
    if (bufferedSeekTimerRef.current != null) {
      window.clearTimeout(bufferedSeekTimerRef.current);
    }
    bufferedSeekTimerRef.current = window.setTimeout(flushBufferedSeek, SEEK_BY_FLUSH_DELAY_MS);
  };

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onPauseRef.current = onPause;
  }, [onPause]);

  useEffect(() => {
    onTranslationChangeRef.current = onTranslationChange;
  }, [onTranslationChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onContinueStateChangeRef.current = onContinueStateChange;
  }, [onContinueStateChange]);

  useEffect(() => {
    onPlaybackStateChangeRef.current = onPlaybackStateChange;
  }, [onPlaybackStateChange]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const markPlayerReady = () => {
    if (playerReadyRef.current) return;
    playerReadyRef.current = true;
    requestInitialPlayerState();
    onReadyRef.current?.();
  };

  useEffect(() => {
    resumeAppliedRef.current = false;
    playerReadyRef.current = false;
    episodeRef.current = { seasonNumber: 1, episodeNumber: 1 };
    positionRef.current = 0;
    playbackRef.current = { ...DEFAULT_PLAYBACK_STATE };
    emitPlaybackState();
    hydratePlaybackVolumeFromStorage();
    translationIdRef.current = null;
    clearContinueFlow(continueFlowRef.current);
    continueFlowRef.current = null;
    clearBufferedSeek();
    clearStateRequestTimers();
    onContinueStateChangeRef.current?.(false);
  }, [src]);

  useImperativeHandle(ref, () => ({
    seekTo(resume: KodikPlayerResume, mode: KodikPlayerResumeMode = "play") {
      if (!iframeRef.current) {
        onContinueStateChangeRef.current?.(false);
        return;
      }
      clearBufferedSeek();
      const currentEpisode = episodeRef.current;
      episodeRef.current = {
        seasonNumber: resume.seasonNumber,
        episodeNumber: resume.episodeNumber,
      };
      positionRef.current = Math.max(0, resume.positionSeconds);
      patchPlayback({ positionSeconds: positionRef.current, isPlaying: mode === "play" });
      onProgressRef.current?.({
        seasonNumber: resume.seasonNumber,
        episodeNumber: resume.episodeNumber,
        positionSeconds: positionRef.current,
        source: "episode",
      });
      startContinueFlow(
        iframeRef.current,
        resume,
        mode === "play",
        currentEpisode,
        continueFlowRef,
        episodeRef,
        onContinueStateChangeRef.current,
      );
    },
    seekBy(deltaSeconds: number) {
      if (!iframeRef.current || !Number.isFinite(deltaSeconds)) return;
      const duration = playbackRef.current.durationSeconds;
      const nextRaw = positionRef.current + deltaSeconds;
      const next = duration > 0 ? Math.min(duration, Math.max(0, nextRaw)) : Math.max(0, nextRaw);
      positionRef.current = next;
      patchPlayback({ positionSeconds: next });
      scheduleBufferedSeek(next);
    },
    play() {
      if (!iframeRef.current) return;
      sendKodikCommand(iframeRef.current, { method: "play" });
    },
    pause() {
      if (!iframeRef.current) return;
      sendKodikCommand(iframeRef.current, { method: "pause" });
    },
    togglePlay() {
      if (!iframeRef.current) return;
      sendKodikCommand(iframeRef.current, {
        method: playbackRef.current.isPlaying ? "pause" : "play",
      });
    },
    seekToPosition(seconds: number) {
      if (!iframeRef.current || !Number.isFinite(seconds)) return;
      clearBufferedSeek();
      const duration = playbackRef.current.durationSeconds;
      const nextRaw = Math.max(0, seconds);
      const next = duration > 0 ? Math.min(duration, nextRaw) : nextRaw;
      positionRef.current = next;
      patchPlayback({ positionSeconds: next });
      sendKodikCommand(iframeRef.current, { method: "seek", seconds: next });
    },
    syncToPosition(seconds: number, mode: KodikPlayerResumeMode) {
      if (!iframeRef.current || !Number.isFinite(seconds)) return;
      clearBufferedSeek();
      const duration = playbackRef.current.durationSeconds;
      const nextRaw = Math.max(0, seconds);
      const next = duration > 0 ? Math.min(duration, nextRaw) : nextRaw;
      positionRef.current = next;
      patchPlayback({ positionSeconds: next, isPlaying: mode === "play" });
      sendKodikCommand(iframeRef.current, { method: "seek", seconds: next });

      if (mode === "play") {
        window.setTimeout(() => {
          if (!iframeRef.current) return;
          sendKodikCommand(iframeRef.current, { method: "play" });
        }, 80);
        return;
      }

      sendKodikCommand(iframeRef.current, { method: "pause" });
      for (const delay of [120, 350, 800]) {
        window.setTimeout(() => {
          if (!iframeRef.current) return;
          sendKodikCommand(iframeRef.current, { method: "pause" });
        }, delay);
      }
    },
    setVolume(volume: number) {
      if (!iframeRef.current || !Number.isFinite(volume)) return;
      const nextVolume = Math.min(1, Math.max(0, volume));
      const nextPlayback = { ...playbackRef.current, volume: nextVolume };
      playbackRef.current = nextPlayback;
      emitPlaybackState();
      savePlaybackVolume(nextPlayback);
      sendKodikCommand(iframeRef.current, {
        method: "volume",
        volume: nextVolume,
      });
    },
    mute() {
      if (!iframeRef.current) return;
      const nextPlayback = { ...playbackRef.current, muted: true };
      playbackRef.current = nextPlayback;
      emitPlaybackState();
      savePlaybackVolume(nextPlayback);
      sendKodikCommand(iframeRef.current, { method: "mute" });
    },
    unmute() {
      if (!iframeRef.current) return;
      const nextPlayback = { ...playbackRef.current, muted: false };
      playbackRef.current = nextPlayback;
      emitPlaybackState();
      savePlaybackVolume(nextPlayback);
      sendKodikCommand(iframeRef.current, { method: "unmute" });
    },
    abortContinue() {
      clearContinueFlow(continueFlowRef.current);
      continueFlowRef.current = null;
      onContinueStateChangeRef.current?.(false);
    },
  }));

  useEffect(() => {
    const applyInitialResume = () => {
      if (!initialResume || resumeAppliedRef.current || !iframeRef.current) return;
      applyInitialSeek(iframeRef.current, initialResume, episodeRef.current);
      resumeAppliedRef.current = true;
    };

    const onMessage = (event: MessageEvent) => {
      handleContinueFlowMessage(
        event,
        iframeRef.current,
        continueFlowRef,
        episodeRef,
        onContinueStateChangeRef.current,
      );

      if (!isKodikPlayerMessage(event.data)) return;

      if (event.data.key === "kodik_player_current_episode" && event.data.value) {
        markPlayerReady();
        const currentEpisode = event.data.value as KodikCurrentEpisode;
        const nextEpisode = normalizeEpisode(currentEpisode);
        const continueFlow = continueFlowRef.current;
        if (continueFlow && !episodeMatches(continueFlow.resume, nextEpisode)) return;
        episodeRef.current = nextEpisode;
        applyInitialResume();

        onProgressRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: positionRef.current,
          source: "episode",
        });

        const translationId = currentEpisode.translation?.id;
        if (translationId != null && translationIdRef.current !== translationId) {
          translationIdRef.current = translationId;
          onTranslationChangeRef.current?.({
            id: translationId,
            title: currentEpisode.translation?.title ?? "",
          });
        }
      }

      if (event.data.key === "kodik_player_time_update" && typeof event.data.value === "number") {
        if (continueFlowRef.current) return;
        positionRef.current = event.data.value;
        patchPlayback({ positionSeconds: event.data.value });
        onProgressRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: event.data.value,
          source: "time",
        });
      }

      if (event.data.key === "kodik_player_time" && typeof event.data.value === "number") {
        if (continueFlowRef.current) return;
        positionRef.current = event.data.value;
        patchPlayback({ positionSeconds: event.data.value });
      }

      if (event.data.key === "kodik_player_play") {
        const flow = continueFlowRef.current;
        // Pause-resume briefly plays to unlock seek; don't flip UI to playing while we force-pause.
        if (flow && !flow.autoplay && (flow.stage === "seek" || flow.stage === "pausing")) {
          return;
        }
        patchPlayback({ isPlaying: true });
      }

      if (event.data.key === "kodik_player_duration_update" && typeof event.data.value === "number") {
        patchPlayback({ durationSeconds: event.data.value });
      }

      if (event.data.key === "kodik_player_volume_change" && event.data.value) {
        const value = event.data.value as { muted?: boolean; volume?: number };
        const nextPlayback = {
          ...playbackRef.current,
          muted: value.muted === true,
          volume: typeof value.volume === "number" ? value.volume : playbackRef.current.volume,
        };
        playbackRef.current = nextPlayback;
        emitPlaybackState();
        savePlaybackVolume(nextPlayback);
      }

      if (event.data.key === "kodik_player_pause") {
        patchPlayback({ isPlaying: false });
        onPauseRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: positionRef.current,
        });
      }

      if (event.data.key === "kodik_player_video_ended") {
        onEndedRef.current?.();
        patchPlayback({ isPlaying: false });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearContinueFlow(continueFlowRef.current);
      continueFlowRef.current = null;
      clearBufferedSeek();
      clearStateRequestTimers();
      onContinueStateChangeRef.current?.(false);
    };
  }, [initialResume, src]);

  useEffect(() => {
    if (!initialResume || resumeAppliedRef.current) return;

    const timer = window.setTimeout(() => {
      applyResumeFallback(initialResume, iframeRef, resumeAppliedRef, episodeRef);
    }, 1_500);

    return () => window.clearTimeout(timer);
  }, [initialResume, src]);

  return (
    <div
      className={[
        "overflow-hidden rounded-lg border border-border bg-black shadow-inner",
        sizeMode === "viewport" ? "anime-player-shell-viewport" : "",
        chromelessBeta ? "rounded-none border-0 shadow-none" : "",
      ].join(" ")}
    >
      <div
        className={[
          "relative w-full",
          sizeMode === "viewport" ? "anime-player-viewport-frame" : "aspect-video",
          chromelessBeta ? "kodik-player-beta-frame" : "",
        ].join(" ")}
      >
        {chromelessBeta ? (
          <div className="kodik-player-beta-inner">
            <iframe
              ref={iframeRef}
              src={toKodikPlayerEmbedUrl(src)}
              title={title}
              className="kodik-player-beta-iframe"
              allow="autoplay *"
              onLoad={markPlayerReady}
            />
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={toKodikPlayerEmbedUrl(src)}
            title={title}
            className="absolute inset-0 h-full w-full border-0"
            allowFullScreen
            allow="autoplay *; fullscreen *"
            onLoad={markPlayerReady}
          />
        )}
      </div>
    </div>
  );
});

function applyResumeFallback(
  resume: KodikPlayerResume,
  iframeRef: RefObject<HTMLIFrameElement | null>,
  resumeAppliedRef: MutableRefObject<boolean>,
  episodeRef: MutableRefObject<EpisodeState>,
) {
  if (resumeAppliedRef.current || !iframeRef.current) return;

  applyInitialSeek(iframeRef.current, resume, episodeRef.current);
  resumeAppliedRef.current = true;
}
