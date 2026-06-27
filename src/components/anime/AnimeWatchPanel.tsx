"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  KodikPlayer,
  type KodikPlayerHandle,
  type KodikPlayerResume,
} from "@/components/anime/KodikPlayer";
import type { KodikTranslationDto } from "@/lib/anime-page";
import { formatEpisodeProgress, labelTranslationType } from "@/lib/anime-labels";
import { resolveTranslationStudioId } from "@/lib/translation-colors";
import { formatWatchPosition, formatEpisodeOfTotal, type WatchProgressDto } from "@/lib/watch-history";
import { useDiscordConfig } from "@/hooks/useDiscordConfig";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";

type Props = {
  shikimoriId: number;
  animeTitle: string;
  translations: KodikTranslationDto[];
  episodesTotal?: number | null;
};

const SAVE_INTERVAL_MS = 30_000;
const MIN_SAVE_POSITION_SECONDS = 60;

type ProgressPayload = {
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
};

export function AnimeWatchPanel({ shikimoriId, animeTitle, translations, episodesTotal }: Props) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
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

  const playerRef = useRef<KodikPlayerHandle>(null);
  const selectedIdRef = useRef("");
  const liveProgressRef = useRef<ProgressPayload>({
    seasonNumber: 1,
    episodeNumber: 1,
    positionSeconds: 0,
  });
  const latestProgressRef = useRef<ProgressPayload | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const savingRef = useRef(false);
  const pendingContinueRef = useRef<KodikPlayerResume | null>(null);

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
          setBootResume({
            seasonNumber: progress.seasonNumber,
            episodeNumber: progress.episodeNumber,
            positionSeconds: progress.positionSeconds,
          });
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
  }, [user, shikimoriId, playable]);

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
      syncProgress({ ...payload, paused: false });
      markPlaying();
      if (payload.positionSeconds < MIN_SAVE_POSITION_SECONDS) return;
      latestProgressRef.current = payload;
    },
    [markPlaying, syncProgress],
  );

  const handlePlayerTranslationChange = useCallback(
    (translation: { id: number; title: string }) => {
      const match = playableByTranslationId.get(translation.id);
      if (!match || match.kodikId === selectedIdRef.current) return;

      setSelectedId(match.kodikId);
      saveTranslation(match.kodikId);
    },
    [playableByTranslationId, saveTranslation],
  );

  const handleTranslationSelect = useCallback(
    (kodikId: string) => {
      if (kodikId !== selectedIdRef.current) {
        saveTranslation(kodikId);
      }
      setBootResume(null);
      setSelectedId(kodikId);
      latestProgressRef.current = null;
      lastSavedFingerprintRef.current = "";
    },
    [saveTranslation],
  );

  const handlePause = useCallback(
    (payload: ProgressPayload) => {
      liveProgressRef.current = payload;
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
    return () => {
      clearDiscordPresence();
    };
  }, [clearDiscordPresence, shikimoriId]);

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
        playerRef.current?.seekAndPlay(pendingContinueRef.current);
        pendingContinueRef.current = null;
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [selectedId, ready]);

  const handlePlayerReady = useCallback(() => {
    if (!pendingContinueRef.current) return;
    const resume = pendingContinueRef.current;
    pendingContinueRef.current = null;
    playerRef.current?.seekAndPlay(resume);
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
      setContinueLoading(false);
      setContinueTarget(null);
      pendingContinueRef.current = null;
    }, 12_000);

    return () => window.clearTimeout(timeoutId);
  }, [continueLoading]);

  const handleContinue = () => {
    if (!continueProgress || continueLoading) return;

    const resume: KodikPlayerResume = {
      seasonNumber: continueProgress.seasonNumber,
      episodeNumber: continueProgress.episodeNumber,
      positionSeconds: continueProgress.positionSeconds,
    };

    setContinueLoading(true);
    setContinueTarget({ episodeNumber: continueProgress.episodeNumber });

    if (continueProgress.kodikId !== selectedIdRef.current) {
      pendingContinueRef.current = resume;
      setBootResume(null);
      setSelectedId(continueProgress.kodikId);
    } else {
      playerRef.current?.seekAndPlay(resume);
    }

    const el = document.getElementById("player");
    el?.scrollIntoView({ behavior: "auto", block: "start" });
  };

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

  const selected = playable.find((tr) => tr.kodikId === selectedId) ?? playable[0];
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

      {!user ? (
        <p className="mb-3 text-xs text-muted">Войдите, чтобы сохранять прогресс просмотра.</p>
      ) : null}

      {!ready ? (
        <div className="aspect-video animate-pulse rounded-lg bg-surface-dim" />
      ) : selected?.playerLink ? (
        <div className="relative">
          {continueLoading ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/55">
              <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/70 px-4 py-2 text-sm text-white shadow-lg">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"
                />
                <span>
                  Серия {continueTarget?.episodeNumber ?? continueProgress?.episodeNumber ?? "…"} · перемотка…
                </span>
              </div>
            </div>
          ) : null}
          <KodikPlayer
            ref={playerRef}
            key={selected.kodikId}
            src={selected.playerLink}
            title={`${animeTitle} — ${selected.translationTitle}`}
            initialResume={initialResume}
            onReady={handlePlayerReady}
            onContinueStateChange={handleContinueStateChange}
            onProgress={trackProgress}
            onPause={handlePause}
            onTranslationChange={handlePlayerTranslationChange}
          />
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
        <ul className="flex flex-wrap gap-2">
          {playable.map((tr) => {
            const active = tr.kodikId === selected.kodikId;
            const progress = formatEpisodeProgress(tr.lastSeason, tr.lastEpisode);
            const studioId = resolveTranslationStudioId(tr.translationTitle);
            return (
              <li key={tr.kodikId}>
                <button
                  type="button"
                  onClick={() => handleTranslationSelect(tr.kodikId)}
                  data-studio={studioId ?? undefined}
                  className={[
                    "rounded-lg border px-3 py-2 text-left text-xs transition",
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
                  <span className="block font-medium">{tr.translationTitle}</span>
                  <span className="mt-0.5 block text-[10px] opacity-80">
                    {labelTranslationType(tr.translationType)}
                    {progress ? ` · ${progress}` : ""}
                    {tr.quality ? ` · ${tr.quality}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
