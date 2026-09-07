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
  logKodikPlayerDebugMessage,
  sendKodikCommand,
  type KodikCurrentEpisode,
} from "@/lib/kodik-player-api";
import {
  readKodikPlayerVolumePreferences,
  writeKodikPlayerVolumePreferences,
} from "@/lib/kodik-player-volume-preferences";
import {
  detectKodikPlayerLinkMode,
  toKodikPlayerEmbedUrl,
  type KodikPlayerLinkMode,
} from "@/lib/player-url";

export type KodikPlayerResume = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
};

export type KodikPlayerResumeMode = "play" | "pause";

export type KodikPlayerSeekOptions = {
  /**
   * UI / bootResume / Continue `/seria/` remount already points at this episode.
   * Still sends change_episode when needed, then blind play→seek shortly after —
   * waiting for a second current_episode often hangs on «подождите…».
   * Prefer remounting Continue onto a per-episode `/seria/` embed when available.
   */
  uiEpisodeAlreadyTargeted?: boolean;
};

export type KodikPlayerPlaybackState = {
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
  muted: boolean;
  /** True after Kodik actually started media (needed for Android WebView gesture unlock). */
  mediaUnlocked: boolean;
  /**
   * True after the video stream is ready for playback UI overlays:
   * `kodik_player_video_started` and a known duration (not just `play` / mediaUnlocked).
   */
  videoReady: boolean;
};

export type KodikPlayerProgressPayload = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  source?: "episode" | "time";
};

export type KodikPlayerHandle = {
  seekTo: (
    resume: KodikPlayerResume,
    mode?: KodikPlayerResumeMode,
    options?: KodikPlayerSeekOptions,
  ) => void;
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

const CONTINUE_HARD_TIMEOUT_MS = 20_000;
const CONTINUE_PAUSE_AFTER_SEEK_MS = 500;
const CONTINUE_PAUSE_RETRY_DELAYS_MS = [200, 500, 1000, 1800] as const;
/** After video_started: mobile needs a longer beat before seek sticks. */
const CONTINUE_SEEK_AFTER_VIDEO_STARTED_MS = 450;
const CONTINUE_SEEK_AFTER_VIDEO_STARTED_DESKTOP_MS = 180;
/** Keep re-seeking while Kodik rebuffers from 0 after an early seek. */
const CONTINUE_AUTOPLAY_SEEK_RETRY_MS = [200, 600, 1_200, 2_000, 3_200] as const;
const CONTINUE_AUTOPLAY_CONFIRM_MS = 4_500;
const CONTINUE_POSITION_TOLERANCE_SECONDS = 10;
const CONTINUE_NEAR_START_SECONDS = 3;
const CONTINUE_PLAY_RETRY_MS = [700, 1_600, 3_000, 5_000] as const;
/** Re-send change_episode while waiting for kodik_player_current_episode. */
const CONTINUE_EPISODE_CHANGE_RETRY_MS = [1_800, 3_600, 6_000] as const;
/**
 * Next-episode / start-at-0 only: if Kodik never re-emits current_episode after change_episode,
 * force play→complete. Not used for resume-with-seek (would seek into the wrong episode).
 */
const CONTINUE_EPISODE_FORCE_PLAY_MS = 7_500;
const SEEK_BY_FLUSH_DELAY_MS = 120;
const INITIAL_STATE_REQUEST_DELAYS_MS = [0, 250, 750, 1500] as const;
/** Don't re-render the watch panel on every Kodik time_update (GPU thrash → A/V freeze). */
const PLAYBACK_POSITION_EMIT_MS = 400;

const DEFAULT_PLAYBACK_STATE: KodikPlayerPlaybackState = {
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 1,
  muted: false,
  mediaUnlocked: false,
  videoReady: false,
};

type EpisodeState = { seasonNumber: number; episodeNumber: number };

type Props = {
  src: string;
  title: string;
  initialResume?: KodikPlayerResume | null;
  /** viewport — по высоте окна (минус шапка), с сохранением 16:9 */
  sizeMode?: "default" | "viewport";
  /**
   * Intended S/E for this iframe. `/seria/` embeds report episode=null; seed from this
   * instead of defaulting to 1 so the strip and watch-history stay on the selected series.
   */
  activeEpisode?: EpisodeState | null;
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

type ContinueFlow = {
  resume: KodikPlayerResume;
  autoplay: boolean;
  stage: "episode" | "play" | "seek" | "confirm" | "pausing";
  timers: number[];
  linkMode: KodikPlayerLinkMode;
  /** Survives clearFlowTimers — otherwise play/episode retries cancel the abort and hang forever. */
  hardTimeoutId?: number;
  lastReseekAtMs?: number;
};

function clearFlowTimers(flow: ContinueFlow): void {
  for (const id of flow.timers) window.clearTimeout(id);
  flow.timers.length = 0;
}

function clearContinueFlow(flow: ContinueFlow | null): void {
  if (!flow) return;
  clearFlowTimers(flow);
  if (flow.hardTimeoutId != null) {
    window.clearTimeout(flow.hardTimeoutId);
    flow.hardTimeoutId = undefined;
  }
}

function armContinueHardTimeout(
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  if (flow.hardTimeoutId != null) {
    window.clearTimeout(flow.hardTimeoutId);
  }
  flow.hardTimeoutId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow) return;
    completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
  }, CONTINUE_HARD_TIMEOUT_MS);
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

function isResumePositionConfirmed(positionSeconds: number, resumeSeconds: number): boolean {
  if (resumeSeconds < 1) return true;
  if (positionSeconds + CONTINUE_POSITION_TOLERANCE_SECONDS >= resumeSeconds) return true;
  return Math.abs(positionSeconds - resumeSeconds) <= CONTINUE_POSITION_TOLERANCE_SECONDS;
}

function isNearEpisodeStart(positionSeconds: number, resumeSeconds: number): boolean {
  return resumeSeconds >= CONTINUE_NEAR_START_SECONDS + 1 && positionSeconds < CONTINUE_NEAR_START_SECONDS;
}

function prefersTouchContinueTiming(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function seekDelayAfterVideoStartedMs(): number {
  return prefersTouchContinueTiming()
    ? CONTINUE_SEEK_AFTER_VIDEO_STARTED_MS
    : CONTINUE_SEEK_AFTER_VIDEO_STARTED_DESKTOP_MS;
}

function sendContinueSeek(iframe: HTMLIFrameElement, flow: ContinueFlow): void {
  sendKodikCommand(iframe, { method: "seek", seconds: flow.resume.positionSeconds });
  flow.lastReseekAtMs = Date.now();
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

function commandSeason(seasonNumber: number, linkMode: KodikPlayerLinkMode): number | undefined {
  if (linkMode !== "serial") return undefined;
  return seasonNumber === 1 ? undefined : seasonNumber;
}

function seedEpisodeState(
  activeEpisode?: EpisodeState | null,
  initialResume?: KodikPlayerResume | null,
): EpisodeState {
  if (activeEpisode && activeEpisode.episodeNumber > 0) {
    return {
      seasonNumber: activeEpisode.seasonNumber,
      episodeNumber: activeEpisode.episodeNumber,
    };
  }
  if (initialResume) {
    return {
      seasonNumber: initialResume.seasonNumber,
      episodeNumber: initialResume.episodeNumber,
    };
  }
  return { seasonNumber: 1, episodeNumber: 1 };
}

function normalizeEpisode(value: KodikCurrentEpisode, fallback: EpisodeState): EpisodeState {
  return {
    seasonNumber: value.season ?? fallback.seasonNumber,
    episodeNumber: value.episode ?? fallback.episodeNumber,
  };
}

function hasKodikEpisodeNumbers(value: KodikCurrentEpisode): boolean {
  return value.episode != null || value.season != null;
}

function episodeMatches(
  resume: KodikPlayerResume,
  current: EpisodeState,
  linkMode: KodikPlayerLinkMode,
): boolean {
  if (linkMode === "single") return true;
  if (linkMode === "season") {
    return current.episodeNumber === resume.episodeNumber;
  }
  return (
    current.episodeNumber === resume.episodeNumber && current.seasonNumber === resume.seasonNumber
  );
}

function sendContinueEpisodeChange(
  iframe: HTMLIFrameElement,
  resume: KodikPlayerResume,
  linkMode: KodikPlayerLinkMode,
): void {
  if (linkMode === "single") return;
  sendKodikCommand(iframe, {
    method: "change_episode",
    season: commandSeason(resume.seasonNumber, linkMode),
    episode: resume.episodeNumber,
  });
}

function savePlaybackVolume(state: KodikPlayerPlaybackState): void {
  writeKodikPlayerVolumePreferences({
    volume: state.volume,
    muted: state.muted,
  });
}

function scheduleContinueEpisodeChangeRetries(
  iframe: HTMLIFrameElement,
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
): void {
  for (const delay of CONTINUE_EPISODE_CHANGE_RETRY_MS) {
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow || flow.stage !== "episode") return;
        sendContinueEpisodeChange(iframe, flow.resume, flow.linkMode);
      }, delay),
    );
  }
}

function finishContinueSeek(
  iframe: HTMLIFrameElement,
  flow: ContinueFlow,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
): void {
  clearFlowTimers(flow);

  if (!episodeMatches(flow.resume, episodeRef.current, flow.linkMode)) {
    // Never seek on an unconfirmed episode — that lands previous video at the new timestamp.
    flow.stage = "episode";
    sendContinueEpisodeChange(iframe, flow.resume, flow.linkMode);
    scheduleContinueEpisodeChangeRetries(iframe, flow, continueFlowRef);
    // clearFlowTimers removed stage timers only; keep/re-arm hard abort so we never hang forever.
    armContinueHardTimeout(flow, continueFlowRef, onContinueStateChange);
    return;
  }

  if (flow.resume.positionSeconds >= 1) {
    flow.stage = "seek";
    sendContinueSeek(iframe, flow);

    if (!flow.autoplay) {
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

    // Autoplays: keep re-seeking — mobile often applies seek then rebuffers from 0.
    for (const delay of CONTINUE_AUTOPLAY_SEEK_RETRY_MS) {
      flow.timers.push(
        window.setTimeout(() => {
          if (continueFlowRef.current !== flow) return;
          if (flow.stage !== "seek" && flow.stage !== "confirm") return;
          sendContinueSeek(iframe, flow);
        }, delay),
      );
    }
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow) return;
        if (flow.stage !== "seek" && flow.stage !== "confirm") return;
        completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
      }, CONTINUE_AUTOPLAY_CONFIRM_MS),
    );
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

  if (flow.autoplay) {
    // Seek-to-position: wait for video_started (phones reset to 0 on early seek).
    // Next-episode / start-at-0: also finish on a short fallback — Kodik often emits
    // only `play` after change_episode and never `video_started`.
    for (const delay of CONTINUE_PLAY_RETRY_MS) {
      flow.timers.push(
        window.setTimeout(() => {
          if (continueFlowRef.current !== flow || flow.stage !== "play") return;
          sendKodikCommand(iframe, { method: "play" });
        }, delay),
      );
    }
    if (flow.resume.positionSeconds < 1) {
      flow.timers.push(
        window.setTimeout(() => {
          if (continueFlowRef.current !== flow || flow.stage !== "play") return;
          finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
        }, 2_000),
      );
    }
    return;
  }

  // Pause resume needs the media to actually start; `play` alone is too early.
  const fallbackId = window.setTimeout(() => {
    if (continueFlowRef.current !== flow || flow.stage !== "play") return;
    finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
  }, 2_500);
  flow.timers.push(fallbackId);
}

function startContinueFlow(
  iframe: HTMLIFrameElement,
  resume: KodikPlayerResume,
  autoplay: boolean,
  current: EpisodeState,
  linkMode: KodikPlayerLinkMode,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  episodeConfirmed: boolean,
  onContinueStateChange?: (active: boolean) => void,
  options?: KodikPlayerSeekOptions,
): void {
  clearContinueFlow(continueFlowRef.current);
  onContinueStateChange?.(true);

  const flow: ContinueFlow = { resume, autoplay, stage: "episode", timers: [], linkMode };
  continueFlowRef.current = flow;
  armContinueHardTimeout(flow, continueFlowRef, onContinueStateChange);

  // Seeded episodeRef from bootResume is not proof Kodik loaded that episode.
  const sameEpisode =
    (linkMode === "single" || episodeConfirmed) && episodeMatches(resume, current, linkMode);
  const uiAlreadyOnTarget = Boolean(options?.uiEpisodeAlreadyTargeted);

  // Confirmed match (or /seria/ single embed): play→seek in the same gesture.
  if (sameEpisode) {
    requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    return;
  }

  sendContinueEpisodeChange(iframe, resume, linkMode);
  scheduleContinueEpisodeChangeRetries(iframe, flow, continueFlowRef);

  // Blind start when UI already points at the target (Continue after boot / /seria/ remount
  // fallback). Waiting for current_episode often hangs on «подождите…»; change_episode was
  // still sent above so Kodik can switch before seek lands.
  if (uiAlreadyOnTarget) {
    episodeRef.current = {
      seasonNumber: resume.seasonNumber,
      episodeNumber: resume.episodeNumber,
    };
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow || flow.stage !== "episode") return;
        requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
      }, 280),
    );
    return;
  }

  // Next episode / start-at-0: if confirmation never arrives, still try play so auto-advance
  // does not hang forever on a silent change_episode.
  if (resume.positionSeconds < 1) {
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow || flow.stage !== "episode") return;
        episodeRef.current = {
          seasonNumber: resume.seasonNumber,
          episodeNumber: resume.episodeNumber,
        };
        requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
      }, CONTINUE_EPISODE_FORCE_PLAY_MS),
    );
  }
}

function handleContinueFlowMessage(
  event: MessageEvent,
  iframe: HTMLIFrameElement | null,
  continueFlowRef: MutableRefObject<ContinueFlow | null>,
  episodeRef: MutableRefObject<EpisodeState>,
  onContinueStateChange?: (active: boolean) => void,
  onPositionConfirmed?: (positionSeconds: number, playing: boolean) => void,
): void {
  const flow = continueFlowRef.current;
  if (!flow || !iframe || !isKodikPlayerMessage(event.data)) return;

  if (
    flow.stage === "episode" &&
    event.data.key === "kodik_player_current_episode" &&
    event.data.value
  ) {
    const reported = event.data.value as KodikCurrentEpisode;
    if (flow.linkMode !== "single" && !hasKodikEpisodeNumbers(reported)) return;
    const episode =
      flow.linkMode === "single"
        ? {
            seasonNumber: flow.resume.seasonNumber,
            episodeNumber: flow.resume.episodeNumber,
          }
        : normalizeEpisode(reported, {
            seasonNumber: flow.resume.seasonNumber,
            episodeNumber: flow.resume.episodeNumber,
          });
    if (episodeMatches(flow.resume, episode, flow.linkMode)) {
      episodeRef.current = episode;
      clearFlowTimers(flow);
      requestPlayThenSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
    }
    return;
  }

  if (flow.stage === "play") {
    const videoStarted = event.data.key === "kodik_player_video_started";
    const playReady = event.data.key === "kodik_player_play";
    // Resume-with-seek: only video_started (early play+seek flashes then resets to 0 on phones).
    // Next episode / position 0: `play` is enough after change_episode.
    if (flow.autoplay && flow.resume.positionSeconds < 1) {
      if (!videoStarted && !playReady) return;
    } else if (!videoStarted) {
      return;
    }
    clearFlowTimers(flow);
    const seekDelay =
      flow.resume.positionSeconds < 1
        ? 0
        : flow.autoplay
          ? seekDelayAfterVideoStartedMs()
          : 120;
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow || flow.stage !== "play") return;
        finishContinueSeek(iframe, flow, continueFlowRef, episodeRef, onContinueStateChange);
      }, seekDelay),
    );
    return;
  }

  if (
    (flow.stage === "seek" || flow.stage === "confirm") &&
    flow.autoplay &&
    (event.data.key === "kodik_player_time_update" || event.data.key === "kodik_player_time") &&
    typeof event.data.value === "number"
  ) {
    const positionSeconds = event.data.value;
    if (isResumePositionConfirmed(positionSeconds, flow.resume.positionSeconds)) {
      onPositionConfirmed?.(positionSeconds, true);
      completeContinueFlow(flow, continueFlowRef, onContinueStateChange);
      return;
    }
    if (isNearEpisodeStart(positionSeconds, flow.resume.positionSeconds)) {
      flow.stage = "confirm";
      const now = Date.now();
      if (!flow.lastReseekAtMs || now - flow.lastReseekAtMs >= 350) {
        sendContinueSeek(iframe, flow);
      }
    }
    return;
  }

  if (flow.stage === "seek" && event.data.key === "kodik_player_seek") {
    if (flow.autoplay) {
      // Seek ack alone is not enough on mobile — stream often restarts at 0 right after.
      // Wait for time_update near the resume mark before painting / completing.
      flow.stage = "confirm";
      return;
    }

    beginPausingAfterSeek(iframe, flow, continueFlowRef, onContinueStateChange);
    return;
  }

  // Stream restart after an early seek: push position again.
  if (
    flow.autoplay &&
    (flow.stage === "seek" || flow.stage === "confirm") &&
    event.data.key === "kodik_player_video_started"
  ) {
    flow.stage = "confirm";
    flow.timers.push(
      window.setTimeout(() => {
        if (continueFlowRef.current !== flow) return;
        if (flow.stage !== "seek" && flow.stage !== "confirm") return;
        sendContinueSeek(iframe, flow);
      }, seekDelayAfterVideoStartedMs()),
    );
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
    activeEpisode = null,
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
  const playerLinkModeRef = useRef<KodikPlayerLinkMode>("serial");
  const episodeRef = useRef<EpisodeState>(seedEpisodeState(activeEpisode, initialResume));
  /** True only after Kodik sent current_episode with numbers — seeded bootResume is not enough. */
  const kodikEpisodeConfirmedRef = useRef(false);
  const activeEpisodeRef = useRef(activeEpisode);
  activeEpisodeRef.current = activeEpisode;
  const positionRef = useRef(0);
  const playbackRef = useRef<KodikPlayerPlaybackState>({ ...DEFAULT_PLAYBACK_STATE });
  const translationIdRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);
  const bootEpisodeNudgeCountRef = useRef(0);
  const bootSettledRef = useRef(false);
  const playerReadyRef = useRef(false);
  const videoStreamStartedRef = useRef(false);
  const continueFlowRef = useRef<ContinueFlow | null>(null);
  const bufferedSeekTargetRef = useRef<number | null>(null);
  const bufferedSeekTimerRef = useRef<number | null>(null);
  const stateRequestTimersRef = useRef<number[]>([]);
  const positionEmitTimerRef = useRef<number | null>(null);
  const onProgressRef = useRef(onProgress);
  const onPauseRef = useRef(onPause);
  const onTranslationChangeRef = useRef(onTranslationChange);
  const onReadyRef = useRef(onReady);
  const onContinueStateChangeRef = useRef(onContinueStateChange);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    playerLinkModeRef.current = detectKodikPlayerLinkMode(src);
  }, [src]);

  const clearPositionEmitTimer = () => {
    if (positionEmitTimerRef.current != null) {
      window.clearTimeout(positionEmitTimerRef.current);
      positionEmitTimerRef.current = null;
    }
  };

  const emitPlaybackState = () => {
    clearPositionEmitTimer();
    onPlaybackStateChangeRef.current?.({ ...playbackRef.current });
  };

  const schedulePositionEmit = () => {
    if (positionEmitTimerRef.current != null) return;
    positionEmitTimerRef.current = window.setTimeout(() => {
      positionEmitTimerRef.current = null;
      onPlaybackStateChangeRef.current?.({ ...playbackRef.current });
    }, PLAYBACK_POSITION_EMIT_MS);
  };

  const patchPlayback = (patch: Partial<KodikPlayerPlaybackState>) => {
    playbackRef.current = { ...playbackRef.current, ...patch };
    const keys = Object.keys(patch);
    // Progress saving still uses onProgress every tick; only React UI state is throttled.
    if (keys.length === 1 && keys[0] === "positionSeconds") {
      schedulePositionEmit();
      return;
    }
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
    bootEpisodeNudgeCountRef.current = 0;
    bootSettledRef.current = false;
    playerReadyRef.current = false;
    videoStreamStartedRef.current = false;
    kodikEpisodeConfirmedRef.current = false;
    episodeRef.current = seedEpisodeState(activeEpisodeRef.current, initialResume);
    positionRef.current = 0;
    playbackRef.current = { ...DEFAULT_PLAYBACK_STATE };
    emitPlaybackState();
    hydratePlaybackVolumeFromStorage();
    translationIdRef.current = null;
    clearContinueFlow(continueFlowRef.current);
    continueFlowRef.current = null;
    clearBufferedSeek();
    clearStateRequestTimers();
    clearPositionEmitTimer();
    onContinueStateChangeRef.current?.(false);
  }, [src]);

  useImperativeHandle(ref, () => ({
    seekTo(
      resume: KodikPlayerResume,
      mode: KodikPlayerResumeMode = "play",
      options?: KodikPlayerSeekOptions,
    ) {
      if (!iframeRef.current) {
        onContinueStateChangeRef.current?.(false);
        return;
      }
      clearBufferedSeek();
      // Keep episodeRef as Kodik-confirmed only. Optimistic overwrite made finishContinueSeek
      // believe the target episode was already loaded and seek into the previous one.
      const currentEpisode = episodeRef.current;
      const linkMode = playerLinkModeRef.current;
      const episodeConfirmed = linkMode === "single" || kodikEpisodeConfirmedRef.current;
      const episodeChanging = !(
        episodeConfirmed && episodeMatches(resume, currentEpisode, linkMode)
      );
      if (mode === "pause") {
        positionRef.current = Math.max(0, resume.positionSeconds);
        patchPlayback({ positionSeconds: positionRef.current, isPlaying: false });
      } else {
        // Don't paint resume time until Kodik confirms — phones flash target then snap to 0.
        patchPlayback({ isPlaying: false });
      }
      // Do not claim the new episode in liveProgress until Kodik confirms — otherwise
      // video_ended / end-guard can skip ahead (N→N+1 claimed, then N+1→N+2).
      // uiEpisodeAlreadyTargeted: boot already aligned UI to this episode.
      if (!episodeChanging || options?.uiEpisodeAlreadyTargeted) {
        onProgressRef.current?.({
          seasonNumber: resume.seasonNumber,
          episodeNumber: resume.episodeNumber,
          positionSeconds: positionRef.current,
          source: "episode",
        });
      }
      startContinueFlow(
        iframeRef.current,
        resume,
        mode === "play",
        currentEpisode,
        linkMode,
        continueFlowRef,
        episodeRef,
        episodeConfirmed,
        onContinueStateChangeRef.current,
        options,
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
      if (!initialResume || !iframeRef.current || bootSettledRef.current) return;
      const current = episodeRef.current;
      const linkMode = playerLinkModeRef.current;
      const episodeConfirmed = linkMode === "single" || kodikEpisodeConfirmedRef.current;

      // Keep nudging toward the boot episode when Kodik opens on last-episode by default.
      // Previously resumeApplied after the 1.5s fallback blocked a second change_episode once
      // the real current_episode (often last) arrived — UI showed saved ep, Kodik stayed on last.
      // Seeded episodeRef alone must not count as a match — that soft-sought into N−1.
      if (!episodeConfirmed || !episodeMatches(initialResume, current, linkMode)) {
        if (bootEpisodeNudgeCountRef.current >= 3) {
          bootSettledRef.current = true;
          return;
        }
        bootEpisodeNudgeCountRef.current += 1;
        sendContinueEpisodeChange(iframeRef.current, initialResume, linkMode);
        return;
      }

      // Matched once — never pull the user back after they advance to the next episode.
      bootSettledRef.current = true;
      if (resumeAppliedRef.current) return;
      resumeAppliedRef.current = true;
      if (initialResume.positionSeconds < 1) return;
      window.setTimeout(() => {
        if (!iframeRef.current) return;
        sendKodikCommand(iframeRef.current, {
          method: "seek",
          seconds: initialResume.positionSeconds,
        });
      }, 150);
    };

    const onMessage = (event: MessageEvent) => {
      logKodikPlayerDebugMessage(event.data);

      // onReady/seekTo must run before continue-flow handles this same current_episode,
      // otherwise a remount misses the confirming event and falls back to a blind seek.
      if (
        isKodikPlayerMessage(event.data) &&
        event.data.key === "kodik_player_current_episode" &&
        event.data.value
      ) {
        markPlayerReady();
      }

      handleContinueFlowMessage(
        event,
        iframeRef.current,
        continueFlowRef,
        episodeRef,
        onContinueStateChangeRef.current,
        (positionSeconds, playing) => {
          positionRef.current = Math.max(0, positionSeconds);
          patchPlayback({ positionSeconds: positionRef.current, isPlaying: playing });
          onProgressRef.current?.({
            seasonNumber: episodeRef.current.seasonNumber,
            episodeNumber: episodeRef.current.episodeNumber,
            positionSeconds: positionRef.current,
            source: "time",
          });
        },
      );

      if (!isKodikPlayerMessage(event.data)) return;

      if (event.data.key === "kodik_player_current_episode" && event.data.value) {
        const currentEpisode = event.data.value as KodikCurrentEpisode;
        const linkMode = playerLinkModeRef.current;
        const continueFlow = continueFlowRef.current;
        const translationId = currentEpisode.translation?.id;
        if (translationId != null && translationIdRef.current !== translationId) {
          translationIdRef.current = translationId;
          onTranslationChangeRef.current?.({
            id: translationId,
            title: currentEpisode.translation?.title ?? "",
          });
        }

        // `/seria/` (and some boot events) send episode/season null. Never coerce that to 1.
        if (linkMode === "single" || !hasKodikEpisodeNumbers(currentEpisode)) {
          if (linkMode === "single") {
            kodikEpisodeConfirmedRef.current = true;
          }
          if (!continueFlow) {
            applyInitialResume();
          }
          onProgressRef.current?.({
            seasonNumber: episodeRef.current.seasonNumber,
            episodeNumber: episodeRef.current.episodeNumber,
            positionSeconds: positionRef.current,
            source: "episode",
          });
        } else {
          const nextEpisode = normalizeEpisode(currentEpisode, episodeRef.current);
          if (!continueFlow || episodeMatches(continueFlow.resume, nextEpisode, continueFlow.linkMode)) {
            episodeRef.current = nextEpisode;
            kodikEpisodeConfirmedRef.current = true;
            // While continue-flow owns the switch (e.g. next episode), do not boot-nudge
            // back toward initialResume — that undoes auto-advance (boot ep N vs next N+1).
            if (!continueFlow) {
              applyInitialResume();
            }

            onProgressRef.current?.({
              seasonNumber: episodeRef.current.seasonNumber,
              episodeNumber: episodeRef.current.episodeNumber,
              positionSeconds: positionRef.current,
              source: "episode",
            });
          }
        }
      }

      if (event.data.key === "kodik_player_time_update" && typeof event.data.value === "number") {
        if (continueFlowRef.current) return;
        positionRef.current = event.data.value;
        patchPlayback({ positionSeconds: event.data.value });
        // Don't attribute playback time to a boot-seeded episode before Kodik confirms.
        if (
          playerLinkModeRef.current !== "single" &&
          !kodikEpisodeConfirmedRef.current
        ) {
          return;
        }
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
        patchPlayback({ isPlaying: true, mediaUnlocked: true });
      }

      if (event.data.key === "kodik_player_video_started") {
        const flow = continueFlowRef.current;
        // Pause-resume briefly starts media to unlock seek — don't treat that as "video ready".
        const pauseResume =
          Boolean(flow) &&
          !flow!.autoplay &&
          (flow!.stage === "seek" || flow!.stage === "pausing" || flow!.stage === "play");
        if (!pauseResume) {
          videoStreamStartedRef.current = true;
        }
        patchPlayback({
          isPlaying: true,
          mediaUnlocked: true,
          videoReady:
            !pauseResume && playbackRef.current.durationSeconds > 0
              ? true
              : playbackRef.current.videoReady,
        });
      }

      if (event.data.key === "kodik_player_duration_update" && typeof event.data.value === "number") {
        const durationSeconds = event.data.value;
        patchPlayback({
          durationSeconds,
          videoReady:
            videoStreamStartedRef.current && durationSeconds > 0
              ? true
              : playbackRef.current.videoReady,
        });
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
      clearPositionEmitTimer();
      onContinueStateChangeRef.current?.(false);
    };
  }, [initialResume, src]);

  useEffect(() => {
    if (!initialResume || resumeAppliedRef.current) return;

    const timer = window.setTimeout(() => {
      applyResumeFallback(
        initialResume,
        iframeRef,
        resumeAppliedRef,
        episodeRef,
        kodikEpisodeConfirmedRef,
        bootEpisodeNudgeCountRef,
        bootSettledRef,
        playerLinkModeRef,
      );
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
            className="kodik-player-iframe absolute inset-0 h-full w-full border-0"
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
  kodikEpisodeConfirmedRef: MutableRefObject<boolean>,
  bootEpisodeNudgeCountRef: MutableRefObject<number>,
  bootSettledRef: MutableRefObject<boolean>,
  playerLinkModeRef: MutableRefObject<KodikPlayerLinkMode>,
) {
  if (!iframeRef.current || bootSettledRef.current) return;

  const linkMode = playerLinkModeRef.current;
  const episodeConfirmed = linkMode === "single" || kodikEpisodeConfirmedRef.current;
  if (!episodeConfirmed || !episodeMatches(resume, episodeRef.current, linkMode)) {
    if (bootEpisodeNudgeCountRef.current >= 3) {
      bootSettledRef.current = true;
      return;
    }
    bootEpisodeNudgeCountRef.current += 1;
    sendContinueEpisodeChange(iframeRef.current, resume, linkMode);
    return;
  }

  bootSettledRef.current = true;
  if (resumeAppliedRef.current) return;
  resumeAppliedRef.current = true;
  if (resume.positionSeconds < 1) return;
  window.setTimeout(() => {
    if (!iframeRef.current) return;
    sendKodikCommand(iframeRef.current, { method: "seek", seconds: resume.positionSeconds });
  }, 150);
}
