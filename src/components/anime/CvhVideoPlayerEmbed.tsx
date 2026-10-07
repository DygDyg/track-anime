"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { CVH_PLAYER_SCRIPT_URL, getCvhPub } from "@/lib/cvh-player";

export type CvhPlayerEpisodeChange = {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string;
  voiceName?: string;
};

export type CvhPlayerProgressPayload = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  source?: "episode" | "time";
};

type Props = {
  titleId: string;
  publisherId?: string;
  aggregator: string;
  episode?: number | null;
  season?: number | null;
  priorityVoice?: string | null;
  /** Partners default false — show seasons/episodes inside the widget */
  showVoiceOnly?: boolean;
  /** Full-page chrome hide for `/cdn-iframe` only — never on anime page */
  embedShell?: boolean;
  onEpisodeChange?: (payload: CvhPlayerEpisodeChange) => void;
  onProgress?: (payload: CvhPlayerProgressPayload) => void;
  onPause?: (payload: CvhPlayerProgressPayload) => void;
  className?: string;
};

type CvhPlayerStateSlice = {
  currentSeason?: { name?: unknown } | null;
  currentEpisode?: { name?: unknown; visibleName?: unknown } | null;
  currentVoice?: { name?: unknown } | null;
};

type CvhVideoPlayerElement = HTMLElement & {
  selectSeason?: (season: number) => void;
  selectEpisode?: (episode: number) => void;
  /** Live player state (`get state()` on the custom element) */
  state?: CvhPlayerStateSlice;
  api?: { getState?: () => CvhPlayerStateSlice };
};

let scriptLoadPromise: Promise<void> | null = null;

function ensureCvhPlayerScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-cvh-player-script="1"]`,
  );
  if (existing) {
    if (existing.dataset.loaded === "1") return Promise.resolve();
    return (
      scriptLoadPromise ??
      new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("CVH script failed")), {
          once: true,
        });
      })
    );
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CVH_PLAYER_SCRIPT_URL;
    script.async = true;
    script.dataset.cvhPlayerScript = "1";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "1";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error("Не удалось загрузить VideoHUB")),
      { once: true },
    );
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

function toPositiveInt(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.trunc(value);
}

function toSeasonInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function toEpisodeInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function readPlayerPoint(el: CvhVideoPlayerElement): {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string;
  voiceName?: string;
} | null {
  const state = el.state ?? el.api?.getState?.();
  if (!state) return null;
  const seasonNumber = toSeasonInt(state.currentSeason?.name);
  const episodeNumber = toEpisodeInt(state.currentEpisode?.name);
  if (seasonNumber == null || episodeNumber == null) return null;
  const episodeTitle =
    typeof state.currentEpisode?.visibleName === "string"
      ? state.currentEpisode.visibleName
      : undefined;
  const voiceName =
    typeof state.currentVoice?.name === "string" ? state.currentVoice.name : undefined;
  return { seasonNumber, episodeNumber, episodeTitle, voiceName };
}

export function CvhVideoPlayerEmbed({
  titleId,
  publisherId,
  aggregator,
  episode,
  season,
  priorityVoice,
  showVoiceOnly = false,
  embedShell = false,
  onEpisodeChange,
  onProgress,
  onPause,
  className,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const elementId = useMemo(() => `pcvh-${reactId}`, [reactId]);
  const pub = publisherId?.trim() || getCvhPub();
  const voice = priorityVoice?.trim() || "";
  const episodeAttr = toPositiveInt(episode);
  const seasonAttr = toPositiveInt(season) ?? (season === 0 ? 0 : undefined);

  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<CvhVideoPlayerElement | null>(null);
  const readyRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const suppressEpisodeEventsRef = useRef(true);
  const inAdRef = useRef(false);
  const positionSecondsRef = useRef(0);
  const appliedRef = useRef<{ season?: number; episode?: number }>({});
  const onEpisodeChangeRef = useRef(onEpisodeChange);
  const onProgressRef = useRef(onProgress);
  const onPauseRef = useRef(onPause);
  onEpisodeChangeRef.current = onEpisodeChange;
  onProgressRef.current = onProgress;
  onPauseRef.current = onPause;
  const desiredRef = useRef({ season: seasonAttr, episode: episodeAttr });
  desiredRef.current = { season: seasonAttr, episode: episodeAttr };

  useEffect(() => {
    if (!embedShell) return;
    document.documentElement.classList.add("cvh-embed-shell");
    document.body.classList.add("cvh-embed-shell");
    return () => {
      document.documentElement.classList.remove("cvh-embed-shell");
      document.body.classList.remove("cvh-embed-shell");
    };
  }, [embedShell]);

  // Remount widget when title / voice / aggregator change (not on every episode).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let retryTimer: number | null = null;
    let releaseTimer: number | null = null;
    readyRef.current = false;
    bootstrappedRef.current = false;
    suppressEpisodeEventsRef.current = true;
    inAdRef.current = false;
    positionSecondsRef.current = 0;
    playerRef.current = null;
    appliedRef.current = {};
    host.replaceChildren();

    const clearTimers = () => {
      if (retryTimer != null) window.clearTimeout(retryTimer);
      if (releaseTimer != null) window.clearTimeout(releaseTimer);
      retryTimer = null;
      releaseTimer = null;
    };

    void ensureCvhPlayerScript()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const el = document.createElement("video-player") as CvhVideoPlayerElement;
        el.id = elementId;
        el.setAttribute("ident", "cvh");
        el.setAttribute("data-title-id", titleId);
        el.setAttribute("data-publisher-id", pub);
        el.setAttribute("data-aggregator", aggregator);
        el.setAttribute("is-show-voice-only", showVoiceOnly ? "true" : "false");
        el.style.display = "block";
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.border = "0";

        const desired = desiredRef.current;
        if (desired.season != null) el.setAttribute("season", String(desired.season));
        if (desired.episode != null) el.setAttribute("episode", String(desired.episode));
        if (voice) el.setAttribute("priority-voice", voice);

        const matchesDesired = (seasonNumber?: number, episodeNumber?: number) => {
          const next = desiredRef.current;
          const seasonOk = next.season == null || seasonNumber === next.season;
          const episodeOk = next.episode == null || episodeNumber === next.episode;
          return seasonOk && episodeOk;
        };

        const applyDesired = () => {
          const next = desiredRef.current;
          if (next.season != null) {
            el.selectSeason?.(next.season);
            appliedRef.current.season = next.season;
          }
          if (next.episode != null) {
            el.selectEpisode?.(next.episode);
            appliedRef.current.episode = next.episode;
          }
        };

        const scheduleApplyRetries = () => {
          if (retryTimer != null) window.clearTimeout(retryTimer);
          let attempt = 0;
          const tick = () => {
            if (cancelled || !playerRef.current) return;
            applyDesired();
            attempt += 1;
            if (attempt < 6) {
              retryTimer = window.setTimeout(tick, 350);
            }
          };
          tick();
        };

        const releaseEpisodeEvents = () => {
          suppressEpisodeEventsRef.current = false;
        };

        const resolvePoint = () => {
          const seasonNumber =
            appliedRef.current.season ?? desiredRef.current.season ?? seasonAttr ?? 1;
          const episodeNumber =
            appliedRef.current.episode ?? desiredRef.current.episode ?? episodeAttr ?? 1;
          return { seasonNumber, episodeNumber };
        };

        const emitProgress = (
          source: "episode" | "time",
          positionSeconds = positionSecondsRef.current,
        ) => {
          const { seasonNumber, episodeNumber } = resolvePoint();
          onProgressRef.current?.({
            seasonNumber,
            episodeNumber,
            positionSeconds: Math.max(0, positionSeconds),
            source,
          });
        };

        const emitPause = () => {
          const { seasonNumber, episodeNumber } = resolvePoint();
          onPauseRef.current?.({
            seasonNumber,
            episodeNumber,
            positionSeconds: Math.max(0, positionSecondsRef.current),
            source: "time",
          });
        };

        /**
         * CVH fires `episodeChange` only for auto-next countdown.
         * Manual UI / next-prev inside the widget update `el.state` without that event,
         * so we must mirror season/episode from live state for strip + watch progress.
         */
        const commitEpisode = (
          seasonValue: number,
          episodeValue: number,
          meta?: { episodeTitle?: string; voiceName?: string },
          options?: { fromPlayerState?: boolean },
        ) => {
          if (suppressEpisodeEventsRef.current) {
            if (!matchesDesired(seasonValue, episodeValue)) {
              // First boot: force preferred strip episode. After boot, strip-driven
              // suppress also uses desiredRef — ignore transient stale player state.
              if (!bootstrappedRef.current || !options?.fromPlayerState) {
                applyDesired();
              }
              return;
            }
            appliedRef.current = { season: seasonValue, episode: episodeValue };
            releaseEpisodeEvents();
          } else {
            appliedRef.current = { season: seasonValue, episode: episodeValue };
          }

          positionSecondsRef.current = 0;
          emitProgress("episode", 0);
          onEpisodeChangeRef.current?.({
            seasonNumber: seasonValue,
            episodeNumber: episodeValue,
            episodeTitle: meta?.episodeTitle,
            voiceName: meta?.voiceName,
          });
        };

        const syncEpisodeFromPlayerState = () => {
          const point = readPlayerPoint(el);
          if (!point) return;
          const same =
            appliedRef.current.season === point.seasonNumber &&
            appliedRef.current.episode === point.episodeNumber;
          if (same) return;
          commitEpisode(point.seasonNumber, point.episodeNumber, {
            episodeTitle: point.episodeTitle,
            voiceName: point.voiceName,
          }, { fromPlayerState: true });
        };

        const onReady = () => {
          if (cancelled) return;
          readyRef.current = true;

          // iframe re-inits on every media load (incl. in-player episode switch).
          // Only the first ready may re-apply desired; later ones must follow the player.
          if (bootstrappedRef.current) {
            syncEpisodeFromPlayerState();
            releaseEpisodeEvents();
            return;
          }

          suppressEpisodeEventsRef.current = true;
          // Do not mark applied before select* — attrs alone often leave episode 1.
          appliedRef.current = {};
          scheduleApplyRetries();
          if (releaseTimer != null) window.clearTimeout(releaseTimer);
          releaseTimer = window.setTimeout(() => {
            bootstrappedRef.current = true;
            releaseEpisodeEvents();
            syncEpisodeFromPlayerState();
          }, 2200);
        };

        const onEpisodeChanged = (event: Event) => {
          const detail = (event as CustomEvent<Record<string, unknown>>).detail ?? {};
          const seasonNumber = Number(detail.seasonNumber);
          const episodeNumber = Number(detail.episodeNumber);
          if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
            // detail uses season/episode `.name` — also try live state
            syncEpisodeFromPlayerState();
            return;
          }
          commitEpisode(Math.trunc(seasonNumber), Math.trunc(episodeNumber), {
            episodeTitle:
              typeof detail.episodeTitle === "string" ? detail.episodeTitle : undefined,
            voiceName: typeof detail.voiceName === "string" ? detail.voiceName : undefined,
          });
        };

        const onCurrentTime = (event: Event) => {
          if (inAdRef.current) return;
          if (!suppressEpisodeEventsRef.current) {
            syncEpisodeFromPlayerState();
          }
          if (suppressEpisodeEventsRef.current) return;
          const detail = (event as CustomEvent<Record<string, unknown>>).detail ?? {};
          const time = Number(detail.time);
          if (!Number.isFinite(time) || time < 0) return;
          positionSecondsRef.current = time;
          emitProgress("time", time);
        };

        const onChangeState = (event: Event) => {
          if (suppressEpisodeEventsRef.current || inAdRef.current) return;
          syncEpisodeFromPlayerState();
          const detail = (event as CustomEvent<Record<string, unknown>>).detail ?? {};
          const state = detail.state;
          if (state === "paused" || state === "stopped") {
            emitPause();
          }
        };

        const onPlayStart = () => {
          if (cancelled) return;
          syncEpisodeFromPlayerState();
        };

        const onAdStart = () => {
          inAdRef.current = true;
        };
        const onAdEnd = () => {
          inAdRef.current = false;
        };

        el.addEventListener("ready", onReady);
        el.addEventListener("init", onReady);
        el.addEventListener("episodeChange", onEpisodeChanged);
        el.addEventListener("currentTime", onCurrentTime);
        el.addEventListener("changeState", onChangeState);
        el.addEventListener("playStart", onPlayStart);
        el.addEventListener("adStart", onAdStart);
        el.addEventListener("adEnd", onAdEnd);
        hostRef.current.appendChild(el);
        playerRef.current = el;
      })
      .catch(() => {
        /* host stays empty; user can switch back to TA */
      });

    return () => {
      cancelled = true;
      clearTimers();
      if (!inAdRef.current && positionSecondsRef.current >= 0) {
        const seasonNumber =
          appliedRef.current.season ?? desiredRef.current.season ?? seasonAttr ?? 1;
        const episodeNumber =
          appliedRef.current.episode ?? desiredRef.current.episode ?? episodeAttr ?? 1;
        onPauseRef.current?.({
          seasonNumber,
          episodeNumber,
          positionSeconds: Math.max(0, positionSecondsRef.current),
          source: "time",
        });
      }
      readyRef.current = false;
      bootstrappedRef.current = false;
      playerRef.current = null;
      host.replaceChildren();
    };
  }, [aggregator, elementId, pub, showVoiceOnly, titleId, voice]);

  // Strip / preferred episode → native selectSeason / selectEpisode when ready.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    const seasonChanged = seasonAttr != null && seasonAttr !== appliedRef.current.season;
    const episodeChanged = episodeAttr != null && episodeAttr !== appliedRef.current.episode;
    if (!seasonChanged && !episodeChanged) return;

    suppressEpisodeEventsRef.current = true;
    if (seasonAttr != null) {
      player.selectSeason?.(seasonAttr);
      appliedRef.current.season = seasonAttr;
    }
    if (episodeAttr != null) {
      player.selectEpisode?.(episodeAttr);
      appliedRef.current.episode = episodeAttr;
    }
    window.setTimeout(() => {
      suppressEpisodeEventsRef.current = false;
    }, 800);
  }, [episodeAttr, seasonAttr]);

  return (
    <div
      ref={hostRef}
      className={["cvh-video-player-root h-full w-full bg-black", className ?? ""].join(" ")}
    />
  );
}
