"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  KodikPlayer,
  type KodikPlayerHandle,
  type KodikPlayerPlaybackState,
  type KodikPlayerResume,
  type KodikPlayerResumeMode,
} from "@/components/anime/KodikPlayer";
import { KodikPlayerBetaViewport } from "@/components/anime/KodikPlayerBetaViewport";
import type { KodikTranslationDto } from "@/lib/anime-page";
import { formatEpisodeProgress } from "@/lib/anime-labels";
import { resolveTranslationStudioId } from "@/lib/translation-colors";
import { formatWatchPosition, formatEpisodeOfTotal, type WatchProgressDto } from "@/lib/watch-history";
import { useDiscordConfig } from "@/hooks/useDiscordConfig";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import { useForcedTranslationIntroOffsets } from "@/hooks/useForcedTranslationIntroOffsets";
import { applyIntroOffset } from "@/lib/translation-intro-offset";
import {
  listKodikStreamQualities,
  parseStreamQualityFromPlayerLink,
  replaceStreamQualityInPlayerLink,
  type KodikStreamQuality,
} from "@/lib/kodik-player-quality";

type Props = {
  shikimoriId: number;
  animeTitle: string;
  translations: KodikTranslationDto[];
  episodesTotal?: number | null;
};

const SAVE_INTERVAL_MS = 30_000;
const MIN_SAVE_POSITION_SECONDS = 60;
const PLAYER_SEEK_SKIP_LABEL_SECONDS = 90;
const PLAYER_SEEK_SKIP_SECONDS = PLAYER_SEEK_SKIP_LABEL_SECONDS - 2;
const CONTINUE_LOADING_TIMEOUT_MS = 12_000;

const DEFAULT_PLAYBACK_STATE: KodikPlayerPlaybackState = {
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 1,
  muted: false,
};

function IconPlayerRefresh({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={["h-4 w-4 fill-current", spinning ? "animate-spin" : ""].join(" ")}
      aria-hidden
    >
      <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}

type ProgressPayload = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
};

export function AnimeWatchPanel({
  shikimoriId,
  animeTitle,
  translations,
  episodesTotal,
}: Props) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const forcedIntroOffsets = useForcedTranslationIntroOffsets();
  const { applicationId, largeImageKey, configured: discordConfigured } = useDiscordConfig();
  const discordPresenceEnabled = settings.discordPresenceEnabled && discordConfigured;
  const discordPageUrl =
    typeof window !== "undefined" ? `${window.location.origin}/anime/${shikimoriId}#player` : "";
  const { syncProgress, markPaused, markPlaying, clear: clearDiscordPresence } = useDiscordPresence({
    enabled: discordPresenceEnabled,
    mode: "watch",
    animeTitle,
    applicationId,
    largeImageKey,
    showSitePage: settings.discordPresenceShowSitePage,
    sitePageLabel: settings.discordPresenceShowSitePage ? "Просмотр" : null,
    openButtonEnabled: settings.discordPresenceOpenButtonEnabled,
    pageUrl: discordPageUrl,
  });
  const playable = useMemo(
    () => translations.filter((tr) => tr.playerLink),
    [translations],
  );

  const [selectedId, setSelectedId] = useState("");
  const [continueProgress, setContinueProgress] = useState<WatchProgressDto | null>(null);
  const [bootResume, setBootResume] = useState<KodikPlayerResume | null>(null);
  const [ready, setReady] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [continueTarget, setContinueTarget] = useState<{ episodeNumber: number } | null>(null);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [playerSrc, setPlayerSrc] = useState("");
  const [streamQuality, setStreamQuality] = useState<string | null>(null);
  const [playback, setPlayback] = useState<KodikPlayerPlaybackState>(DEFAULT_PLAYBACK_STATE);
  const [playerResetNonce, setPlayerResetNonce] = useState(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [playerEpisode, setPlayerEpisode] = useState({ seasonNumber: 1, episodeNumber: 1 });
  const playerExpandedHostRef = useRef<HTMLDivElement>(null);
  const betaFullscreenRef = useRef<HTMLDivElement>(null);

  const playerRef = useRef<KodikPlayerHandle>(null);
  const selectedIdRef = useRef("");
  const isPausedRef = useRef(true);
  const pendingContinueModeRef = useRef<KodikPlayerResumeMode>("play");
  const liveProgressRef = useRef<ProgressPayload>({
    seasonNumber: 1,
    episodeNumber: 1,
    positionSeconds: 0,
  });
  const latestProgressRef = useRef<ProgressPayload | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const savingRef = useRef(false);
  const pendingContinueRef = useRef<KodikPlayerResume | null>(null);

  const playableByKodikId = useMemo(() => {
    const map = new Map<string, KodikTranslationDto>();
    for (const tr of playable) {
      map.set(tr.kodikId, tr);
    }
    return map;
  }, [playable]);

  const applyPositionOffset = useCallback(
    (resume: KodikPlayerResume, toKodikId: string, fromKodikId?: string): KodikPlayerResume => {
      const toTranslation = playableByKodikId.get(toKodikId);
      if (!toTranslation) return resume;

      const fromTranslation = playableByKodikId.get(fromKodikId ?? toKodikId);
      const fromTitle = fromTranslation?.translationTitle ?? "";

      return applyIntroOffset(
        resume,
        fromTitle,
        toTranslation.translationTitle,
        settings.translationIntroOffsets,
        forcedIntroOffsets,
      );
    },
    [forcedIntroOffsets, playableByKodikId, settings.translationIntroOffsets],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!user) {
        setContinueProgress(null);
        setBootResume(null);
        setSelectedId(playable[0]?.kodikId ?? "");
        setReady(true);
        return;
      }

      try {
        const res = await fetch(`/api/user/watch-history/${shikimoriId}`, { cache: "no-store" });
        if (!res.ok) {
          setSelectedId(playable[0]?.kodikId ?? "");
          setReady(true);
          return;
        }

        const data = (await res.json()) as { progress?: WatchProgressDto | null };
        if (cancelled) return;

        const progress = data.progress ?? null;
        setContinueProgress(progress);

        const savedKodikId = progress?.kodikId;
        if (savedKodikId && playable.some((tr) => tr.kodikId === savedKodikId)) {
          setSelectedId(savedKodikId);
        } else {
          setSelectedId(playable[0]?.kodikId ?? "");
        }

        if (
          progress &&
          progress.positionSeconds >= MIN_SAVE_POSITION_SECONDS &&
          savedKodikId &&
          playable.some((tr) => tr.kodikId === savedKodikId)
        ) {
          setBootResume(
            applyPositionOffset(
              {
                seasonNumber: progress.seasonNumber,
                episodeNumber: progress.episodeNumber,
                positionSeconds: progress.positionSeconds,
              },
              savedKodikId,
            ),
          );
        } else {
          setBootResume(null);
        }
      } catch {
        if (!cancelled) setSelectedId(playable[0]?.kodikId ?? "");
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    setReady(false);
    setBootResume(null);
    lastSavedFingerprintRef.current = "";
    latestProgressRef.current = null;
    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [user, shikimoriId, playable, applyPositionOffset]);

  useEffect(() => {
    if (!playable.some((tr) => tr.kodikId === selectedId)) {
      setSelectedId(playable[0]?.kodikId ?? "");
    }
  }, [playable, selectedId]);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#player") return;
    const el = document.getElementById("player");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ready]);

  const playableByTranslationId = useMemo(() => {
    const map = new Map<number, KodikTranslationDto>();
    for (const tr of playable) {
      map.set(tr.translationId, tr);
    }
    return map;
  }, [playable]);

  const saveProgressNow = useCallback(
    async (
      payload: ProgressPayload,
      kodikId: string,
      options?: { skipMinPosition?: boolean; force?: boolean },
    ) => {
      if (!user || savingRef.current) return;
      if (!options?.skipMinPosition && payload.positionSeconds < MIN_SAVE_POSITION_SECONDS) return;

      const fingerprint = [
        kodikId,
        payload.seasonNumber,
        payload.episodeNumber,
        Math.floor(payload.positionSeconds),
      ].join(":");

      if (!options?.force && fingerprint === lastSavedFingerprintRef.current) return;

      savingRef.current = true;
      try {
        const res = await fetch(`/api/user/watch-history/${shikimoriId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kodikId,
            seasonNumber: payload.seasonNumber,
            episodeNumber: payload.episodeNumber,
            positionSeconds: payload.positionSeconds,
          }),
        });

        if (!res.ok) return;

        const data = (await res.json()) as { progress?: WatchProgressDto | null; cleared?: boolean };
        if (data.cleared || data.progress === null) {
          lastSavedFingerprintRef.current = fingerprint;
          setContinueProgress(null);
          return;
        }
        if (data.progress) {
          lastSavedFingerprintRef.current = fingerprint;
          setContinueProgress(data.progress);
        }
      } catch {
        /* ignore network errors */
      } finally {
        savingRef.current = false;
      }
    },
    [shikimoriId, user],
  );

  const saveTranslation = useCallback(
    (kodikId: string) => {
      void saveProgressNow(liveProgressRef.current, kodikId, {
        skipMinPosition: true,
        force: true,
      });
    },
    [saveProgressNow],
  );

  const trackProgress = useCallback(
    (payload: ProgressPayload) => {
      liveProgressRef.current = payload;
      setPlayerEpisode((prev) =>
        prev.seasonNumber === payload.seasonNumber && prev.episodeNumber === payload.episodeNumber
          ? prev
          : { seasonNumber: payload.seasonNumber, episodeNumber: payload.episodeNumber },
      );
      const wasPaused = isPausedRef.current;
      isPausedRef.current = false;
      syncProgress({ ...payload, paused: false });
      if (wasPaused) {
        markPlaying();
      }
      if (payload.positionSeconds < MIN_SAVE_POSITION_SECONDS) return;
      latestProgressRef.current = payload;
    },
    [markPlaying, syncProgress],
  );

  const switchTranslationWithResume = useCallback(
    (kodikId: string, resume: KodikPlayerResume) => {
      saveTranslation(kodikId);
      setBootResume(null);
      latestProgressRef.current = null;
      lastSavedFingerprintRef.current = "";

      if (resume.positionSeconds < 1) {
        pendingContinueRef.current = null;
        setContinueLoading(false);
        setContinueTarget(null);
        setSelectedId(kodikId);
        return;
      }

      const adjusted = applyPositionOffset(resume, kodikId, selectedIdRef.current);
      const mode: KodikPlayerResumeMode = isPausedRef.current ? "pause" : "play";

      setContinueLoading(true);
      setContinueTarget({ episodeNumber: adjusted.episodeNumber });
      pendingContinueRef.current = adjusted;
      pendingContinueModeRef.current = mode;
      setSelectedId(kodikId);
    },
    [saveTranslation, applyPositionOffset],
  );

  const handlePlayerTranslationChange = useCallback(
    (translation: { id: number; title: string }) => {
      const match = playableByTranslationId.get(translation.id);
      if (!match || match.kodikId === selectedIdRef.current) return;

      switchTranslationWithResume(match.kodikId, { ...liveProgressRef.current });
    },
    [playableByTranslationId, switchTranslationWithResume],
  );

  const handleTranslationSelect = useCallback(
    (kodikId: string) => {
      if (kodikId === selectedIdRef.current) return;
      switchTranslationWithResume(kodikId, { ...liveProgressRef.current });
    },
    [switchTranslationWithResume],
  );

  const handlePause = useCallback(
    (payload: ProgressPayload) => {
      liveProgressRef.current = payload;
      setPlayerEpisode({
        seasonNumber: payload.seasonNumber,
        episodeNumber: payload.episodeNumber,
      });
      isPausedRef.current = true;
      syncProgress({ ...payload, paused: true });
      markPaused();
      if (payload.positionSeconds >= MIN_SAVE_POSITION_SECONDS) {
        latestProgressRef.current = payload;
      }
      void saveProgressNow(payload, selectedIdRef.current);
    },
    [markPaused, saveProgressNow, syncProgress],
  );

  useEffect(() => {
    if (!discordPresenceEnabled) return;
    return () => {
      clearDiscordPresence();
    };
  }, [clearDiscordPresence, discordPresenceEnabled, shikimoriId]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      const payload = latestProgressRef.current;
      const kodikId = selectedIdRef.current;
      if (!payload || !kodikId) return;
      void saveProgressNow(payload, kodikId);
    }, SAVE_INTERVAL_MS);

    const onPageHide = () => {
      const payload = latestProgressRef.current;
      const kodikId = selectedIdRef.current;
      if (!payload || !kodikId) return;
      void saveProgressNow(payload, kodikId);
    };

    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [saveProgressNow, user]);

  useEffect(() => {
    if (!pendingContinueRef.current || !ready) return;

    const timer = window.setTimeout(() => {
      if (pendingContinueRef.current) {
        playerRef.current?.seekTo(pendingContinueRef.current, pendingContinueModeRef.current);
        pendingContinueRef.current = null;
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [selectedId, ready]);

  const handlePlayerReady = useCallback(() => {
    if (!pendingContinueRef.current) return;
    const resume = pendingContinueRef.current;
    const mode = pendingContinueModeRef.current;
    pendingContinueRef.current = null;
    playerRef.current?.seekTo(resume, mode);
  }, []);

  const handleContinueStateChange = useCallback((active: boolean) => {
    setContinueLoading(active);
    if (!active) {
      setContinueTarget(null);
    }
  }, []);

  useEffect(() => {
    if (!continueLoading) return;

    const timeoutId = window.setTimeout(() => {
      playerRef.current?.abortContinue();
      pendingContinueRef.current = null;
      setContinueLoading(false);
      setContinueTarget(null);
      setPlayerResetNonce((nonce) => nonce + 1);
    }, CONTINUE_LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [continueLoading, selectedId]);

  const handleContinue = () => {
    if (!continueProgress || continueLoading) return;

    const resume = applyPositionOffset(
      {
        seasonNumber: continueProgress.seasonNumber,
        episodeNumber: continueProgress.episodeNumber,
        positionSeconds: continueProgress.positionSeconds,
      },
      continueProgress.kodikId,
    );

    setContinueLoading(true);
    setContinueTarget({ episodeNumber: resume.episodeNumber });
    pendingContinueModeRef.current = "play";
    isPausedRef.current = false;

    if (continueProgress.kodikId !== selectedIdRef.current) {
      pendingContinueRef.current = resume;
      setBootResume(null);
      setSelectedId(continueProgress.kodikId);
    } else {
      playerRef.current?.seekTo(resume, "play");
    }

    const el = document.getElementById("player");
    el?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  const handleSeekSkip = (deltaSeconds: number) => {
    playerRef.current?.seekBy(deltaSeconds);
  };

  const scrollPlayerToTop = useCallback(() => {
    const host = playerExpandedHostRef.current;
    if (!host) return;

    requestAnimationFrame(() => {
      host.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const togglePlayerExpanded = useCallback(() => {
    setPlayerExpanded((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollPlayerToTop);
        });
      }
      return next;
    });
  }, [scrollPlayerToTop]);

  const seekSkipDisabled = !ready || continueLoading;
  const betaChromeless = settings.betaChromelessPlayer;

  const handlePlaybackStateChange = useCallback((state: KodikPlayerPlaybackState) => {
    setPlayback(state);
  }, []);

  const toggleBetaFullscreen = useCallback(async () => {
    const root = betaFullscreenRef.current;
    if (!root) return;

    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen();
      } else {
        await root.requestFullscreen();
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === betaFullscreenRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const selected = playable.find((tr) => tr.kodikId === selectedId) ?? playable[0];
  const selectedPlayerLink = selected?.playerLink ?? null;

  useEffect(() => {
    setPlayerSrc(selectedPlayerLink ?? "");
    setStreamQuality(parseStreamQualityFromPlayerLink(selectedPlayerLink ?? "") ?? "720p");
  }, [selectedPlayerLink, selectedId]);

  const streamQualities = useMemo(
    () => listKodikStreamQualities(selectedPlayerLink),
    [selectedPlayerLink],
  );

  const restartPlayerAtCurrentPosition = useCallback(() => {
    const resume = { ...liveProgressRef.current };
    pendingContinueModeRef.current = isPausedRef.current ? "pause" : "play";
    pendingContinueRef.current =
      resume.positionSeconds >= 1
        ? resume
        : { ...resume, positionSeconds: Math.max(playback.positionSeconds, 0) };
    setContinueLoading(true);
    setContinueTarget({ episodeNumber: pendingContinueRef.current.episodeNumber });
    setPlayerResetNonce((nonce) => nonce + 1);
  }, [playback.positionSeconds]);

  const handlePlayerRefresh = useCallback(() => {
    if (!ready || continueLoading) return;
    restartPlayerAtCurrentPosition();
  }, [continueLoading, ready, restartPlayerAtCurrentPosition]);

  const handleQualityChange = useCallback(
    (quality: KodikStreamQuality) => {
      const base = playerSrc || selectedPlayerLink;
      if (!base) return;

      const nextSrc = replaceStreamQualityInPlayerLink(base, quality);
      if (nextSrc === playerSrc) return;

      setStreamQuality(quality);
      setPlayerSrc(nextSrc);
      restartPlayerAtCurrentPosition();
    },
    [playerSrc, restartPlayerAtCurrentPosition, selectedPlayerLink],
  );

  const handleEpisodeSelect = useCallback((episodeNumber: number) => {
    if (episodeNumber === liveProgressRef.current.episodeNumber) return;
    const resume: KodikPlayerResume = {
      seasonNumber: liveProgressRef.current.seasonNumber,
      episodeNumber,
      positionSeconds: 0,
    };
    playerRef.current?.seekTo(resume, "play");
  }, []);

  const renderTranslationButtons = () => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-stretch gap-2">
      {playable.map((tr) => {
        const active = tr.kodikId === selected.kodikId;
        const progress = formatEpisodeProgress(tr.lastSeason, tr.lastEpisode);
        const studioId = resolveTranslationStudioId(tr.translationTitle);
        return (
          <li key={tr.kodikId} className="flex min-w-0">
            <button
              type="button"
              onClick={() => handleTranslationSelect(tr.kodikId)}
              disabled={continueLoading}
              data-studio={studioId ?? undefined}
              className={[
                "flex h-full w-full flex-col items-center justify-center rounded-lg border px-3 py-1.5 text-center text-xs transition disabled:cursor-wait disabled:opacity-50",
                studioId ? "translation-btn" : "",
                studioId && active ? "translation-btn--active" : "",
                studioId
                  ? active
                    ? "ring-1 ring-offset-1 ring-offset-card"
                    : "hover:brightness-110"
                  : active
                    ? "border-accent bg-accent/15 text-foreground"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground",
              ].join(" ")}
            >
              <span className="font-medium leading-snug line-clamp-2">{tr.translationTitle}</span>
              {progress ? (
                <span className="mt-0.5 text-[10px] leading-tight opacity-80">{progress}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (playable.length === 0) {
    return (
      <section
        id="player"
        className="scroll-mt-20 rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5"
      >
        <h2 className="mb-2 text-lg font-semibold text-foreground">Смотреть</h2>
        <p className="text-sm text-muted">В базе Kodik пока нет плеера для этого тайтла.</p>
      </section>
    );
  }

  const continueTranslation = continueProgress
    ? playable.find((tr) => tr.kodikId === continueProgress.kodikId)
    : null;
  const initialResume =
    bootResume && selected.kodikId === continueProgress?.kodikId ? bootResume : null;

  const showContinue =
    user &&
    continueProgress &&
    continueProgress.positionSeconds >= MIN_SAVE_POSITION_SECONDS &&
    playable.some((tr) => tr.kodikId === continueProgress.kodikId);

  return (
    <section
      id="player"
      className="scroll-mt-20 rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Смотреть</h2>
        <div className="flex flex-wrap items-center gap-2">
          {ready && selected?.playerLink && !betaChromeless ? (
            <button
              type="button"
              onClick={togglePlayerExpanded}
              className="hidden rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim md:inline-flex"
              aria-pressed={playerExpanded}
            >
              {playerExpanded ? "Стандартный размер" : "На весь экран"}
            </button>
          ) : null}
          {showContinue && continueProgress ? (
          <button
            type="button"
            onClick={handleContinue}
            disabled={continueLoading}
            aria-busy={continueLoading}
            className={[
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
              continueLoading
                ? "cursor-wait border-accent/60 bg-accent/20 text-accent"
                : "border-accent/40 bg-accent/10 text-accent hover:border-accent hover:bg-accent/15 active:scale-[0.98]",
            ].join(" ")}
          >
            {continueLoading ? (
              <span
                aria-hidden
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              />
            ) : null}
            <span>{continueLoading ? "Переход…" : "Продолжить"}</span>
            <span className="text-xs font-normal text-muted">
              {continueTranslation?.translationTitle
                ? `${continueTranslation.translationTitle} · `
                : ""}
              {formatEpisodeOfTotal(continueProgress.episodeNumber, episodesTotal ?? null)} ·{" "}
              {formatWatchPosition(continueProgress.positionSeconds)}
            </span>
          </button>
          ) : null}
        </div>
      </div>

      {!user ? (
        <p className="mb-3 text-xs text-muted">Войдите, чтобы сохранять прогресс просмотра.</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {ready && selected?.playerLink ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handlePlayerRefresh}
              disabled={seekSkipDisabled}
              aria-busy={continueLoading}
              aria-label="Перезапустить плеер с текущей позиции"
              title="Перезапустить плеер с текущей позиции"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconPlayerRefresh spinning={continueLoading} />
              <span>Перезапустить плеер</span>
            </button>
          </div>
        ) : null}
        {!ready ? (
          <div className="aspect-video animate-pulse rounded-lg bg-surface-dim" />
        ) : selected?.playerLink ? (
          betaChromeless ? (
            <div
              ref={betaFullscreenRef}
              className="kodik-player-beta-stage overflow-hidden rounded-lg border border-border bg-black"
            >
              <div ref={playerExpandedHostRef} className="relative min-w-0">
                <KodikPlayerBetaViewport
                  playerRef={playerRef}
                  playerKey={`${selected.kodikId}-${playerResetNonce}-beta-${playerSrc}`}
                  src={playerSrc}
                  title={`${animeTitle} — ${selected.translationTitle}`}
                  sizeMode={isNativeFullscreen ? "viewport" : "default"}
                  initialResume={initialResume}
                  shikimoriId={shikimoriId}
                  kodikId={selected.kodikId}
                  seasonNumber={playerEpisode.seasonNumber}
                  currentEpisode={playerEpisode.episodeNumber}
                  playback={playback}
                  qualities={streamQualities}
                  currentQuality={streamQuality}
                  fullscreenActive={isNativeFullscreen}
                  seekSkipLabelSeconds={PLAYER_SEEK_SKIP_LABEL_SECONDS}
                  controlsDisabled={seekSkipDisabled}
                  continueOverlay={
                    continueLoading ? (
                      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55">
                        <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/70 px-4 py-2 text-sm text-white shadow-lg">
                          <span
                            aria-hidden
                            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"
                          />
                          <span>
                            Серия {continueTarget?.episodeNumber ?? continueProgress?.episodeNumber ?? "…"} ·
                            загрузка плеера…
                          </span>
                        </div>
                      </div>
                    ) : null
                  }
                  onReady={handlePlayerReady}
                  onContinueStateChange={handleContinueStateChange}
                  onProgress={trackProgress}
                  onPause={handlePause}
                  onTranslationChange={handlePlayerTranslationChange}
                  onPlaybackStateChange={handlePlaybackStateChange}
                  onEpisodeSelect={handleEpisodeSelect}
                  onPlayPause={() => playerRef.current?.togglePlay()}
                  onSeek={(seconds) => playerRef.current?.seekToPosition(seconds)}
                  onSeekSkip={(delta) => playerRef.current?.seekBy(delta)}
                  onVolumeChange={(volume) => {
                    playerRef.current?.setVolume(volume);
                    if (volume > 0 && playback.muted) playerRef.current?.unmute();
                  }}
                  onMuteToggle={() => {
                    if (playback.muted) playerRef.current?.unmute();
                    else playerRef.current?.mute();
                  }}
                  onQualityChange={handleQualityChange}
                  onFullscreenToggle={() => void toggleBetaFullscreen()}
                />
              </div>
              <div className="kodik-player-beta-translations border-t border-border bg-card p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
                {renderTranslationButtons()}
              </div>
            </div>
          ) : (
          <div
            ref={playerExpandedHostRef}
            className={[
              "relative min-w-0 transition-[width,margin] duration-300 ease-out",
              playerExpanded ? "anime-player-expanded-host" : "",
            ].join(" ")}
          >
            {continueLoading ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/55">
                <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/70 px-4 py-2 text-sm text-white shadow-lg">
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"
                  />
                  <span>
                    Серия {continueTarget?.episodeNumber ?? continueProgress?.episodeNumber ?? "…"} · загрузка плеера…
                  </span>
                </div>
              </div>
            ) : null}
            <KodikPlayer
              ref={playerRef}
              key={`${selected.kodikId}-${playerResetNonce}-std`}
              src={playerSrc}
              title={`${animeTitle} — ${selected.translationTitle}`}
              sizeMode={playerExpanded ? "viewport" : "default"}
              initialResume={initialResume}
              onReady={handlePlayerReady}
              onContinueStateChange={handleContinueStateChange}
              onProgress={trackProgress}
              onPause={handlePause}
              onTranslationChange={handlePlayerTranslationChange}
            />
          </div>
          )
        ) : null}

        {ready && selected?.playerLink && !betaChromeless ? (
          <div className="flex justify-stretch gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => handleSeekSkip(-PLAYER_SEEK_SKIP_SECONDS)}
              disabled={seekSkipDisabled}
              aria-label={`Назад ${PLAYER_SEEK_SKIP_LABEL_SECONDS} секунд`}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs"
            >
              −{PLAYER_SEEK_SKIP_LABEL_SECONDS} сек
            </button>
            <button
              type="button"
              onClick={() => handleSeekSkip(PLAYER_SEEK_SKIP_SECONDS)}
              disabled={seekSkipDisabled}
              aria-label={`Вперёд ${PLAYER_SEEK_SKIP_LABEL_SECONDS} секунд`}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs"
            >
              +{PLAYER_SEEK_SKIP_LABEL_SECONDS} сек
            </button>
          </div>
        ) : null}
      </div>

      {!betaChromeless ? (
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
        {renderTranslationButtons()}
      </div>
      ) : null}
    </section>
  );
}
