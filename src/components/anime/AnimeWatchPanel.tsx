"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { emitCompanionReaction } from "@/lib/companion/companion-bus";
import {
  KodikPlayer,
  type KodikPlayerHandle,
  type KodikPlayerPlaybackState,
  type KodikPlayerProgressPayload,
  type KodikPlayerResume,
  type KodikPlayerResumeMode,
} from "@/components/anime/KodikPlayer";
import { KodikPlayerBetaViewport } from "@/components/anime/KodikPlayerBetaViewport";
import { KodikPlayerBetaEpisodeStrip } from "@/components/anime/KodikPlayerBetaEpisodeStrip";
import { OPEN_PLAYER_FULLSCREEN_EVENT } from "@/components/anime/AnimeWatchFullscreenButton";
import { WATCH_HISTORY_UPDATED_EVENT } from "@/components/anime/AnimePosterWatchActions";
import type {
  KodikPlayerBetaTheaterMode,
  KodikPlayerTimelineSegment,
} from "@/components/anime/KodikPlayerBetaControls";
import type { KodikTranslationDto } from "@/lib/anime-page";
import { formatEpisodeProgress } from "@/lib/anime-labels";
import { resolveTranslationStudioId } from "@/lib/translation-colors";
import { formatWatchPosition, formatEpisodeOfTotal, isWatchHistoryBookmark, type WatchProgressDto } from "@/lib/watch-history";
import { useDiscordConfig } from "@/hooks/useDiscordConfig";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import { useForcedTranslationIntroOffsets } from "@/hooks/useForcedTranslationIntroOffsets";
import { useWatchParty } from "@/hooks/useWatchParty";
import { coverCacheUrl } from "@/lib/poster";
import { applyIntroOffset, resolveTranslationIntroOffsetSec } from "@/lib/translation-intro-offset";
import type { WatchPartyCommand, WatchPartyPlaybackState } from "@/lib/watch-party/types";
import { setAndroidKeepScreenOn } from "@/lib/android-app";
import { withKodikPlayerCacheBust, resolveKodikPlayerEpisodeSwitch, isSingleEpisodeKodikPlayerLink } from "@/lib/player-url";

type Props = {
  shikimoriId: number;
  animeTitle: string;
  translations: KodikTranslationDto[];
  episodesTotal?: number | null;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "landscape-primary" | "landscape-secondary") => Promise<void>;
};

type MediaSessionAction =
  | "play"
  | "pause"
  | "previoustrack"
  | "nexttrack"
  | "seekbackward"
  | "seekforward";

type MediaSessionApi = {
  metadata: MediaMetadata | null;
  playbackState: "none" | "paused" | "playing";
  setActionHandler: (action: MediaSessionAction, handler: (() => void) | null) => void;
};

type MediaSessionNavigator = Navigator & {
  mediaSession?: MediaSessionApi;
};

const SAVE_INTERVAL_MS = 30_000;
const MIN_SAVE_POSITION_SECONDS = 60;
const PLAYER_SEEK_SKIP_LABEL_SECONDS = 90;
const PLAYER_SEEK_SKIP_SECONDS = PLAYER_SEEK_SKIP_LABEL_SECONDS;
const MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX = 56;
const CONTINUE_LOADING_TIMEOUT_MS = 22_000;
const AUTO_SKIP_CANCEL_SECONDS = 5;
const WATCH_PARTY_SYNC_TIMEOUT_MS = 4_000;
const WATCH_PARTY_SYNC_DRIFT_SECONDS = 1;
const WATCH_PARTY_TRANSLATION_SYNC_STORAGE_KEY = "ta.watchParty.translationSync";
const WATCH_PARTY_IDLE_PRESENCE_MS = 15_000;
const WATCH_PARTY_ACTIVE_PRESENCE_MS = 2_000;
const EPISODE_END_CANDIDATE_WINDOW_SECONDS = 20;
const WATCH_PARTY_END_GUARD_SECONDS = 1.25;
const WATCH_PARTY_END_HOLD_OFFSET_SECONDS = 1.5;
const PLAYER_RELOAD_COMPENSATION_SECONDS = 1;

function episodeSeriaCacheKey(kodikId: string, seasonNumber: number, episodeNumber: number): string {
  return `${kodikId}:${seasonNumber}:${episodeNumber}`;
}

function resolveContinueSeriaEmbedLink(link: string | null | undefined): string | null {
  if (!link?.trim()) return null;
  return isSingleEpisodeKodikPlayerLink(link) ? link.trim() : null;
}

/** Per-episode `/seria/` link for iframe remount; null if only season/serial. */
async function loadEpisodePlayerLink(
  shikimoriId: number,
  kodikId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      kodikId,
      season: String(seasonNumber),
      exactSeason: "1",
    });
    const res = await fetch(`/api/anime/${shikimoriId}/episodes?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      seasonPlayerLink?: string | null;
      episodes?: Array<{ episodeNumber: number; playerLink: string | null }>;
    };
    const match = data.episodes?.find((episode) => episode.episodeNumber === episodeNumber);
    return match?.playerLink ?? data.seasonPlayerLink ?? null;
  } catch {
    return null;
  }
}

async function loadSeasonSeriaLinks(
  shikimoriId: number,
  kodikId: string,
  seasonNumber: number,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  try {
    const params = new URLSearchParams({
      kodikId,
      season: String(seasonNumber),
      exactSeason: "1",
    });
    const res = await fetch(`/api/anime/${shikimoriId}/episodes?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return result;
    const data = (await res.json()) as {
      episodes?: Array<{ episodeNumber: number; playerLink: string | null }>;
    };
    for (const episode of data.episodes ?? []) {
      const seria = resolveContinueSeriaEmbedLink(episode.playerLink);
      if (seria) result.set(episode.episodeNumber, seria);
    }
  } catch {
    return result;
  }
  return result;
}

const DEFAULT_PLAYBACK_STATE: KodikPlayerPlaybackState = {
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 1,
  muted: false,
  mediaUnlocked: false,
  videoReady: false,
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

function IconSkipTimesFound() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M7 5.5v13l10-6.5-10-6.5z" />
      <path d="M18 5h2v14h-2V5z" />
    </svg>
  );
}

function compensatePlayerReloadResume(resume: KodikPlayerResume): KodikPlayerResume {
  return {
    ...resume,
    positionSeconds: Math.max(0, resume.positionSeconds - PLAYER_RELOAD_COMPENSATION_SECONDS),
  };
}

/** Нет смысла переключаться на серию дальше последней доступной в Kodik / анонсированного тотала. */
function isEpisodeBeyondAvailability(
  seasonNumber: number,
  episodeNumber: number,
  translation: Pick<KodikTranslationDto, "lastSeason" | "lastEpisode"> | undefined,
  episodesTotal: number | null | undefined,
): boolean {
  if (episodeNumber < 1) return true;
  if (episodesTotal != null && episodeNumber > episodesTotal) return true;
  if (translation?.lastSeason == null || translation.lastEpisode == null) return false;
  if (seasonNumber > translation.lastSeason) return true;
  if (seasonNumber === translation.lastSeason && episodeNumber > translation.lastEpisode) {
    return true;
  }
  return false;
}

function PlayerLoadingOverlay({
  episodeNumber,
  fallbackEpisodeNumber,
}: {
  episodeNumber?: number;
  fallbackEpisodeNumber?: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-black/60">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-white/15 bg-black/70 px-5 py-4 text-center text-sm text-white shadow-lg">
        <Image
          src="/loading.webp"
          alt=""
          aria-hidden="true"
          width={160}
          height={160}
          className="anime-player-loading-image h-40 w-40 object-contain drop-shadow-[0_0_22px_rgba(255,255,255,0.2)] sm:h-48 sm:w-48"
          unoptimized
        />
        <span>
          Серия {episodeNumber ?? fallbackEpisodeNumber ?? "…"} · загрузка плеера…
        </span>
      </div>
    </div>
  );
}

type ProgressPayload = KodikPlayerProgressPayload;

function readWatchPartyTranslationSyncEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(WATCH_PARTY_TRANSLATION_SYNC_STORAGE_KEY) !== "false";
}

type SkipTimeDto = {
  skipType: "op" | "ed" | "mixed-op" | "mixed-ed";
  startTime: number;
  endTime: number;
  episodeLength?: number;
};

type DisplaySkipTimeDto = SkipTimeDto & {
  originalStartTime: number;
  originalEndTime: number;
};

async function lockLandscapeOrientation(): Promise<void> {
  try {
    await (screen.orientation as LockableScreenOrientation | undefined)?.lock?.("landscape");
  } catch {
    /* Mobile browsers may reject orientation lock outside installed/PWA contexts. */
  }
}

function unlockScreenOrientation(): void {
  screen.orientation?.unlock?.();
}

type PendingAutoSkip = {
  key: string;
  skipTime: DisplaySkipTimeDto;
};

type SkipTimesDto = {
  found: boolean;
  source: "cache" | "aniskip" | "missing-mal-id";
  malId: number | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeLength: number;
  results: SkipTimeDto[];
};

type SkipTimesResponse = {
  skipTimes?: SkipTimesDto;
};

type AdminSkipTimesPrefetchDto = {
  checked: number;
  failed: number;
  found: number;
  episodes: Array<{
    seasonNumber: number;
    episodeNumber: number;
    count: number;
    source: string;
  }>;
};

function skipTimeLabel(type: SkipTimeDto["skipType"]): string {
  switch (type) {
    case "op":
    case "mixed-op":
      return "Пропустить опенинг";
    case "ed":
    case "mixed-ed":
      return "Пропустить эндинг";
  }
}

function skipTimeTypeLabel(type: SkipTimeDto["skipType"]): string {
  switch (type) {
    case "op":
      return "OP";
    case "ed":
      return "ED";
    case "mixed-op":
      return "Mixed OP";
    case "mixed-ed":
      return "Mixed ED";
  }
}

function skipTimeSourceLabel(source: SkipTimesDto["source"]): string {
  switch (source) {
    case "cache":
      return "кэш";
    case "aniskip":
      return "AniSkip";
    case "missing-mal-id":
      return "нет MAL ID";
  }
}

function isSkipTimeActionable(skipTime: DisplaySkipTimeDto, positionSeconds: number): boolean {
  if (positionSeconds >= skipTime.endTime) return false;
  return positionSeconds >= skipTime.startTime;
}

function formatKodikSeasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? "Рекап" : `${seasonNumber} сезон`;
}

function formatKodikSeasonsBadge(seasons: Array<{ seasonNumber: number }>): string | null {
  if (seasons.length <= 1) return null;
  return seasons.map((season) => formatKodikSeasonLabel(season.seasonNumber)).join(" + ");
}

function isSkipTimeAutoSkipPending(skipTime: DisplaySkipTimeDto, positionSeconds: number): boolean {
  if (positionSeconds >= skipTime.startTime) return false;
  return positionSeconds >= Math.max(0, skipTime.startTime - AUTO_SKIP_CANCEL_SECONDS);
}

function isOpeningOrEndingSkipTime(skipTime: DisplaySkipTimeDto): boolean {
  return (
    skipTime.skipType === "op" ||
    skipTime.skipType === "ed" ||
    skipTime.skipType === "mixed-op" ||
    skipTime.skipType === "mixed-ed"
  );
}

function skipTimeKey(
  kodikId: string,
  episode: { seasonNumber: number; episodeNumber: number },
  skipTime: DisplaySkipTimeDto,
): string {
  return [
    kodikId,
    episode.seasonNumber,
    episode.episodeNumber,
    skipTime.skipType,
    Math.round(skipTime.originalStartTime * 10) / 10,
    Math.round(skipTime.originalEndTime * 10) / 10,
  ].join(":");
}

export function AnimeWatchPanel({
  shikimoriId,
  animeTitle,
  translations,
  episodesTotal,
}: Props) {
  const { user } = useAuth();
  const { settings, updateSettings } = useSiteSettings();
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
  const [playback, setPlayback] = useState<KodikPlayerPlaybackState>(DEFAULT_PLAYBACK_STATE);
  /** Skip UI / auto-skip clock — from liveProgressRef, not every parent playback emit. */
  const [skipClockSeconds, setSkipClockSeconds] = useState(0);
  const [playerResetNonce, setPlayerResetNonce] = useState(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [fullscreenTranslationsOpen, setFullscreenTranslationsOpen] = useState(false);
  const [fullscreenTranslationsHovered, setFullscreenTranslationsHovered] = useState(false);
  const [betaTheaterMode, setBetaTheaterMode] =
    useState<KodikPlayerBetaTheaterMode>("normal");
  const [playerEpisode, setPlayerEpisode] = useState({ seasonNumber: 1, episodeNumber: 1 });
  const [skipTimes, setSkipTimes] = useState<SkipTimeDto[]>([]);
  const [skipTimesInfo, setSkipTimesInfo] = useState<SkipTimesDto | null>(null);
  const [skipTimesLoading, setSkipTimesLoading] = useState(false);
  const [adminSkipPrefetch, setAdminSkipPrefetch] = useState<AdminSkipTimesPrefetchDto | null>(null);
  const [adminSkipPrefetchLoading, setAdminSkipPrefetchLoading] = useState(false);
  const [skipTimesPopupPinned, setSkipTimesPopupPinned] = useState(false);
  const [pendingAutoSkip, setPendingAutoSkip] = useState<PendingAutoSkip | null>(null);
  const [watchPartyPlaybackUnlocked, setWatchPartyPlaybackUnlocked] = useState(false);
  const [watchPartySyncing, setWatchPartySyncing] = useState(false);
  const [watchPartyTranslationSyncEnabled, setWatchPartyTranslationSyncEnabled] = useState(
    readWatchPartyTranslationSyncEnabled,
  );
  const [pendingWatchPartyCommand, setPendingWatchPartyCommand] =
    useState<WatchPartyCommand | null>(null);
  const playerExpandedHostRef = useRef<HTMLDivElement>(null);
  const betaFullscreenRef = useRef<HTMLDivElement>(null);
  const betaTranslationsRef = useRef<HTMLDivElement>(null);
  const betaTranslationsTouchRef = useRef<{ startX: number; startY: number } | null>(null);

  const playerRef = useRef<KodikPlayerHandle>(null);
  const selectedIdRef = useRef("");
  const isPausedRef = useRef(true);
  const pendingContinueModeRef = useRef<KodikPlayerResumeMode>("play");
  const liveProgressRef = useRef<ProgressPayload>({
    seasonNumber: 1,
    episodeNumber: 1,
    positionSeconds: 0,
  });
  const episodeEndCandidateRef = useRef<ProgressPayload | null>(null);
  const latestProgressRef = useRef<ProgressPayload | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const savingRef = useRef(false);
  const pendingContinueRef = useRef<KodikPlayerResume | null>(null);
  const pendingContinueOptionsRef = useRef<{ uiEpisodeAlreadyTargeted?: boolean } | undefined>(undefined);
  const lastContinueResumeRef = useRef<KodikPlayerResume | null>(null);
  /** Prefetched `/seria/` embeds: `${kodikId}:${season}:${episode}` → URL. */
  const episodeSeriaLinksRef = useRef<Map<string, string>>(new Map());
  /** Applied by selectedId effect so translation switch does not clobber episode remount. */
  const pendingPlayerSrcRef = useRef<string | null>(null);
  const silentContinueFlowRef = useRef(false);
  const suppressContinueOverlayRef = useRef(false);
  const autoSkippedIntervalsRef = useRef(new Set<string>());
  const cancelledAutoSkipIntervalsRef = useRef(new Set<string>());
  const previousAutoSkipPositionRef = useRef(0);
  const translationIntroOffsetsRef = useRef(settings.translationIntroOffsets);
  const forcedIntroOffsetsRef = useRef(forcedIntroOffsets);
  const applyingWatchPartyCommandRef = useRef(false);
  const playbackStateInitializedRef = useRef(false);
  /** Watch party + presence: always current, even when React skips position-only updates. */
  const isPlayingRef = useRef(false);
  const durationSecondsRef = useRef(0);
  const suppressNextPlaybackBroadcastRef = useRef(false);
  const watchPartyTranslationSyncActiveRef = useRef(true);
  const waitingForHostEpisodeRef = useRef<Pick<ProgressPayload, "seasonNumber" | "episodeNumber"> | null>(
    null,
  );
  const sendWatchPartyPlaybackEventRef = useRef<(isPlaying: boolean) => void>(() => {});
  const watchPartyEndGuardKeyRef = useRef("");
  const handleWatchPartyEndGuardRef = useRef<(payload: ProgressPayload) => void>(() => {});
  const suppressNextEndedRef = useRef(false);
  const suppressNextEndedTimeoutRef = useRef<number | null>(null);

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
        translationIntroOffsetsRef.current,
        forcedIntroOffsetsRef.current,
      );
    },
    [playableByKodikId],
  );
  const watchPartyStateToResume = useCallback(
    (state: WatchPartyPlaybackState): KodikPlayerResume => ({
      seasonNumber: state.seasonNumber,
      episodeNumber: state.episodeNumber,
      positionSeconds: Math.max(0, state.positionSeconds),
    }),
    [],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!ready || !selectedId) return;
    window.dispatchEvent(
      new CustomEvent("ta:player-translation-changed", {
        detail: { shikimoriId, kodikId: selectedId },
      }),
    );
  }, [ready, selectedId, shikimoriId]);

  useEffect(() => {
    window.localStorage.setItem(
      WATCH_PARTY_TRANSLATION_SYNC_STORAGE_KEY,
      String(watchPartyTranslationSyncEnabled),
    );
  }, [watchPartyTranslationSyncEnabled]);

  useEffect(() => {
    translationIntroOffsetsRef.current = settings.translationIntroOffsets;
  }, [settings.translationIntroOffsets]);

  useEffect(() => {
    forcedIntroOffsetsRef.current = forcedIntroOffsets;
  }, [forcedIntroOffsets]);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!user) {
        setContinueProgress(null);
        setBootResume(null);
        pendingContinueRef.current = null;
        pendingContinueOptionsRef.current = undefined;
        setContinueLoading(false);
        setContinueTarget(null);
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
        const savedTranslationOk =
          Boolean(savedKodikId) && playable.some((tr) => tr.kodikId === savedKodikId);

        if (
          progress &&
          progress.positionSeconds >= MIN_SAVE_POSITION_SECONDS &&
          savedTranslationOk &&
          savedKodikId
        ) {
          const resume = compensatePlayerReloadResume(
            applyPositionOffset(
              {
                seasonNumber: progress.seasonNumber,
                episodeNumber: progress.episodeNumber,
                positionSeconds: progress.positionSeconds,
              },
              savedKodikId,
            ),
          );

          // UI сразу на сохранённой серии; мягкий seek без continue-flow —
          // полный pause-continue на холодном iframe зависает с оверлеем «Переход…».
          setPlayerEpisode({
            seasonNumber: resume.seasonNumber,
            episodeNumber: resume.episodeNumber,
          });
          liveProgressRef.current = {
            seasonNumber: resume.seasonNumber,
            episodeNumber: resume.episodeNumber,
            positionSeconds: resume.positionSeconds,
          };
          pendingContinueRef.current = null;
          pendingContinueOptionsRef.current = undefined;
          setBootResume(resume);

          // Resolve /seria/ before setSelectedId so the selectedId effect applies it, not material.
          const bootLink = await loadEpisodePlayerLink(
            shikimoriId,
            savedKodikId,
            resume.seasonNumber,
            resume.episodeNumber,
          );
          if (cancelled) return;
          const bootSeria = resolveContinueSeriaEmbedLink(bootLink);
          if (bootSeria) {
            episodeSeriaLinksRef.current.set(
              episodeSeriaCacheKey(savedKodikId, resume.seasonNumber, resume.episodeNumber),
              bootSeria,
            );
            pendingPlayerSrcRef.current = withKodikPlayerCacheBust(bootSeria, Date.now());
          }
        } else {
          setBootResume(null);
          pendingContinueRef.current = null;
          pendingContinueOptionsRef.current = undefined;
        }

        if (savedTranslationOk && savedKodikId) {
          setSelectedId(savedKodikId);
        } else {
          setSelectedId(playable[0]?.kodikId ?? "");
        }
      } catch {
        if (!cancelled) setSelectedId(playable[0]?.kodikId ?? "");
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    setReady(false);
    setBootResume(null);
    pendingContinueRef.current = null;
    pendingContinueOptionsRef.current = undefined;
    silentContinueFlowRef.current = false;
    setContinueLoading(false);
    setContinueTarget(null);
    lastSavedFingerprintRef.current = "";
    latestProgressRef.current = null;
    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [user, shikimoriId, playable, applyPositionOffset]);

  useEffect(() => {
    const onHistoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ shikimoriId: number; progress: WatchProgressDto }>).detail;
      if (detail?.shikimoriId !== shikimoriId || !detail.progress) return;

      setContinueProgress(detail.progress);
      lastSavedFingerprintRef.current = [
        detail.progress.kodikId,
        detail.progress.seasonNumber,
        detail.progress.episodeNumber,
        Math.floor(detail.progress.positionSeconds),
      ].join(":");

      if (isWatchHistoryBookmark(detail.progress)) {
        setPlayerEpisode({ seasonNumber: 1, episodeNumber: 1 });
        liveProgressRef.current = { seasonNumber: 1, episodeNumber: 1, positionSeconds: 0 };
        return;
      }

      setPlayerEpisode({
        seasonNumber: detail.progress.seasonNumber,
        episodeNumber: detail.progress.episodeNumber,
      });
      liveProgressRef.current = {
        seasonNumber: detail.progress.seasonNumber,
        episodeNumber: detail.progress.episodeNumber,
        positionSeconds: detail.progress.positionSeconds,
      };
    };

    window.addEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED_EVENT, onHistoryUpdated);
  }, [shikimoriId]);

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
      const payload =
        continueProgress && isWatchHistoryBookmark(continueProgress)
          ? { seasonNumber: 1, episodeNumber: 0, positionSeconds: 0 }
          : liveProgressRef.current;
      void saveProgressNow(payload, kodikId, {
        skipMinPosition: true,
        force: true,
      });
    },
    [continueProgress, saveProgressNow],
  );

  const trackProgress = useCallback(
    (payload: ProgressPayload) => {
      const previous = liveProgressRef.current;
      const episodeChanged =
        previous.seasonNumber !== payload.seasonNumber ||
        previous.episodeNumber !== payload.episodeNumber;
      liveProgressRef.current = payload;
      setPlayerEpisode((prev) =>
        prev.seasonNumber === payload.seasonNumber && prev.episodeNumber === payload.episodeNumber
          ? prev
          : { seasonNumber: payload.seasonNumber, episodeNumber: payload.episodeNumber },
      );
      if (payload.source === "time") {
        const durationSeconds = durationSecondsRef.current;
        const nearEnd =
          durationSeconds > 0 &&
          payload.positionSeconds >=
            Math.max(0, durationSeconds - EPISODE_END_CANDIDATE_WINDOW_SECONDS);

        if (nearEnd && !episodeChanged) {
          episodeEndCandidateRef.current = payload;
        } else if (!nearEnd || payload.positionSeconds < EPISODE_END_CANDIDATE_WINDOW_SECONDS) {
          episodeEndCandidateRef.current = null;
        }

        const shouldGuardWatchPartyEnd =
          isPlayingRef.current &&
          durationSeconds > WATCH_PARTY_END_HOLD_OFFSET_SECONDS + 1 &&
          payload.positionSeconds >=
            Math.max(0, durationSeconds - WATCH_PARTY_END_GUARD_SECONDS);

        if (shouldGuardWatchPartyEnd) {
          const guardKey = [
            selectedIdRef.current,
            payload.seasonNumber,
            payload.episodeNumber,
            Math.round(durationSeconds),
          ].join(":");
          if (watchPartyEndGuardKeyRef.current !== guardKey) {
            watchPartyEndGuardKeyRef.current = guardKey;
            suppressNextEndedRef.current = true;
            if (suppressNextEndedTimeoutRef.current != null) {
              window.clearTimeout(suppressNextEndedTimeoutRef.current);
            }
            suppressNextEndedTimeoutRef.current = window.setTimeout(() => {
              suppressNextEndedRef.current = false;
              suppressNextEndedTimeoutRef.current = null;
            }, 5_000);
            handleWatchPartyEndGuardRef.current(payload);
          }
        }
      }
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
        pendingContinueOptionsRef.current = undefined;
        setContinueLoading(false);
        setContinueTarget(null);
        setSelectedId(kodikId);
        return;
      }

      const adjusted = applyPositionOffset(resume, kodikId, selectedIdRef.current);
      const mode: KodikPlayerResumeMode = isPausedRef.current ? "pause" : "play";

      // Both play and pause must use continue-flow (play → seek → optional pause).
      // bootResume/applyInitialSeek alone is ignored by a cold Kodik iframe, so a
      // paused translation switch would land at the episode start.
      if (mode === "pause") {
        silentContinueFlowRef.current = true;
        window.setTimeout(() => {
          silentContinueFlowRef.current = false;
        }, 10_000);
        setContinueLoading(false);
        setContinueTarget(null);
      } else {
        setContinueLoading(true);
        setContinueTarget({ episodeNumber: adjusted.episodeNumber });
      }

      pendingContinueRef.current = adjusted;
      pendingContinueOptionsRef.current = { uiEpisodeAlreadyTargeted: true };
      pendingContinueModeRef.current = mode;
      setSelectedId(kodikId);

      // Prefer /seria/ of the same S/E on the new translation when available.
      void (async () => {
        const link = await loadEpisodePlayerLink(
          shikimoriId,
          kodikId,
          adjusted.seasonNumber,
          adjusted.episodeNumber,
        );
        if (selectedIdRef.current !== kodikId) return;
        const seria = resolveContinueSeriaEmbedLink(link);
        if (!seria) return;
        episodeSeriaLinksRef.current.set(
          episodeSeriaCacheKey(kodikId, adjusted.seasonNumber, adjusted.episodeNumber),
          seria,
        );
        setPlayerSrc(withKodikPlayerCacheBust(seria, Date.now()));
        setPlayerResetNonce((nonce) => nonce + 1);
      })();
    },
    [applyPositionOffset, saveTranslation, shikimoriId],
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
        const options = pendingContinueOptionsRef.current;
        pendingContinueOptionsRef.current = undefined;
        playerRef.current?.seekTo(
          pendingContinueRef.current,
          pendingContinueModeRef.current,
          options,
        );
        pendingContinueRef.current = null;
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [selectedId, ready]);

  const handlePlayerReady = useCallback(() => {
    if (!pendingContinueRef.current) return;
    const resume = pendingContinueRef.current;
    const mode = pendingContinueModeRef.current;
    const options = pendingContinueOptionsRef.current;
    pendingContinueRef.current = null;
    pendingContinueOptionsRef.current = undefined;
    playerRef.current?.seekTo(resume, mode, options);
  }, []);

  const handleContinueStateChange = useCallback((active: boolean) => {
    if (silentContinueFlowRef.current) {
      if (!active) silentContinueFlowRef.current = false;
      return;
    }
    if (suppressContinueOverlayRef.current) {
      setWatchPartySyncing(active);
      if (!active) suppressContinueOverlayRef.current = false;
      return;
    }
    setContinueLoading(active);
    if (!active) {
      setContinueTarget(null);
    }
  }, []);

  useEffect(() => {
    if (!watchPartySyncing) return;

    const timeoutId = window.setTimeout(() => {
      suppressContinueOverlayRef.current = false;
      setWatchPartySyncing(false);
    }, WATCH_PARTY_SYNC_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [watchPartySyncing]);

  useEffect(() => {
    if (!continueLoading) return;

    const timeoutId = window.setTimeout(() => {
      const resume = lastContinueResumeRef.current;
      playerRef.current?.abortContinue();
      setContinueLoading(false);
      setContinueTarget(null);
      // Soft remount only — re-queuing pendingContinue re-armed the overlay forever
      // when Kodik never confirmed the episode (retail hang on «загрузка плеера»).
      pendingContinueRef.current = null;
      pendingContinueOptionsRef.current = undefined;
      if (resume && resume.positionSeconds >= 1) {
        setBootResume(compensatePlayerReloadResume(resume));
      }
      const seriaLink = resume
        ? episodeSeriaLinksRef.current.get(
            episodeSeriaCacheKey(
              selectedIdRef.current || selectedId,
              resume.seasonNumber,
              resume.episodeNumber,
            ),
          )
        : null;
      const baseLink =
        seriaLink ?? playable.find((tr) => tr.kodikId === selectedId)?.playerLink ?? null;
      if (baseLink) {
        setPlayerSrc(withKodikPlayerCacheBust(baseLink, Date.now()));
      }
      setPlayerResetNonce((nonce) => nonce + 1);
    }, CONTINUE_LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [continueLoading, playable, selectedId]);

  const rememberSeriaLink = useCallback(
    (kodikId: string, seasonNumber: number, episodeNumber: number, link: string | null | undefined) => {
      const seria = resolveContinueSeriaEmbedLink(link);
      if (!seria) return null;
      episodeSeriaLinksRef.current.set(
        episodeSeriaCacheKey(kodikId, seasonNumber, episodeNumber),
        seria,
      );
      return seria;
    },
    [],
  );

  const getCachedSeriaLink = useCallback(
    (kodikId: string, seasonNumber: number, episodeNumber: number) =>
      episodeSeriaLinksRef.current.get(episodeSeriaCacheKey(kodikId, seasonNumber, episodeNumber)) ??
      null,
    [],
  );

  const remountToEpisodeEmbed = useCallback(
    (options: {
      resume: KodikPlayerResume;
      embedLink: string;
      switchToKodikId?: string;
      mode?: KodikPlayerResumeMode;
      showLoadingOverlay?: boolean;
      bootOnly?: boolean;
    }) => {
      const {
        resume,
        embedLink,
        switchToKodikId,
        mode = "play",
        showLoadingOverlay = true,
        bootOnly = false,
      } = options;

      setPlayerEpisode({
        seasonNumber: resume.seasonNumber,
        episodeNumber: resume.episodeNumber,
      });
      liveProgressRef.current = {
        seasonNumber: resume.seasonNumber,
        episodeNumber: resume.episodeNumber,
        positionSeconds: resume.positionSeconds,
      };
      lastContinueResumeRef.current = resume;

      if (bootOnly) {
        pendingContinueRef.current = null;
        pendingContinueOptionsRef.current = undefined;
        setBootResume(resume);
        setContinueLoading(false);
        setContinueTarget(null);
      } else {
        const embedIsSeria = isSingleEpisodeKodikPlayerLink(embedLink);
        pendingContinueRef.current = resume;
        // Blind only when the embed URL itself locks the episode (/seria/).
        pendingContinueOptionsRef.current = embedIsSeria
          ? { uiEpisodeAlreadyTargeted: true }
          : undefined;
        pendingContinueModeRef.current = mode;
        setBootResume(null);
        if (
          showLoadingOverlay &&
          mode === "play" &&
          !silentContinueFlowRef.current &&
          !suppressContinueOverlayRef.current
        ) {
          setContinueLoading(true);
          setContinueTarget({ episodeNumber: resume.episodeNumber });
        }
      }

      const busted = withKodikPlayerCacheBust(embedLink, Date.now());
      if (switchToKodikId && switchToKodikId !== selectedIdRef.current) {
        pendingPlayerSrcRef.current = busted;
        setSelectedId(switchToKodikId);
        return;
      }

      setPlayerSrc(busted);
      setPlayerResetNonce((nonce) => nonce + 1);
    },
    [],
  );

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

    lastContinueResumeRef.current = resume;
    setContinueLoading(true);
    setContinueTarget({ episodeNumber: resume.episodeNumber });
    pendingContinueModeRef.current = "play";
    isPausedRef.current = false;

    const el = document.getElementById("player");
    el?.scrollIntoView({ behavior: "auto", block: "start" });

    const switchToKodikId =
      continueProgress.kodikId !== selectedIdRef.current ? continueProgress.kodikId : undefined;

    const startWithSeriaOrFallback = (seriaLink: string | null) => {
      if (seriaLink) {
        remountToEpisodeEmbed({
          resume,
          embedLink: seriaLink,
          switchToKodikId,
          showLoadingOverlay: true,
        });
        return;
      }

      if (switchToKodikId) {
        pendingContinueRef.current = resume;
        pendingContinueOptionsRef.current = { uiEpisodeAlreadyTargeted: true };
        setBootResume(null);
        setSelectedId(switchToKodikId);
      } else {
        playerRef.current?.seekTo(resume, "play", { uiEpisodeAlreadyTargeted: true });
      }
    };

    const cachedSeria = getCachedSeriaLink(
      continueProgress.kodikId,
      resume.seasonNumber,
      resume.episodeNumber,
    );
    if (cachedSeria) {
      startWithSeriaOrFallback(cachedSeria);
      return;
    }

    void (async () => {
      const link = await loadEpisodePlayerLink(
        shikimoriId,
        continueProgress.kodikId,
        resume.seasonNumber,
        resume.episodeNumber,
      );
      startWithSeriaOrFallback(
        rememberSeriaLink(
          continueProgress.kodikId,
          resume.seasonNumber,
          resume.episodeNumber,
          link,
        ),
      );
    })();
  };

  const handleSeekSkip = (deltaSeconds: number) => {
    playerRef.current?.seekBy(deltaSeconds);
  };

  const handleSkipTime = useCallback((skipTime: DisplaySkipTimeDto) => {
    playerRef.current?.seekToPosition(skipTime.endTime);
  }, []);

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
  const betaChromeless = !settings.useLegacyKodikPlayer;
  const betaTheaterExpanded = betaTheaterMode !== "normal";
  const betaTranslationsHoverEnabled = isNativeFullscreen;
  const roundedEpisodeLength = Math.round(playback.durationSeconds);
  const selected = playable.find((tr) => tr.kodikId === selectedId) ?? playable[0];
  const previousEpisodeDisabled = playerEpisode.episodeNumber <= 1;
  const nextEpisodeDisabled = isEpisodeBeyondAvailability(
    playerEpisode.seasonNumber,
    playerEpisode.episodeNumber + 1,
    selected,
    episodesTotal,
  );
  const selectedPlayerLink = selected?.playerLink ?? null;
  const getWatchPartyState = useCallback((): WatchPartyPlaybackState | null => {
    const kodikId = selectedIdRef.current || selected?.kodikId;
    if (!kodikId || !ready) return null;
    return {
      shikimoriId,
      kodikId,
      seasonNumber: liveProgressRef.current.seasonNumber,
      episodeNumber: liveProgressRef.current.episodeNumber,
      positionSeconds: Math.max(0, liveProgressRef.current.positionSeconds),
      isPlaying: isPlayingRef.current,
      updatedAt: Date.now(),
    };
  }, [ready, selected?.kodikId, shikimoriId]);
  const applyWatchPartyState = useCallback(
    (
      state: WatchPartyPlaybackState,
      mode: KodikPlayerResumeMode,
      options: { syncTranslation?: boolean } = {},
    ) => {
      const resume = watchPartyStateToResume(state);
      const syncTranslation = options.syncTranslation ?? true;

      applyingWatchPartyCommandRef.current = true;
      isPausedRef.current = mode === "pause";
      suppressContinueOverlayRef.current = true;
      setWatchPartySyncing(true);

      const applyEpisodeSwitch = (embedLink: string | null, switchToKodikId?: string) => {
        if (embedLink) {
          remountToEpisodeEmbed({
            resume,
            embedLink,
            switchToKodikId,
            mode,
            showLoadingOverlay: false,
          });
          return;
        }
        if (switchToKodikId && switchToKodikId !== selectedIdRef.current) {
          pendingContinueRef.current = resume;
          pendingContinueOptionsRef.current = { uiEpisodeAlreadyTargeted: true };
          pendingContinueModeRef.current = mode;
          setBootResume(null);
          setSelectedId(switchToKodikId);
          return;
        }
        playerRef.current?.seekTo(resume, mode, { uiEpisodeAlreadyTargeted: true });
      };

      const resolveAndApplyEpisodeSwitch = (switchToKodikId?: string) => {
        const targetKodikId = switchToKodikId ?? selectedIdRef.current;
        const cached = getCachedSeriaLink(
          targetKodikId,
          resume.seasonNumber,
          resume.episodeNumber,
        );
        if (cached) {
          applyEpisodeSwitch(cached, switchToKodikId);
          return;
        }
        void (async () => {
          const link = await loadEpisodePlayerLink(
            shikimoriId,
            targetKodikId,
            resume.seasonNumber,
            resume.episodeNumber,
          );
          applyEpisodeSwitch(
            rememberSeriaLink(targetKodikId, resume.seasonNumber, resume.episodeNumber, link),
            switchToKodikId,
          );
        })();
      };

      if (!playerRef.current) {
        pendingContinueRef.current = resume;
        pendingContinueModeRef.current = mode;
      } else if (syncTranslation && state.kodikId !== selectedIdRef.current) {
        if (!playableByKodikId.has(state.kodikId)) {
          setWatchPartySyncing(false);
          suppressContinueOverlayRef.current = false;
          applyingWatchPartyCommandRef.current = false;
          return;
        }
        resolveAndApplyEpisodeSwitch(state.kodikId);
      } else {
        const sameEpisode =
          liveProgressRef.current.seasonNumber === resume.seasonNumber &&
          liveProgressRef.current.episodeNumber === resume.episodeNumber;

        if (sameEpisode) {
          playerRef.current.syncToPosition(resume.positionSeconds, mode);
          window.setTimeout(() => {
            suppressContinueOverlayRef.current = false;
            setWatchPartySyncing(false);
          }, 350);
        } else {
          resolveAndApplyEpisodeSwitch();
        }
      }

      window.setTimeout(() => {
        applyingWatchPartyCommandRef.current = false;
      }, 1_200);
    },
    [
      getCachedSeriaLink,
      playableByKodikId,
      rememberSeriaLink,
      remountToEpisodeEmbed,
      shikimoriId,
      watchPartyStateToResume,
    ],
  );
  const applyWatchPartySync = useCallback(
    (state: WatchPartyPlaybackState, options: { syncTranslation?: boolean } = {}) => {
      const resume = watchPartyStateToResume(state);
      const syncTranslation = options.syncTranslation ?? true;
      if (syncTranslation && state.kodikId !== selectedIdRef.current) {
        applyWatchPartyState(state, state.isPlaying ? "play" : "pause", options);
        return;
      }
      const sameEpisode =
        liveProgressRef.current.seasonNumber === resume.seasonNumber &&
        liveProgressRef.current.episodeNumber === resume.episodeNumber;
      const driftSeconds = Math.abs(liveProgressRef.current.positionSeconds - resume.positionSeconds);

      if (!sameEpisode || driftSeconds > WATCH_PARTY_SYNC_DRIFT_SECONDS) {
        applyWatchPartyState(state, state.isPlaying ? "play" : "pause", options);
        return;
      }

      if (state.isPlaying && !isPlayingRef.current) playerRef.current?.play();
      if (!state.isPlaying && isPlayingRef.current) playerRef.current?.pause();
    },
    [applyWatchPartyState, watchPartyStateToResume],
  );
  const handleWatchPartyCommand = useCallback(
    (command: WatchPartyCommand) => {
      const waitingForHostEpisode = waitingForHostEpisodeRef.current;
      if (waitingForHostEpisode) {
        const sameWaitingEpisode =
          waitingForHostEpisode.seasonNumber === command.state.seasonNumber &&
          waitingForHostEpisode.episodeNumber === command.state.episodeNumber;

        if (sameWaitingEpisode && command.type !== "episode") {
          return;
        }

        waitingForHostEpisodeRef.current = null;
      }

      if (command.state.isPlaying && !watchPartyPlaybackUnlocked) {
        setPendingWatchPartyCommand(command);
        return;
      }

      const syncTranslation = watchPartyTranslationSyncActiveRef.current;
      if (command.type === "state-sync" || command.type === "translation") {
        applyWatchPartySync(command.state, { syncTranslation });
        return;
      }
      applyWatchPartyState(command.state, command.state.isPlaying ? "play" : "pause", {
        syncTranslation,
      });
    },
    [applyWatchPartyState, applyWatchPartySync, watchPartyPlaybackUnlocked],
  );
  const watchParty = useWatchParty({
    user,
    shikimoriId,
    getPlaybackState: getWatchPartyState,
    onCommand: handleWatchPartyCommand,
  });
  const [watchPartyInviteCopied, setWatchPartyInviteCopied] = useState(false);
  const [watchPartyKeyCopied, setWatchPartyKeyCopied] = useState(false);
  const [watchPartyJoinKey, setWatchPartyJoinKey] = useState("");
  const watchPartyTranslationSyncActive =
    watchParty.syncTranslations && watchPartyTranslationSyncEnabled;
  useEffect(() => {
    watchPartyTranslationSyncActiveRef.current = watchPartyTranslationSyncActive;
  }, [watchPartyTranslationSyncActive]);
  useEffect(() => {
    if (
      !watchParty.urlRoomId ||
      watchParty.status !== "idle" ||
      watchParty.settingsLoading ||
      !watchParty.settings.enabled ||
      (!user && !watchParty.settings.allowGuests) ||
      watchParty.isConnected ||
      !ready ||
      !selected?.kodikId
    ) {
      return;
    }
    watchParty.joinRoom(watchParty.urlRoomId);
  }, [
    ready,
    selected?.kodikId,
    user,
    watchParty.isConnected,
    watchParty.joinRoom,
    watchParty.settings.allowGuests,
    watchParty.settings.enabled,
    watchParty.settingsLoading,
    watchParty.status,
    watchParty.urlRoomId,
  ]);

  useEffect(() => {
    if (!watchPartyInviteCopied) return;
    const timer = window.setTimeout(() => setWatchPartyInviteCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [watchPartyInviteCopied]);

  useEffect(() => {
    if (!watchPartyKeyCopied) return;
    const timer = window.setTimeout(() => setWatchPartyKeyCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [watchPartyKeyCopied]);

  const handleWatchPartyJoinByKey = useCallback(() => {
    const roomKey = watchPartyJoinKey.trim();
    if (!roomKey) return;
    watchParty.joinRoom(roomKey);
  }, [watchParty, watchPartyJoinKey]);

  useEffect(() => {
    if (!watchParty.isConnected) return;

    watchParty.sendPresence();
    const intervalMs =
      watchParty.isMaster && playback.isPlaying
        ? WATCH_PARTY_ACTIVE_PRESENCE_MS
        : WATCH_PARTY_IDLE_PRESENCE_MS;
    const intervalId = window.setInterval(() => {
      watchParty.sendPresence();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [
    playback.isPlaying,
    playerEpisode.episodeNumber,
    playerEpisode.seasonNumber,
    selectedId,
    watchParty.isConnected,
    watchParty.isMaster,
    watchParty.sendPresence,
  ]);

  const applyPendingWatchPartyStart = useCallback(() => {
    const command = pendingWatchPartyCommand;
    if (!command) return;
    setWatchPartyPlaybackUnlocked(true);
    setPendingWatchPartyCommand(null);

    const syncTranslation = watchPartyTranslationSyncActiveRef.current;
    if (command.type === "state-sync" || command.type === "translation") {
      applyWatchPartySync(command.state, { syncTranslation });
    } else {
      applyWatchPartyState(command.state, command.state.isPlaying ? "play" : "pause", {
        syncTranslation,
      });
    }

    window.setTimeout(() => {
      watchParty.requestSync();
    }, 150);
  }, [
    applyWatchPartyState,
    applyWatchPartySync,
    pendingWatchPartyCommand,
    watchParty,
  ]);

  const hasExplicitAutoSkipTranslations =
    Object.keys(settings.autoSkipTranslationIds).length > 0;
  const isTranslationAutoSkipEnabled = useCallback(
    (translationId: number) =>
      settings.autoSkipTranslationIds[String(translationId)] === true ||
      (!hasExplicitAutoSkipTranslations && settings.autoSkipOpeningsEndings),
    [
      hasExplicitAutoSkipTranslations,
      settings.autoSkipOpeningsEndings,
      settings.autoSkipTranslationIds,
    ],
  );
  const selectedAutoSkipEnabled = selected
    ? isTranslationAutoSkipEnabled(selected.translationId)
    : false;
  const selectedAutoSkipRuntimeEnabled =
    selectedAutoSkipEnabled && (!watchParty.isConnected || watchParty.isMaster);
  const setSelectedAutoSkip = useCallback(
    (enabled: boolean) => {
      if (!selected) return;

      const next = { ...settings.autoSkipTranslationIds };
      if (!hasExplicitAutoSkipTranslations && settings.autoSkipOpeningsEndings) {
        for (const tr of playable) {
          next[String(tr.translationId)] = true;
        }
      }
      const key = String(selected.translationId);

      if (enabled) {
        next[key] = true;
      } else {
        delete next[key];
      }

      updateSettings({
        autoSkipOpeningsEndings: false,
        autoSkipTranslationIds: next,
      });
    },
    [
      hasExplicitAutoSkipTranslations,
      playable,
      selected,
      settings.autoSkipOpeningsEndings,
      settings.autoSkipTranslationIds,
      updateSettings,
    ],
  );
  const selectedIntroOffsetSeconds = selected
    ? resolveTranslationIntroOffsetSec(
        selected.translationTitle,
        settings.translationIntroOffsets,
        forcedIntroOffsets,
      )
    : 0;
  const displaySkipTimes = useMemo<DisplaySkipTimeDto[]>(
    () =>
      skipTimes.map((skipTime) => ({
        ...skipTime,
        originalStartTime: skipTime.startTime,
        originalEndTime: skipTime.endTime,
        startTime: skipTime.startTime + selectedIntroOffsetSeconds,
        endTime: skipTime.endTime + selectedIntroOffsetSeconds,
      })),
    [selectedIntroOffsetSeconds, skipTimes],
  );
  const actionableSkipTimes = useMemo(
    () =>
      displaySkipTimes.filter((skipTime) =>
        isSkipTimeActionable(skipTime, skipClockSeconds),
      ),
    [displaySkipTimes, skipClockSeconds],
  );
  const autoSkipActionableTimes = useMemo(
    () => actionableSkipTimes.filter(isOpeningOrEndingSkipTime),
    [actionableSkipTimes],
  );
  const pendingAutoSkipTimes = useMemo(
    () =>
      displaySkipTimes.filter(
        (skipTime) =>
          isOpeningOrEndingSkipTime(skipTime) &&
          isSkipTimeAutoSkipPending(skipTime, skipClockSeconds),
      ),
    [displaySkipTimes, skipClockSeconds],
  );
  const timelineSkipSegments = useMemo<KodikPlayerTimelineSegment[]>(
    () =>
      displaySkipTimes.filter(isOpeningOrEndingSkipTime).map((skipTime) => ({
        type: skipTime.skipType,
        startTime: skipTime.startTime,
        endTime: skipTime.endTime,
      })),
    [displaySkipTimes],
  );

  // Skip/auto-skip UI clock from liveProgressRef (always hot). Do not drive panel from position emits.
  useEffect(() => {
    const needsClock =
      displaySkipTimes.length > 0 ||
      pendingAutoSkip != null ||
      selectedAutoSkipRuntimeEnabled;
    if (!needsClock) return;

    const sync = () => {
      const pos = liveProgressRef.current.positionSeconds;
      setSkipClockSeconds((previous) => (Math.abs(previous - pos) < 0.2 ? previous : pos));
    };
    sync();
    const timer = window.setInterval(sync, 400);
    return () => window.clearInterval(timer);
  }, [
    displaySkipTimes.length,
    pendingAutoSkip,
    playerEpisode.episodeNumber,
    playerEpisode.seasonNumber,
    selectedAutoSkipRuntimeEnabled,
    selectedId,
  ]);

  const setUseLegacyKodikPlayer = useCallback(
    (enabled: boolean) => {
      updateSettings({ useLegacyKodikPlayer: enabled });
      if (enabled) {
        setBetaTheaterMode("normal");
        setFullscreenTranslationsOpen(false);
        setFullscreenTranslationsHovered(false);
      }
    },
    [updateSettings],
  );

  const roomSeekDisabled = seekSkipDisabled || (watchParty.isConnected && !watchParty.canSeek);
  const roomEpisodeSelectionDisabled =
    seekSkipDisabled || (watchParty.isConnected && !watchParty.canSelectEpisodes);
  const roomTranslationSelectionDisabled =
    continueLoading ||
    (watchParty.isConnected && watchPartyTranslationSyncActive && !watchParty.canSelectTranslations);

  const cycleBetaTheaterMode = useCallback(() => {
    if (isNativeFullscreen) return;

    setBetaTheaterMode((current) => {
      const next: KodikPlayerBetaTheaterMode = current === "normal" ? "height" : "normal";

      if (next !== "normal") {
        requestAnimationFrame(() => {
          betaFullscreenRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }

      setFullscreenTranslationsOpen(false);
      setFullscreenTranslationsHovered(false);

      return next;
    });
  }, [isNativeFullscreen]);

  const handlePlaybackStateChange = useCallback((state: KodikPlayerPlaybackState) => {
    isPlayingRef.current = state.isPlaying;
    durationSecondsRef.current = state.durationSeconds;

    setPlayback((previous) => {
      const initialized = playbackStateInitializedRef.current;
      const playingChanged = previous.isPlaying !== state.isPlaying;
      playbackStateInitializedRef.current = true;

      if (playingChanged && !applyingWatchPartyCommandRef.current) {
        if (suppressNextPlaybackBroadcastRef.current) {
          suppressNextPlaybackBroadcastRef.current = false;
        } else if (initialized) {
          sendWatchPartyPlaybackEventRef.current(state.isPlaying);
        }
      }

      if (playingChanged) {
        emitCompanionReaction(state.isPlaying ? "sittingPlay" : "sittingPause", { force: true });
      }

      const metaChanged =
        playingChanged ||
        previous.durationSeconds !== state.durationSeconds ||
        previous.volume !== state.volume ||
        previous.muted !== state.muted ||
        previous.mediaUnlocked !== state.mediaUnlocked ||
        previous.videoReady !== state.videoReady;

      // Position-only: do not re-render AnimeWatchPanel (timeline lives in beta viewport;
      // skip UI uses skipClockSeconds from liveProgressRef). liveProgressRef stays hot via onProgress.
      if (!metaChanged) {
        return previous;
      }

      return state;
    });
  }, []);

  useEffect(() => {
    autoSkippedIntervalsRef.current.clear();
    cancelledAutoSkipIntervalsRef.current.clear();
    previousAutoSkipPositionRef.current = 0;
    watchPartyEndGuardKeyRef.current = "";
    setPendingAutoSkip(null);
  }, [selectedId, playerEpisode.seasonNumber, playerEpisode.episodeNumber]);

  useEffect(() => {
    if (!selectedId) return;

    const previousPosition = previousAutoSkipPositionRef.current;
    const currentPosition = skipClockSeconds;
    previousAutoSkipPositionRef.current = currentPosition;

    if (currentPosition >= previousPosition - 1) return;

    for (const skipTime of displaySkipTimes) {
      if (!isOpeningOrEndingSkipTime(skipTime)) continue;
      if (currentPosition >= skipTime.endTime) continue;

      const key = skipTimeKey(selectedId, playerEpisode, skipTime);
      autoSkippedIntervalsRef.current.delete(key);
      cancelledAutoSkipIntervalsRef.current.delete(key);
    }
  }, [displaySkipTimes, skipClockSeconds, playerEpisode, selectedId]);

  useEffect(() => {
    if (
      !selectedAutoSkipRuntimeEnabled ||
      seekSkipDisabled ||
      !selectedId ||
      pendingAutoSkipTimes.length === 0
    ) {
      return;
    }

    const skipTime = pendingAutoSkipTimes[0];
    const key = skipTimeKey(selectedId, playerEpisode, skipTime);
    if (autoSkippedIntervalsRef.current.has(key)) return;
    if (cancelledAutoSkipIntervalsRef.current.has(key)) return;
    if (pendingAutoSkip?.key === key) return;

    setPendingAutoSkip({
      key,
      skipTime,
    });
  }, [
    pendingAutoSkipTimes,
    playerEpisode,
    pendingAutoSkip?.key,
    seekSkipDisabled,
    selectedId,
    selectedAutoSkipRuntimeEnabled,
  ]);

  useEffect(() => {
    if (!pendingAutoSkip) return;
    if (!selectedId || seekSkipDisabled || !selectedAutoSkipRuntimeEnabled) {
      setPendingAutoSkip(null);
      return;
    }
    if (skipClockSeconds >= pendingAutoSkip.skipTime.endTime) {
      setPendingAutoSkip(null);
      return;
    }
    if (skipClockSeconds < Math.max(0, pendingAutoSkip.skipTime.startTime - AUTO_SKIP_CANCEL_SECONDS)) {
      setPendingAutoSkip(null);
      return;
    }

    if (skipClockSeconds >= pendingAutoSkip.skipTime.startTime) {
      autoSkippedIntervalsRef.current.add(pendingAutoSkip.key);
      playerRef.current?.seekToPosition(pendingAutoSkip.skipTime.endTime);
      if (watchParty.isConnected && watchParty.isMaster && !applyingWatchPartyCommandRef.current) {
        const state = getWatchPartyState();
        watchParty.sendCommand(
          "seek",
          state
            ? {
                ...state,
                positionSeconds: pendingAutoSkip.skipTime.endTime,
                updatedAt: Date.now(),
              }
            : null,
        );
      }
      setPendingAutoSkip(null);
      return;
    }
  }, [
    getWatchPartyState,
    pendingAutoSkip,
    skipClockSeconds,
    seekSkipDisabled,
    selectedId,
    selectedAutoSkipRuntimeEnabled,
    watchParty,
  ]);

  const cancelPendingAutoSkip = useCallback(() => {
    setPendingAutoSkip((current) => {
      if (current) cancelledAutoSkipIntervalsRef.current.add(current.key);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!ready || !selectedId || roundedEpisodeLength < 300) {
      setSkipTimes([]);
      setSkipTimesInfo(null);
      setSkipTimesLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      season: String(playerEpisode.seasonNumber),
      episode: String(playerEpisode.episodeNumber),
      episodeLength: String(roundedEpisodeLength),
    });

    setSkipTimesLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/anime/${shikimoriId}/skip-times?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          if (!controller.signal.aborted) {
            setSkipTimes([]);
            setSkipTimesInfo(null);
          }
          return;
        }

        const data = (await res.json()) as SkipTimesResponse;
        if (!controller.signal.aborted) {
          setSkipTimesInfo(data.skipTimes ?? null);
          setSkipTimes(data.skipTimes?.results ?? []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSkipTimes([]);
          setSkipTimesInfo(null);
        }
      } finally {
        if (!controller.signal.aborted) setSkipTimesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [
    playerEpisode.episodeNumber,
    playerEpisode.seasonNumber,
    ready,
    roundedEpisodeLength,
    selectedId,
    shikimoriId,
  ]);

  useEffect(() => {
    if (!user?.isAdmin || !ready || !selectedId || roundedEpisodeLength < 300) {
      setAdminSkipPrefetch(null);
      setAdminSkipPrefetchLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      season: String(playerEpisode.seasonNumber),
      episode: String(playerEpisode.episodeNumber),
      episodeLength: String(roundedEpisodeLength),
      radius: "50",
      limit: "100",
    });

    setAdminSkipPrefetchLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/anime/${shikimoriId}/skip-times-prefetch?${params.toString()}`,
          {
            method: "POST",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          if (!controller.signal.aborted) setAdminSkipPrefetch(null);
          return;
        }

        const data = (await res.json()) as AdminSkipTimesPrefetchDto;
        if (!controller.signal.aborted) setAdminSkipPrefetch(data);
      } catch {
        if (!controller.signal.aborted) setAdminSkipPrefetch(null);
      } finally {
        if (!controller.signal.aborted) setAdminSkipPrefetchLoading(false);
      }
    })();

    return () => controller.abort();
  }, [
    playerEpisode.episodeNumber,
    playerEpisode.seasonNumber,
    ready,
    roundedEpisodeLength,
    selectedId,
    shikimoriId,
    user?.isAdmin,
  ]);

  const toggleBetaFullscreen = useCallback(async () => {
    const root = betaFullscreenRef.current;
    if (!root) return;

    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen();
        unlockScreenOrientation();
      } else {
        await root.requestFullscreen();
        await lockLandscapeOrientation();
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onOpenFullscreen = () => {
      const root = betaFullscreenRef.current;
      if (!root) return;
      root.scrollIntoView({ behavior: "auto", block: "center" });
      if (document.fullscreenElement === root) return;
      // Keep requestFullscreen in the same user-gesture turn (TV OK / click).
      void root
        .requestFullscreen()
        .then(() => lockLandscapeOrientation())
        .catch(() => {
          /* ignore */
        });
    };

    window.addEventListener(OPEN_PLAYER_FULLSCREEN_EVENT, onOpenFullscreen);
    return () => window.removeEventListener(OPEN_PLAYER_FULLSCREEN_EVENT, onOpenFullscreen);
  }, []);

  const handleBetaTranslationsTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      betaTranslationsTouchRef.current =
        touch && isNativeFullscreen
          ? { startX: touch.clientX, startY: touch.clientY }
          : null;
    },
    [isNativeFullscreen],
  );

  const handleBetaTranslationsTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = betaTranslationsTouchRef.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (
      Math.abs(deltaY) > MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
      Math.abs(deltaY) > Math.abs(deltaX) * 1.2
    ) {
      event.preventDefault();
    }
  }, []);

  const handleBetaTranslationsTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = betaTranslationsTouchRef.current;
    betaTranslationsTouchRef.current = null;
    const touch = event.changedTouches[0];
    if (!gesture || !touch) return;

    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    if (
      deltaY < -MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
      Math.abs(deltaY) > Math.abs(deltaX) * 1.2
    ) {
      setFullscreenTranslationsHovered(true);
      setFullscreenTranslationsOpen(true);
    } else if (
      deltaY > MOBILE_TRANSLATIONS_SWIPE_THRESHOLD_PX &&
      Math.abs(deltaY) > Math.abs(deltaX) * 1.2
    ) {
      setFullscreenTranslationsHovered(false);
      setFullscreenTranslationsOpen(false);
    }
  }, []);

  const handleBetaTranslationsWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!isNativeFullscreen) return;

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;

      event.preventDefault();
      event.stopPropagation();
      const open = delta > 0;
      setFullscreenTranslationsHovered(open);
      setFullscreenTranslationsOpen(open);
    },
    [isNativeFullscreen],
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === betaFullscreenRef.current;
      setIsNativeFullscreen(active);
      if (active) setBetaTheaterMode("normal");
      if (!active) {
        setFullscreenTranslationsOpen(false);
        setFullscreenTranslationsHovered(false);
        unlockScreenOrientation();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const stage = betaFullscreenRef.current;
    const translations = betaTranslationsRef.current;
    if (!stage || !translations) return;

    const updateTranslationsShift = () => {
      stage.style.setProperty(
        "--kodik-beta-translations-shift",
        `${translations.getBoundingClientRect().height}px`,
      );
    };

    updateTranslationsShift();

    const resizeObserver = new ResizeObserver(updateTranslationsShift);
    resizeObserver.observe(translations);
    window.addEventListener("resize", updateTranslationsShift);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTranslationsShift);
    };
  }, [playable.length, isNativeFullscreen]);

  useEffect(() => {
    const pendingSrc = pendingPlayerSrcRef.current;
    if (pendingSrc) {
      pendingPlayerSrcRef.current = null;
      setPlayerSrc(pendingSrc);
      setPlayerResetNonce((nonce) => nonce + 1);
      return;
    }
    setPlayerSrc(selectedPlayerLink ?? "");
  }, [selectedPlayerLink, selectedId]);

  useEffect(() => {
    if (!selectedId || !ready) return;

    let cancelled = false;
    const seasonNumber = playerEpisode.seasonNumber;
    const kodikId = selectedId;

    void (async () => {
      const links = await loadSeasonSeriaLinks(shikimoriId, kodikId, seasonNumber);
      if (cancelled) return;
      for (const [episodeNumber, seria] of links) {
        episodeSeriaLinksRef.current.set(
          episodeSeriaCacheKey(kodikId, seasonNumber, episodeNumber),
          seria,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shikimoriId, selectedId, playerEpisode.seasonNumber, ready]);

  const restartPlayerAtCurrentPosition = useCallback(() => {
    const resume = { ...liveProgressRef.current };
    const mode: KodikPlayerResumeMode = isPausedRef.current ? "pause" : "play";
    pendingContinueModeRef.current = mode;
    const resolvedResume: KodikPlayerResume =
      resume.positionSeconds >= 1
        ? resume
        : { ...resume, positionSeconds: Math.max(liveProgressRef.current.positionSeconds, 0) };
    pendingContinueRef.current = resolvedResume;
    lastContinueResumeRef.current = resolvedResume;
    if (mode === "pause") {
      silentContinueFlowRef.current = true;
      window.setTimeout(() => {
        silentContinueFlowRef.current = false;
      }, 5_000);
      pendingContinueRef.current = compensatePlayerReloadResume(pendingContinueRef.current);
      lastContinueResumeRef.current = pendingContinueRef.current;
      setBootResume(pendingContinueRef.current);
      setContinueLoading(false);
      setContinueTarget(null);
    } else {
      setContinueLoading(true);
      setContinueTarget({ episodeNumber: pendingContinueRef.current.episodeNumber });
    }
    const seriaLink = getCachedSeriaLink(
      selectedIdRef.current,
      resolvedResume.seasonNumber,
      resolvedResume.episodeNumber,
    );
    const baseLink = seriaLink ?? selectedPlayerLink;
    if (baseLink) {
      setPlayerSrc(withKodikPlayerCacheBust(baseLink, Date.now()));
    }
    setPlayerResetNonce((nonce) => nonce + 1);
  }, [getCachedSeriaLink, selectedPlayerLink]);

  const handlePlayerRefresh = useCallback(() => {
    if (!ready || continueLoading) return;
    restartPlayerAtCurrentPosition();
  }, [continueLoading, ready, restartPlayerAtCurrentPosition]);

  const handleEpisodeSelect = useCallback(
    (seasonNumber: number, episodeNumber: number, scopedPlayerLink?: string | null) => {
      if (
        seasonNumber === liveProgressRef.current.seasonNumber &&
        episodeNumber === liveProgressRef.current.episodeNumber
      ) {
        return;
      }
      episodeEndCandidateRef.current = null;
      const resume: KodikPlayerResume = {
        seasonNumber,
        episodeNumber,
        positionSeconds: 0,
      };
      isPausedRef.current = false;
      lastContinueResumeRef.current = resume;

      const materialLink = playableByKodikId.get(selectedIdRef.current)?.playerLink;
      if (!materialLink) return;

      const kodikId = selectedIdRef.current;
      const scopedSeria = rememberSeriaLink(kodikId, seasonNumber, episodeNumber, scopedPlayerLink);
      const cachedSeria =
        scopedSeria ?? getCachedSeriaLink(kodikId, seasonNumber, episodeNumber);

      const applySwitch = (seriaOrScoped: string | null | undefined) => {
        const currentLink = playerSrc || materialLink;
        const { src: targetLink, remount: needsPlayerRemount } = resolveKodikPlayerEpisodeSwitch({
          currentSrc: currentLink,
          materialLink,
          scopedPlayerLink: seriaOrScoped ?? scopedPlayerLink,
          currentSeasonNumber: liveProgressRef.current.seasonNumber,
          targetSeasonNumber: seasonNumber,
        });

        if (needsPlayerRemount) {
          remountToEpisodeEmbed({
            resume,
            embedLink: targetLink,
            showLoadingOverlay: true,
          });
          return;
        }

        setContinueLoading(true);
        setContinueTarget({ episodeNumber });
        playerRef.current?.seekTo(resume, "play", { uiEpisodeAlreadyTargeted: true });
      };

      if (cachedSeria || resolveContinueSeriaEmbedLink(scopedPlayerLink) || scopedPlayerLink) {
        applySwitch(cachedSeria ?? scopedPlayerLink);
        return;
      }

      setContinueLoading(true);
      setContinueTarget({ episodeNumber });
      void (async () => {
        const link = await loadEpisodePlayerLink(shikimoriId, kodikId, seasonNumber, episodeNumber);
        const seria = rememberSeriaLink(kodikId, seasonNumber, episodeNumber, link);
        applySwitch(seria);
      })();
    },
    [
      getCachedSeriaLink,
      playableByKodikId,
      playerSrc,
      rememberSeriaLink,
      remountToEpisodeEmbed,
      shikimoriId,
    ],
  );

  const handleAdjacentEpisode = useCallback(
    (delta: -1 | 1) => {
      const current = liveProgressRef.current;
      const nextEpisode = current.episodeNumber + delta;
      const translation = playableByKodikId.get(selectedIdRef.current);
      if (
        isEpisodeBeyondAvailability(
          current.seasonNumber,
          nextEpisode,
          translation,
          episodesTotal,
        )
      ) {
        return;
      }

      episodeEndCandidateRef.current = null;
      isPausedRef.current = false;
      handleEpisodeSelect(current.seasonNumber, nextEpisode);
    },
    [episodesTotal, handleEpisodeSelect, playableByKodikId],
  );

  const handlePlayerEnded = useCallback((endedProgress?: ProgressPayload | null) => {
    const current = endedProgress ?? episodeEndCandidateRef.current ?? liveProgressRef.current;
    const nextEpisode = current.episodeNumber + 1;
    const translation = playableByKodikId.get(selectedIdRef.current);

    if (
      isEpisodeBeyondAvailability(
        current.seasonNumber,
        nextEpisode,
        translation,
        episodesTotal,
      )
    ) {
      return;
    }

    episodeEndCandidateRef.current = null;
    handleEpisodeSelect(current.seasonNumber, nextEpisode);
  }, [episodesTotal, handleEpisodeSelect, playableByKodikId]);

  const makeWatchPartyState = useCallback(
    (patch: Partial<WatchPartyPlaybackState> = {}): WatchPartyPlaybackState | null => {
      const base = getWatchPartyState();
      if (!base) return null;
      return { ...base, ...patch, updatedAt: Date.now() };
    },
    [getWatchPartyState],
  );

  useEffect(() => {
    sendWatchPartyPlaybackEventRef.current = (isPlaying: boolean) => {
      if (!watchParty.isConnected || !watchParty.canPlayPause) return;
      watchParty.sendCommand(
        isPlaying ? "play" : "pause",
        makeWatchPartyState({ isPlaying }),
      );
    };

    return () => {
      sendWatchPartyPlaybackEventRef.current = () => {};
    };
  }, [makeWatchPartyState, watchParty]);

  const handleRoomPlayPause = useCallback(() => {
    if (watchParty.isConnected && !watchParty.canPlayPause) return;
    setWatchPartyPlaybackUnlocked(true);
    const nextPlaying = !isPlayingRef.current;
    suppressNextPlaybackBroadcastRef.current = true;
    playerRef.current?.togglePlay();
    if (!applyingWatchPartyCommandRef.current) {
      watchParty.sendCommand(
        nextPlaying ? "play" : "pause",
        makeWatchPartyState({ isPlaying: nextPlaying }),
      );
    }
    window.setTimeout(() => {
      suppressNextPlaybackBroadcastRef.current = false;
    }, 1_500);
  }, [makeWatchPartyState, watchParty]);

  const handleRoomSeek = useCallback(
    (seconds: number) => {
      if (watchParty.isConnected && !watchParty.canSeek) return;
      setWatchPartyPlaybackUnlocked(true);
      playerRef.current?.seekToPosition(seconds);
      if (!applyingWatchPartyCommandRef.current) {
        watchParty.sendCommand("seek", makeWatchPartyState({ positionSeconds: seconds }));
      }
    },
    [makeWatchPartyState, watchParty],
  );

  const handleRoomSeekSkip = useCallback(
    (deltaSeconds: number) => {
      if (watchParty.isConnected && !watchParty.canSeek) return;
      setWatchPartyPlaybackUnlocked(true);
      const duration = durationSecondsRef.current;
      const nextRaw = liveProgressRef.current.positionSeconds + deltaSeconds;
      const next = duration > 0 ? Math.min(duration, Math.max(0, nextRaw)) : Math.max(0, nextRaw);
      playerRef.current?.seekBy(deltaSeconds);
      if (!applyingWatchPartyCommandRef.current) {
        watchParty.sendCommand("seek", makeWatchPartyState({ positionSeconds: next }));
      }
    },
    [makeWatchPartyState, watchParty],
  );

  const handleRoomEpisodeSelect = useCallback(
    (seasonNumber: number, episodeNumber: number, scopedPlayerLink?: string | null) => {
      if (watchParty.isConnected && !watchParty.canSelectEpisodes) return;
      setWatchPartyPlaybackUnlocked(true);
      waitingForHostEpisodeRef.current = null;
      handleEpisodeSelect(seasonNumber, episodeNumber, scopedPlayerLink);
      if (!applyingWatchPartyCommandRef.current) {
        watchParty.sendCommand(
          "episode",
          makeWatchPartyState({
            seasonNumber,
            episodeNumber,
            positionSeconds: 0,
            isPlaying: true,
          }),
        );
      }
    },
    [handleEpisodeSelect, makeWatchPartyState, watchParty],
  );

  const handleRoomAdjacentEpisode = useCallback(
    (delta: -1 | 1) => {
      if (watchParty.isConnected && !watchParty.canSelectEpisodes) return;
      setWatchPartyPlaybackUnlocked(true);
      const current = liveProgressRef.current;
      const nextEpisode = current.episodeNumber + delta;
      const translation = playableByKodikId.get(selectedIdRef.current);
      if (
        isEpisodeBeyondAvailability(
          current.seasonNumber,
          nextEpisode,
          translation,
          episodesTotal,
        )
      ) {
        return;
      }
      waitingForHostEpisodeRef.current = null;
      handleAdjacentEpisode(delta);
      if (!applyingWatchPartyCommandRef.current) {
        watchParty.sendCommand(
          "episode",
          makeWatchPartyState({
            seasonNumber: current.seasonNumber,
            episodeNumber: nextEpisode,
            positionSeconds: 0,
            isPlaying: true,
          }),
        );
      }
    },
    [episodesTotal, handleAdjacentEpisode, makeWatchPartyState, playableByKodikId, watchParty],
  );

  const handleRoomTranslationSelect = useCallback(
    (kodikId: string) => {
      const shouldBroadcastTranslation = watchParty.isConnected && watchPartyTranslationSyncActive;
      if (shouldBroadcastTranslation && !watchParty.canSelectTranslations) return;
      setWatchPartyPlaybackUnlocked(true);
      handleTranslationSelect(kodikId);
      if (shouldBroadcastTranslation && !applyingWatchPartyCommandRef.current) {
        watchParty.sendCommand("translation", makeWatchPartyState({ kodikId }));
      }
    },
    [handleTranslationSelect, makeWatchPartyState, watchParty, watchPartyTranslationSyncActive],
  );

  const handleRoomPlayerEnded = useCallback((endedProgress?: ProgressPayload | null) => {
    if (!endedProgress && suppressNextEndedRef.current) {
      suppressNextEndedRef.current = false;
      if (suppressNextEndedTimeoutRef.current != null) {
        window.clearTimeout(suppressNextEndedTimeoutRef.current);
        suppressNextEndedTimeoutRef.current = null;
      }
      return;
    }
    const endProgress = endedProgress ?? episodeEndCandidateRef.current ?? liveProgressRef.current;
    if (watchParty.isConnected && !watchParty.isMaster) {
      applyingWatchPartyCommandRef.current = true;
      suppressNextPlaybackBroadcastRef.current = true;
      isPausedRef.current = true;
      waitingForHostEpisodeRef.current = {
        seasonNumber: endProgress.seasonNumber,
        episodeNumber: endProgress.episodeNumber,
      };
      playerRef.current?.pause();
      if (playback.durationSeconds > 1) {
        playerRef.current?.seekToPosition(
          Math.max(0, playback.durationSeconds - WATCH_PARTY_END_HOLD_OFFSET_SECONDS),
        );
      }
      window.setTimeout(() => {
        applyingWatchPartyCommandRef.current = false;
        suppressNextPlaybackBroadcastRef.current = false;
      }, 1_500);
      return;
    }
    const nextEpisode = endProgress.episodeNumber + 1;
    const translation = playableByKodikId.get(selectedIdRef.current);
    handlePlayerEnded(endProgress);
    if (
      isEpisodeBeyondAvailability(
        endProgress.seasonNumber,
        nextEpisode,
        translation,
        episodesTotal,
      )
    ) {
      return;
    }
    if (!applyingWatchPartyCommandRef.current) {
      watchParty.sendCommand(
        "episode",
        makeWatchPartyState({
          seasonNumber: endProgress.seasonNumber,
          episodeNumber: nextEpisode,
          positionSeconds: 0,
          isPlaying: true,
        }),
      );
    }
  }, [
    episodesTotal,
    handlePlayerEnded,
    makeWatchPartyState,
    playback.durationSeconds,
    playableByKodikId,
    watchParty,
  ]);

  useEffect(() => {
    handleWatchPartyEndGuardRef.current = (progress) => {
      if (watchParty.isConnected) {
        handleRoomPlayerEnded(progress);
        return;
      }
      handlePlayerEnded(progress);
    };

    return () => {
      handleWatchPartyEndGuardRef.current = () => {};
    };
  }, [handlePlayerEnded, handleRoomPlayerEnded, watchParty.isConnected]);

  const handleRoomSkipTime = useCallback(
    (skipTime: DisplaySkipTimeDto) => {
      handleRoomSeek(skipTime.endTime);
    },
    [handleRoomSeek],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("MediaMetadata" in window)) return;

    const mediaSession = (navigator as MediaSessionNavigator).mediaSession;
    if (!mediaSession || !selected) return;

    const episodeLabel = formatEpisodeOfTotal(playerEpisode.episodeNumber, episodesTotal ?? null);
    const seasonLabel = playerEpisode.seasonNumber > 1 ? `${playerEpisode.seasonNumber} сезон` : null;
    const artworkSrc = new URL(coverCacheUrl(shikimoriId), window.location.origin).toString();

    mediaSession.metadata = new MediaMetadata({
      title: `${animeTitle} — ${episodeLabel}`,
      artist: selected.translationTitle,
      album: seasonLabel ?? animeTitle,
      artwork: [
        { src: artworkSrc, sizes: "96x96", type: "image/png" },
        { src: artworkSrc, sizes: "128x128", type: "image/png" },
        { src: artworkSrc, sizes: "192x192", type: "image/png" },
        { src: artworkSrc, sizes: "256x256", type: "image/png" },
        { src: artworkSrc, sizes: "512x512", type: "image/png" },
      ],
    });
    mediaSession.playbackState = playback.isPlaying ? "playing" : "paused";

    mediaSession.setActionHandler("play", () => {
      if (!playback.isPlaying) handleRoomPlayPause();
    });
    mediaSession.setActionHandler("pause", () => {
      if (playback.isPlaying) handleRoomPlayPause();
    });
    mediaSession.setActionHandler(
      "previoustrack",
      previousEpisodeDisabled ? null : () => handleRoomAdjacentEpisode(-1),
    );
    mediaSession.setActionHandler(
      "nexttrack",
      nextEpisodeDisabled ? null : () => handleRoomAdjacentEpisode(1),
    );
    mediaSession.setActionHandler("seekbackward", () =>
      handleRoomSeekSkip(-PLAYER_SEEK_SKIP_SECONDS),
    );
    mediaSession.setActionHandler("seekforward", () =>
      handleRoomSeekSkip(PLAYER_SEEK_SKIP_SECONDS),
    );

    return () => {
      mediaSession.setActionHandler("play", null);
      mediaSession.setActionHandler("pause", null);
      mediaSession.setActionHandler("previoustrack", null);
      mediaSession.setActionHandler("nexttrack", null);
      mediaSession.setActionHandler("seekbackward", null);
      mediaSession.setActionHandler("seekforward", null);
    };
  }, [
    animeTitle,
    episodesTotal,
    handleRoomAdjacentEpisode,
    handleRoomPlayPause,
    handleRoomSeekSkip,
    nextEpisodeDisabled,
    playback.isPlaying,
    playerEpisode.episodeNumber,
    playerEpisode.seasonNumber,
    previousEpisodeDisabled,
    selected,
    shikimoriId,
  ]);

  useEffect(() => {
    setAndroidKeepScreenOn(playback.isPlaying);
    return () => setAndroidKeepScreenOn(false);
  }, [playback.isPlaying]);

  // Hint for site chrome: drop CSS blur / parallax / companion RAF while video decodes.
  // Chrome often freezes Kodik iframe video (audio continues) under GPU pressure.
  useEffect(() => {
    const root = document.documentElement;
    if (playback.isPlaying) {
      root.setAttribute("data-player-playing", "true");
    } else {
      root.removeAttribute("data-player-playing");
    }
    return () => root.removeAttribute("data-player-playing");
  }, [playback.isPlaying]);

  const renderPlayerRefreshButton = () => (
    <button
      type="button"
      onClick={handlePlayerRefresh}
      disabled={seekSkipDisabled}
      aria-busy={continueLoading}
      aria-label="Перезапустить плеер с текущей позиции"
      title="Перезапустить плеер с текущей позиции"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50"
    >
      <IconPlayerRefresh spinning={continueLoading} />
    </button>
  );

  const renderAutoSkipControl = () => (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim">
      <input
        type="checkbox"
        checked={selectedAutoSkipEnabled}
        onChange={(event) => setSelectedAutoSkip(event.target.checked)}
        className="h-4 w-4 rounded border-border accent-accent"
      />
      Автопропуск OP/ED
    </label>
  );

  const renderTranslationButtons = () => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-stretch gap-2">
      {playable.map((tr) => {
        const active = tr.kodikId === selected.kodikId;
        const progress = formatEpisodeProgress(tr.lastSeason, tr.lastEpisode);
        const seasonsBadge = formatKodikSeasonsBadge(tr.availableSeasons);
        const studioId = resolveTranslationStudioId(tr.translationTitle);
        const autoSkipEnabled = isTranslationAutoSkipEnabled(tr.translationId);
        return (
          <li key={tr.kodikId} className="flex min-w-0">
            <button
              type="button"
              onClick={() => handleRoomTranslationSelect(tr.kodikId)}
              disabled={roomTranslationSelectionDisabled}
              aria-pressed={active}
              data-studio={studioId ?? undefined}
              className={[
                "translation-btn relative flex h-full w-full flex-col items-center justify-center rounded-lg border px-3 py-1.5 text-center text-xs transition disabled:cursor-wait disabled:opacity-50",
                active ? "translation-btn--active" : "",
                studioId
                  ? active
                    ? "ring-2 ring-white/75 ring-offset-1 ring-offset-card"
                    : "hover:brightness-110"
                  : active
                    ? "border-accent bg-accent/20 text-foreground ring-2 ring-white/75 ring-offset-1 ring-offset-card"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground",
              ].join(" ")}
            >
              <span className="font-medium leading-snug line-clamp-2">{tr.translationTitle}</span>
              {progress ? (
                <span className="mt-0.5 text-[10px] leading-tight opacity-80">{progress}</span>
              ) : null}
              {seasonsBadge ? (
                <span className="mt-1 rounded border border-white/20 bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white/90">
                  {seasonsBadge}
                </span>
              ) : null}
              {autoSkipEnabled ? (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded border border-emerald-300/55 bg-black/45 px-1 text-[9px] font-black leading-3 text-emerald-100 shadow-sm">
                  AP
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const renderWatchPartySyncIndicator = () =>
    watchPartySyncing ? (
      <div className="pointer-events-none absolute right-3 top-3 z-40 inline-flex items-center gap-2 rounded-md border border-white/15 bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
        <IconPlayerRefresh spinning />
        <span>Синхронизация</span>
      </div>
    ) : null;

  const renderWatchPartyStartOverlay = () =>
    pendingWatchPartyCommand ? (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-accent/35 bg-black/80 px-5 py-4 text-center text-sm text-white shadow-xl">
          <p className="font-medium">
            Нажмите один раз, чтобы браузер разрешил запуск плеера в комнате.
          </p>
          <button
            type="button"
            onClick={applyPendingWatchPartyStart}
            className="rounded-md border border-accent/55 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/25"
          >
            Запустить
          </button>
        </div>
      </div>
    ) : null;

  const renderWatchPartyPanel = () => {
    if (!betaChromeless || !ready || !selected?.playerLink) return null;
    if (watchParty.settingsLoading) return null;
    if (!watchParty.settings.enabled) return null;

    if (!watchParty.isConnected) {
      const guestsBlocked = !user && !watchParty.settings.allowGuests;
      return (
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={watchParty.createRoom}
              disabled={watchParty.status === "connecting" || guestsBlocked}
              className="rounded-md border border-accent/45 bg-accent/10 px-2.5 py-1.5 font-medium text-accent transition hover:border-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {watchParty.status === "connecting" ? "Подключение…" : "Создать комнату"}
            </button>
            <form
              className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                handleWatchPartyJoinByKey();
              }}
            >
              <input
                value={watchPartyJoinKey}
                onChange={(event) =>
                  setWatchPartyJoinKey(event.target.value.replace(/\D/g, "").slice(0, 5))
                }
                disabled={watchParty.status === "connecting" || guestsBlocked}
                placeholder="Ключ комнаты"
                inputMode="numeric"
                maxLength={5}
                pattern="[0-9]{5}"
                className="w-[7.5rem] rounded-md border border-border bg-card px-2.5 py-1.5 text-center font-mono text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Ключ комнаты"
              />
              <button
                type="submit"
                disabled={
                  watchParty.status === "connecting" || guestsBlocked || !watchPartyJoinKey.trim()
                }
                className="rounded-md border border-border bg-card px-2.5 py-1.5 font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50"
              >
                Подключиться
              </button>
            </form>
          </div>
          <span>
            {watchParty.error ??
              (guestsBlocked
                ? "Вход гостям в совместный просмотр выключен."
                : user
                  ? "Совместный просмотр."
                  : `Вы войдёте как ${watchParty.guestNickname}.`)}
          </span>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border bg-background p-3 text-xs text-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">Комната совместного просмотра</p>
            <p className="mt-0.5 text-muted">
              {watchParty.isMaster
                ? "Вы мастер комнаты"
                : watchParty.canSeek || watchParty.canSelectEpisodes || watchParty.canSelectTranslations
                  ? "Мастер выдал дополнительные права"
                  : watchParty.canPlayPause
                    ? "Мастер разрешил play/pause"
                  : "Управляет мастер комнаты"}
            </p>
          </div>
          <button
            type="button"
            onClick={watchParty.disconnect}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 font-medium text-muted transition hover:border-accent/40 hover:text-foreground"
          >
            Выйти
          </button>
        </div>

        {watchParty.inviteUrl ? (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={watchParty.roomId ?? ""}
                className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted outline-none"
                aria-label="Ключ комнаты"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  if (!watchParty.roomId) return;
                  void navigator.clipboard?.writeText(watchParty.roomId);
                  setWatchPartyKeyCopied(true);
                }}
                disabled={!watchParty.roomId}
                className="rounded-md border border-border bg-card px-2.5 py-1.5 font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50"
              >
                {watchPartyKeyCopied ? "Скопировано" : "Скопировать ключ"}
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={watchParty.inviteUrl}
                className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted outline-none"
                aria-label="Ссылка приглашения"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(watchParty.inviteUrl);
                  setWatchPartyInviteCopied(true);
                }}
                className="rounded-md border border-border bg-card px-2.5 py-1.5 font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim"
              >
                {watchPartyInviteCopied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </div>
        ) : null}

        {watchParty.isMaster ? (
          <div className="mt-3 flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={watchParty.allowParticipantControls}
                onChange={(event) =>
                  watchParty.setRoomPermissions({
                    allowParticipantControls: event.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Разрешить участникам ставить и снимать с паузы
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={watchParty.allowParticipantSeeking}
                onChange={(event) =>
                  watchParty.setRoomPermissions({
                    allowParticipantSeeking: event.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Разрешить участникам перемотку
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={watchParty.allowParticipantEpisodeSelection}
                onChange={(event) =>
                  watchParty.setRoomPermissions({
                    allowParticipantEpisodeSelection: event.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Разрешить участникам выбор серий
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={watchParty.allowParticipantTranslationSelection}
                onChange={(event) =>
                  watchParty.setRoomPermissions({
                    allowParticipantTranslationSelection: event.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Разрешить участникам смену озвучек
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={watchParty.syncTranslations}
                onChange={(event) =>
                  watchParty.setRoomPermissions({
                    syncTranslations: event.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              Синхронизировать выбор озвучек
            </label>
          </div>
        ) : null}

        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={watchPartyTranslationSyncEnabled && watchParty.syncTranslations}
            disabled={!watchParty.syncTranslations}
            onChange={(event) => setWatchPartyTranslationSyncEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          Синхронизировать выбор озвучек у меня
        </label>

        <ul className="mt-3 flex flex-wrap gap-2">
          {watchParty.participants.map((participant) => {
            const participantTranslation = participant.state
              ? playableByKodikId.get(participant.state.kodikId)
              : null;
            const participantEpisode = participant.state
              ? `S${participant.state.seasonNumber} · E${participant.state.episodeNumber}`
              : null;
            const participantPosition = participant.state
              ? formatWatchPosition(participant.state.positionSeconds)
              : null;
            const participantPlayback = participant.state
              ? participant.state.isPlaying
                ? "play"
                : "pause"
              : null;
            const participantWatchLabel = [
              participantTranslation?.translationTitle ?? null,
              participantEpisode,
              participantPosition,
              participantPlayback,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li
                key={participant.id}
                className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border bg-card px-2 py-1 text-muted"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{participant.nickname}</span>
                  {participant.isMaster ? (
                    <span className="shrink-0 rounded border border-amber-300/40 bg-amber-400/10 px-1 text-[10px] font-semibold uppercase text-amber-200">
                      мастер
                    </span>
                  ) : null}
                </span>
                {participantWatchLabel ? (
                  <span className="max-w-[15rem] truncate text-[11px] text-muted">
                    {participantWatchLabel}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
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

  const continueTranslation = continueProgress
    ? playable.find((tr) => tr.kodikId === continueProgress.kodikId)
    : null;
  const initialResume = bootResume;

  const showContinue =
    user &&
    continueProgress &&
    !playback.isPlaying &&
    continueProgress.positionSeconds >= MIN_SAVE_POSITION_SECONDS &&
    playable.some((tr) => tr.kodikId === continueProgress.kodikId);
  const pendingAutoSkipRemainingSeconds = pendingAutoSkip
    ? Math.max(0, Math.ceil(pendingAutoSkip.skipTime.startTime - skipClockSeconds))
    : 0;

  const betaContinueAction =
    showContinue && continueProgress ? (
      <button
        type="button"
        data-tv-focus
        data-tv-player-primary
        onClick={handleContinue}
        disabled={continueLoading}
        aria-busy={continueLoading}
        className={[
          "inline-flex max-w-full items-center gap-2 rounded-[0.75rem] border border-white/[0.12] bg-black/50 px-3 py-2 text-sm font-medium text-white/90 backdrop-blur-[12px] transition",
          continueLoading
            ? "cursor-wait opacity-80"
            : "hover:border-white/20 hover:bg-black/60 active:scale-[0.98]",
        ].join(" ")}
      >
        {continueLoading ? (
          <span
            aria-hidden
            className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : null}
        <span className="shrink-0">{continueLoading ? "Переход…" : "Продолжить"}</span>
        <span className="min-w-0 truncate text-xs font-normal text-white/70">
          {continueTranslation?.translationTitle
            ? `${continueTranslation.translationTitle} · `
            : ""}
          {formatEpisodeOfTotal(continueProgress.episodeNumber, episodesTotal ?? null)} ·{" "}
          {formatWatchPosition(continueProgress.positionSeconds)}
        </span>
      </button>
    ) : null;

  const betaPrimarySkipAction = pendingAutoSkip ? (
    <button
      type="button"
      onClick={cancelPendingAutoSkip}
      className={[
        "inline-flex max-w-full items-center gap-2 rounded-md border border-amber-300/50",
        "bg-amber-500/25 px-[clamp(0.55rem,0.46vw,0.85rem)] py-[clamp(0.28rem,0.24vw,0.45rem)]",
        "text-[clamp(11px,0.58vw,15px)] font-semibold text-amber-100 backdrop-blur-sm transition",
        "hover:border-amber-200 hover:bg-amber-500/35 active:scale-[0.98]",
      ].join(" ")}
    >
      <span className="truncate">Отменить</span>
      <span className="shrink-0 font-normal text-amber-100/85">
        автопропуск через {pendingAutoSkipRemainingSeconds}…
      </span>
    </button>
  ) : actionableSkipTimes[0] ? (
    <button
      type="button"
      onClick={() => handleRoomSkipTime(actionableSkipTimes[0])}
      disabled={roomSeekDisabled}
      className={[
        "inline-flex max-w-full items-center gap-2 rounded-md border border-emerald-300/45",
        "bg-emerald-500/20 px-[clamp(0.55rem,0.46vw,0.85rem)] py-[clamp(0.28rem,0.24vw,0.45rem)]",
        "text-[clamp(11px,0.58vw,15px)] font-semibold text-emerald-100 backdrop-blur-sm transition",
        "hover:border-emerald-200 hover:bg-emerald-500/30 active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-50",
      ].join(" ")}
    >
      <span className="truncate">{skipTimeLabel(actionableSkipTimes[0].skipType)}</span>
      <span className="shrink-0 font-normal text-emerald-100/80">
        {formatWatchPosition(actionableSkipTimes[0].endTime)}
      </span>
    </button>
  ) : null;

  const betaSkipAction = betaPrimarySkipAction;

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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim">
                <input
                  type="checkbox"
                  checked={settings.useLegacyKodikPlayer}
                  onChange={(event) => setUseLegacyKodikPlayer(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                <span
                  title="Оригинальный legacy-плеер Kodik. Некоторые функции сайта могут не работать в нём."
                  className="inline-flex h-5 items-center justify-center rounded-md border border-amber-300/35 bg-amber-400/10 px-1.5 text-xs font-black leading-none text-amber-200"
                >
                  Kodik
                </span>
              </label>
              {settings.useLegacyKodikPlayer ? (
                <span className="text-xs text-amber-200/90">
                  Legacy: часть функций TA недоступна
                </span>
              ) : null}
              {user?.isAdmin && ready && selected?.playerLink ? (
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => setSkipTimesPopupPinned(true)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
                      skipTimesInfo?.found && skipTimesInfo.results.length > 0
                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-300 hover:bg-emerald-500/15"
                        : skipTimesLoading || roundedEpisodeLength < 300
                          ? "border-amber-400/40 bg-amber-500/10 text-amber-300 hover:border-amber-300 hover:bg-amber-500/15"
                          : "border-border bg-background text-muted hover:border-accent/40 hover:bg-surface-dim",
                    ].join(" ")}
                    aria-label="Диагностика AniSkip"
                  >
                    <IconSkipTimesFound />
                    <span>
                      {skipTimesLoading || roundedEpisodeLength < 300
                        ? "…"
                        : skipTimesInfo?.results.length ?? 0}
                    </span>
                  </button>
                  <div
                    className={[
                      "absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-3 text-xs text-foreground shadow-xl shadow-black/35",
                      skipTimesPopupPinned
                        ? "block"
                        : "hidden group-focus-within:block group-hover:block",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {skipTimesInfo?.found
                            ? "AniSkip тайминги найдены"
                            : skipTimesLoading
                              ? "AniSkip ищет тайминги"
                              : roundedEpisodeLength < 300
                                ? "AniSkip ждёт длительность"
                                : "AniSkip тайминги не найдены"}
                        </p>
                        <p className="mt-0.5 text-muted">
                          {skipTimesInfo
                            ? `${skipTimeSourceLabel(skipTimesInfo.source)} · MAL ${skipTimesInfo.malId ?? "—"}`
                            : `S${playerEpisode.seasonNumber} · E${playerEpisode.episodeNumber}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] uppercase text-muted">
                          admin
                        </span>
                        {skipTimesPopupPinned ? (
                          <button
                            type="button"
                            onClick={() => setSkipTimesPopupPinned(false)}
                            aria-label="Закрыть окно AniSkip"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-sm leading-none text-muted transition hover:border-accent/40 hover:text-foreground"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted">
                      <dt>Серия</dt>
                      <dd className="text-right text-foreground">
                        S{skipTimesInfo?.seasonNumber ?? playerEpisode.seasonNumber} · E
                        {skipTimesInfo?.episodeNumber ?? playerEpisode.episodeNumber}
                      </dd>
                      <dt>Длительность</dt>
                      <dd className="text-right text-foreground">
                        {roundedEpisodeLength >= 300
                          ? formatWatchPosition(skipTimesInfo?.episodeLength ?? roundedEpisodeLength)
                          : "ожидание"}
                      </dd>
                      <dt>Смещение озвучки</dt>
                      <dd className="text-right text-foreground">
                        {selectedIntroOffsetSeconds > 0
                          ? `+${formatWatchPosition(selectedIntroOffsetSeconds)}`
                          : "нет"}
                      </dd>
                    </dl>
                    {skipTimesInfo?.found && skipTimesInfo.results.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {displaySkipTimes.map((skipTime) => (
                        <div
                          key={`${skipTime.skipType}:${skipTime.startTime}:${skipTime.endTime}`}
                          className="flex items-center justify-between gap-3 text-muted"
                        >
                          <span className="font-medium text-foreground">
                            {skipTimeTypeLabel(skipTime.skipType)}
                          </span>
                          <span>
                            {formatWatchPosition(skipTime.startTime)} →{" "}
                            {formatWatchPosition(skipTime.endTime)}
                          </span>
                        </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 border-t border-border pt-2 text-muted">
                        {roundedEpisodeLength < 300
                          ? "Kodik ещё не прислал длительность видео, запрос к AniSkip не запущен."
                          : "Для текущей серии и длительности интервалов в AniSkip нет."}
                      </p>
                    )}
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="font-medium text-foreground">
                        Прогрев тайтла:{" "}
                        {adminSkipPrefetchLoading
                          ? "идёт"
                          : adminSkipPrefetch
                            ? `${adminSkipPrefetch.found}/${adminSkipPrefetch.checked}`
                            : "ожидание"}
                      </p>
                      {adminSkipPrefetch?.episodes.length ? (
                        <div className="mt-1 max-h-28 space-y-1 overflow-auto pr-1 text-muted">
                          {adminSkipPrefetch.episodes.slice(0, 20).map((episode) => (
                            <div
                              key={`${episode.seasonNumber}:${episode.episodeNumber}`}
                              className="flex items-center justify-between gap-3"
                            >
                              <span>
                                S{episode.seasonNumber} · E{episode.episodeNumber}
                              </span>
                              <span>{episode.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {adminSkipPrefetch?.failed ? (
                        <p className="mt-1 text-amber-300">
                          Ошибок при прогреве: {adminSkipPrefetch.failed}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {renderWatchPartyPanel()}
        {!ready ? (
          <div className="aspect-video animate-pulse rounded-lg bg-surface-dim" />
        ) : selected?.playerLink ? (
          betaChromeless ? (
            <div
              ref={betaFullscreenRef}
              className={[
                "kodik-player-beta-stage overflow-hidden rounded-lg border border-border bg-black",
                fullscreenTranslationsOpen ? "kodik-player-beta-stage--translations-open" : "",
                betaTheaterMode === "height" ? "kodik-player-beta-stage--height-expanded" : "",
              ].join(" ")}
            >
              <div ref={playerExpandedHostRef} className="kodik-player-beta-player-host relative min-w-0">
                {renderWatchPartySyncIndicator()}
                {renderWatchPartyStartOverlay()}
                <KodikPlayerBetaViewport
                  playerRef={playerRef}
                  playerKey={`${selected.kodikId}-${playerResetNonce}-beta-${playerSrc}`}
                  src={playerSrc}
                  title={`${animeTitle} — ${selected.translationTitle}`}
                  sizeMode={isNativeFullscreen || betaTheaterExpanded ? "viewport" : "default"}
                  initialResume={initialResume}
                  shikimoriId={shikimoriId}
                  kodikId={selected.kodikId}
                  seasonNumber={playerEpisode.seasonNumber}
                  currentEpisode={playerEpisode.episodeNumber}
                  playback={playback}
                  timelineSegments={timelineSkipSegments}
                  fullscreenActive={isNativeFullscreen}
                  theaterMode={isNativeFullscreen ? "normal" : betaTheaterMode}
                  seekSkipLabelSeconds={PLAYER_SEEK_SKIP_LABEL_SECONDS}
                  controlsDisabled={seekSkipDisabled}
                  keepUiVisible={betaTranslationsHoverEnabled && fullscreenTranslationsHovered}
                  continueAction={betaContinueAction}
                  skipAction={betaSkipAction}
                  continueOverlay={
                    continueLoading ? (
                      <PlayerLoadingOverlay
                        episodeNumber={continueTarget?.episodeNumber}
                        fallbackEpisodeNumber={playerEpisode.episodeNumber}
                      />
                    ) : null
                  }
                  onReady={handlePlayerReady}
                  onContinueStateChange={handleContinueStateChange}
                  onProgress={trackProgress}
                  onPause={handlePause}
                  onTranslationChange={handlePlayerTranslationChange}
                  onPlaybackStateChange={handlePlaybackStateChange}
                  onEpisodeSelect={handleRoomEpisodeSelect}
                  onPlayPause={handleRoomPlayPause}
                  onPreviousEpisode={() => handleRoomAdjacentEpisode(-1)}
                  onNextEpisode={() => handleRoomAdjacentEpisode(1)}
                  previousEpisodeDisabled={previousEpisodeDisabled || roomEpisodeSelectionDisabled}
                  nextEpisodeDisabled={nextEpisodeDisabled || roomEpisodeSelectionDisabled}
                  onSeek={handleRoomSeek}
                  onSeekSkip={handleRoomSeekSkip}
                  onVolumeChange={(volume) => {
                    playerRef.current?.setVolume(volume);
                    if (volume > 0 && playback.muted) playerRef.current?.unmute();
                  }}
                  onMuteToggle={() => {
                    if (playback.muted) playerRef.current?.unmute();
                    else playerRef.current?.mute();
                  }}
                  onTheaterToggle={cycleBetaTheaterMode}
                  onFullscreenToggle={() => void toggleBetaFullscreen()}
                  onFullscreenTranslationsIntent={setFullscreenTranslationsOpen}
                  fullscreenTranslationsOpen={fullscreenTranslationsOpen}
                  onEnded={handleRoomPlayerEnded}
                />
              </div>
              <div
                ref={betaTranslationsRef}
                onMouseEnter={() => {
                  if (!betaTranslationsHoverEnabled) return;
                  setFullscreenTranslationsHovered(true);
                  setFullscreenTranslationsOpen(true);
                }}
                onMouseLeave={() => setFullscreenTranslationsHovered(false)}
                onTouchStart={handleBetaTranslationsTouchStart}
                onTouchMove={handleBetaTranslationsTouchMove}
                onTouchEnd={handleBetaTranslationsTouchEnd}
                onTouchCancel={() => {
                  betaTranslationsTouchRef.current = null;
                }}
                onWheel={handleBetaTranslationsWheel}
                className="kodik-player-beta-translations border-t border-border bg-card p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
                    {renderAutoSkipControl()}
                  </div>
                  {renderPlayerRefreshButton()}
                </div>
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
            {renderWatchPartySyncIndicator()}
            {renderWatchPartyStartOverlay()}
            <KodikPlayerBetaEpisodeStrip
              shikimoriId={shikimoriId}
              kodikId={selected.kodikId}
              seasonNumber={playerEpisode.seasonNumber}
              currentEpisode={playerEpisode.episodeNumber}
              disabled={roomEpisodeSelectionDisabled}
              onSelect={handleRoomEpisodeSelect}
            />
            {continueLoading ? (
              <PlayerLoadingOverlay
                episodeNumber={continueTarget?.episodeNumber}
                fallbackEpisodeNumber={playerEpisode.episodeNumber}
              />
            ) : null}
            <KodikPlayer
              ref={playerRef}
              key={`${selected.kodikId}-${playerResetNonce}-std`}
              src={playerSrc}
              title={`${animeTitle} — ${selected.translationTitle}`}
              sizeMode={playerExpanded ? "viewport" : "default"}
              initialResume={initialResume}
              activeEpisode={playerEpisode}
              onReady={handlePlayerReady}
              onContinueStateChange={handleContinueStateChange}
              onProgress={trackProgress}
              onPause={handlePause}
              onTranslationChange={handlePlayerTranslationChange}
              onPlaybackStateChange={handlePlaybackStateChange}
              onEnded={handleRoomPlayerEnded}
            />
          </div>
          )
        ) : null}

        {ready && selected?.playerLink && !betaChromeless ? (
          <div className="flex justify-stretch gap-2 sm:justify-end">
            {pendingAutoSkip ? (
              <button
                type="button"
                onClick={cancelPendingAutoSkip}
                className="flex-1 rounded-md border border-amber-400/45 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-200 transition hover:border-amber-300 hover:bg-amber-500/20 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs"
              >
                Отменить: автопропуск через {pendingAutoSkipRemainingSeconds}…
              </button>
            ) : null}
            {actionableSkipTimes.map((skipTime) => (
              <button
                key={`${skipTime.skipType}:${skipTime.startTime}:${skipTime.endTime}`}
                type="button"
                onClick={() => handleRoomSkipTime(skipTime)}
                disabled={roomSeekDisabled}
                className="flex-1 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:border-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs"
              >
                {skipTimeLabel(skipTime.skipType)}
              </button>
            ))}
            {skipTimesLoading ? (
              <span className="hidden items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted sm:inline-flex">
                Поиск OP/ED…
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => handleRoomSeekSkip(-PLAYER_SEEK_SKIP_SECONDS)}
              disabled={roomSeekDisabled}
              aria-label={`Назад ${PLAYER_SEEK_SKIP_LABEL_SECONDS} секунд`}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-surface-dim disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs"
            >
              −{PLAYER_SEEK_SKIP_LABEL_SECONDS} сек
            </button>
            <button
              type="button"
              onClick={() => handleRoomSeekSkip(PLAYER_SEEK_SKIP_SECONDS)}
              disabled={roomSeekDisabled}
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
            {renderAutoSkipControl()}
          </div>
          {renderPlayerRefreshButton()}
        </div>
        {renderTranslationButtons()}
      </div>
      ) : null}

    </section>
  );
}
