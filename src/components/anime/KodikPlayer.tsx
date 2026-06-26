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

export type KodikPlayerHandle = {
  seekAndPlay: (resume: KodikPlayerResume) => void;
};

type Props = {
  src: string;
  title: string;
  initialResume?: KodikPlayerResume | null;
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
};

type EpisodeState = { seasonNumber: number; episodeNumber: number };

type ContinueFlow = {
  resume: KodikPlayerResume;
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
  _current: EpisodeState,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearContinueFlow(continueFlowRef.current);
  onContinueStateChange?.(true);

  const flow: ContinueFlow = { resume, stage: "episode", timers: [] };
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
    onReady,
    onContinueStateChange,
    onProgress,
    onPause,
    onTranslationChange,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const episodeRef = useRef<EpisodeState>({ seasonNumber: 1, episodeNumber: 1 });
  const positionRef = useRef(0);
  const translationIdRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);
  const playerReadyRef = useRef(false);
  const continueFlowRef = useRef<ContinueFlow | null>(null);
  const onProgressRef = useRef(onProgress);
  const onPauseRef = useRef(onPause);
  const onTranslationChangeRef = useRef(onTranslationChange);
  const onReadyRef = useRef(onReady);
  const onContinueStateChangeRef = useRef(onContinueStateChange);

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
    translationIdRef.current = null;
    clearContinueFlow(continueFlowRef.current);
    continueFlowRef.current = null;
    onContinueStateChangeRef.current?.(false);
  }, [src]);

  useImperativeHandle(ref, () => ({
    seekAndPlay(resume: KodikPlayerResume) {
      if (!iframeRef.current) {
        onContinueStateChangeRef.current?.(false);
        return;
      }
      startContinueFlow(
        iframeRef.current,
        resume,
        episodeRef.current,
        continueFlowRef,
        episodeRef,
        onContinueStateChangeRef.current,
      );
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
        onProgressRef.current?.({
          seasonNumber: episodeRef.current.seasonNumber,
          episodeNumber: episodeRef.current.episodeNumber,
          positionSeconds: event.data.value,
        });
      }

      if (event.data.key === "kodik_player_pause") {
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
    <div className="overflow-hidden rounded-lg border border-border bg-black shadow-inner">
      <div className="relative aspect-video w-full">
        <iframe
          ref={iframeRef}
          src={toKodikPlayerEmbedUrl(src)}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allowFullScreen
          allow="autoplay *; fullscreen *"
          onLoad={markPlayerReady}
        />
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
