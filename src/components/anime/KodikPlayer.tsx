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

export type KodikPlayerHandle = {
  seekTo: (resume: KodikPlayerResume, mode?: KodikPlayerResumeMode) => void;
  seekBy: (deltaSeconds: number) => void;
  abortContinue: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekToPosition: (seconds: number) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unmute: () => void;
};

const CONTINUE_HARD_TIMEOUT_MS = 15_000;

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
  /** Beta: внешний кадр 16:9, внутренний iframe 16:9 на всю область (настройка crop в CSS) */
  chromelessBeta?: boolean;
  onReady?: () => void;
  onContinueStateChange?: (active: boolean) => void;
  onProgress?: (payload: {
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  }) => void;
  onPause?: (payload: {
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  }) => void;
  onTranslationChange?: (translation: { id: number; title: string }) => void;
  onPlaybackStateChange?: (state: KodikPlayerPlaybackState) => void;
};

type EpisodeState = { seasonNumber: number; episodeNumber: number };

type ContinueFlow = {
  resume: KodikPlayerResume;
  autoplay: boolean;
  stage: "episode" | "play";
  timers: number[];
};

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

function applyInitialSeek(
  iframe: HTMLIFrameElement,
  resume: KodikPlayerResume,
  current: EpisodeState,
): void {
  const needsEpisodeChange = !episodeMatches(resume, current);

  if (needsEpisodeChange) {
    sendKodikCommand(iframe, {
      method: "change_episode",
      season: resume.seasonNumber > 1 ? resume.seasonNumber : undefined,
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
  if (!episodeMatches(flow.resume, episodeRef.current)) {
    for (const id of flow.timers) window.clearTimeout(id);
    flow.timers.length = 0;
    flow.stage = "episode";
    sendKodikCommand(iframe, {
      method: "change_episode",
      season: flow.resume.seasonNumber > 1 ? flow.resume.seasonNumber : undefined,
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
    sendKodikCommand(iframe, { method: "seek", seconds: flow.resume.positionSeconds });
  }

  if (!flow.autoplay) {
    window.setTimeout(() => {
      sendKodikCommand(iframe, { method: "pause" });
    }, 350);
  }

  clearContinueFlow(flow);
  continueFlowRef.current = null;
  onContinueStateChange?.(false);
}

function requestPlayThenSeek(
  iframe: HTMLIFrameElement,
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  if (!flow.autoplay) {
    finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    return;
  }

  flow.stage = "play";
  sendKodikCommand(iframe, { method: "play" });

  const fallbackId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow || flow.stage !== "play") return;
    finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
  }, 5_000);
  flow.timers.push(fallbackId);
}

function startContinueFlow(
  iframe: HTMLIFrameElement,
  resume: KodikPlayerResume,
  autoplay: boolean,
  _current: EpisodeState,
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
    season: resume.seasonNumber > 1 ? resume.seasonNumber : undefined,
    episode: resume.episodeNumber,
  });

  const episodeFallbackId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow || flow.stage !== "episode") return;
    requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
  }, 1_800);
  flow.timers.push(episodeFallbackId);

  const hardTimeoutId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow) return;
    clearContinueFlow(flow);
    continueFlowRef.current = null;
    onContinueStateChange?.(false);
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
      for (const id of flow.timers) window.clearTimeout(id);
      flow.timers.length = 0;
      requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    }
    return;
  }

  if (
    flow.stage === "play" &&
    (event.data.key === "kodik_player_play" || event.data.key === "kodik_player_video_started")
  ) {
    finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
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
  const onProgressRef = useRef(onProgress);
  const onPauseRef = useRef(onPause);
  const onTranslationChangeRef = useRef(onTranslationChange);
  const onReadyRef = useRef(onReady);
  const onContinueStateChangeRef = useRef(onContinueStateChange);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);

  const emitPlaybackState = () => {
    onPlaybackStateChangeRef.current?.({ ...playbackRef.current });
  };

  const patchPlayback = (patch: Partial<KodikPlayerPlaybackState>) => {
    playbackRef.current = { ...playbackRef.current, ...patch };
    emitPlaybackState();
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

  const markPlayerReady = () => {
    if (playerReadyRef.current) return;
    playerReadyRef.current = true;
    onReadyRef.current?.();
  };

  useEffect(() => {
    resumeAppliedRef.current = false;
    playerReadyRef.current = false;
    episodeRef.current = { seasonNumber: 1, episodeNumber: 1 };
    positionRef.current = 0;
    playbackRef.current = { ...DEFAULT_PLAYBACK_STATE };
    emitPlaybackState();
    translationIdRef.current = null;
    clearContinueFlow(continueFlowRef.current);
    continueFlowRef.current = null;
    onContinueStateChangeRef.current?.(false);
  }, [src]);

  useImperativeHandle(ref, () => ({
    seekTo(resume: KodikPlayerResume, mode: KodikPlayerResumeMode = "play") {
      if (!iframeRef.current) {
        onContinueStateChangeRef.current?.(false);
        return;
      }
      startContinueFlow(
        iframeRef.current,
        resume,
        mode === "play",
        episodeRef.current,
        continueFlowRef,
        episodeRef,
        onContinueStateChangeRef.current,
      );
    },
    seekBy(deltaSeconds: number) {
      if (!iframeRef.current || !Number.isFinite(deltaSeconds)) return;
      const next = Math.max(0, positionRef.current + deltaSeconds);
      sendKodikCommand(iframeRef.current, { method: "seek", seconds: next });
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
      sendKodikCommand(iframeRef.current, { method: "seek", seconds: Math.max(0, seconds) });
    },
    setVolume(volume: number) {
      if (!iframeRef.current || !Number.isFinite(volume)) return;
      sendKodikCommand(iframeRef.current, {
        method: "volume",
        volume: Math.min(1, Math.max(0, volume)),
      });
    },
    mute() {
      if (!iframeRef.current) return;
      sendKodikCommand(iframeRef.current, { method: "mute" });
    },
    unmute() {
      if (!iframeRef.current) return;
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
        episodeRef.current = normalizeEpisode(currentEpisode);
        applyInitialResume();

        onProgressRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: positionRef.current,
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
        positionRef.current = event.data.value;
        patchPlayback({ positionSeconds: event.data.value });
        onProgressRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: event.data.value,
        });
      }

      if (event.data.key === "kodik_player_play") {
        patchPlayback({ isPlaying: true });
      }

      if (event.data.key === "kodik_player_duration_update" && typeof event.data.value === "number") {
        patchPlayback({ durationSeconds: event.data.value });
      }

      if (event.data.key === "kodik_player_volume_change" && event.data.value) {
        const value = event.data.value as { muted?: boolean; volume?: number };
        patchPlayback({
          muted: value.muted === true,
          volume: typeof value.volume === "number" ? value.volume : playbackRef.current.volume,
        });
      }

      if (event.data.key === "kodik_player_pause") {
        patchPlayback({ isPlaying: false });
        onPauseRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: positionRef.current,
        });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearContinueFlow(continueFlowRef.current);
      continueFlowRef.current = null;
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
              allowFullScreen
              allow="autoplay *; fullscreen *"
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
        {chromelessBeta ? (
          <span
            className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-white/20 bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-sm"
            aria-hidden
          >
            Beta
          </span>
        ) : null}
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
