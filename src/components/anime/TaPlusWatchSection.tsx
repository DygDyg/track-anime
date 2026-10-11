"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  TaPlusPlayer,
  type TaPlusPlayerProgressPayload,
} from "@/components/anime/TaPlusPlayer";
import { reportAnimePlay } from "@/lib/analytics/client-report";
import type { KodikTranslationDto } from "@/lib/anime-page";
import { resolveTranslationStudioId } from "@/lib/translation-colors";

type EpisodeItem = {
  episodeNumber: number;
  seasonNumber: number;
  playerLink: string | null;
};

type StreamResponse = {
  ok?: boolean;
  error?: string;
  default?: number | null;
  qualities?: Record<string, string>;
  playerLink?: string;
};

type Props = {
  shikimoriId: number;
  animeTitle: string;
  translations: KodikTranslationDto[];
  preferredKodikId?: string | null;
  preferredSeason?: number | null;
  preferredEpisode?: number | null;
  initialPositionSeconds?: number | null;
  onProgress?: (payload: TaPlusPlayerProgressPayload) => void;
  onPause?: (payload: TaPlusPlayerProgressPayload) => void;
  onTranslationChange?: (kodikId: string) => void;
  onEpisodeChange?: (payload: { seasonNumber: number; episodeNumber: number }) => void;
};

function EpisodeStrip({
  episodes,
  current,
  onSelect,
}: {
  episodes: EpisodeItem[];
  current: EpisodeItem | null;
  onSelect: (item: EpisodeItem) => void;
}) {
  const seasons = useMemo(() => {
    const unique = [...new Set(episodes.map((item) => item.seasonNumber))];
    unique.sort((a, b) => a - b);
    return unique;
  }, [episodes]);

  const [selectedSeason, setSelectedSeason] = useState(
    () => current?.seasonNumber ?? seasons[0] ?? 1,
  );
  const [scrollState, setScrollState] = useState({ left: 0, max: 0 });
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current?.seasonNumber != null) {
      setSelectedSeason(current.seasonNumber);
      return;
    }
    if (seasons.length && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]!);
    }
  }, [current?.seasonNumber, seasons, selectedSeason]);

  const seasonEpisodes = useMemo(
    () =>
      episodes
        .filter((item) => item.seasonNumber === selectedSeason)
        .slice()
        .sort((a, b) => a.episodeNumber - b.episodeNumber),
    [episodes, selectedSeason],
  );

  const syncScrollState = useCallback(() => {
    const node = stripRef.current;
    if (!node) return;
    setScrollState({
      left: node.scrollLeft,
      max: Math.max(0, node.scrollWidth - node.clientWidth),
    });
  }, []);

  useEffect(() => {
    syncScrollState();
    const node = stripRef.current;
    if (!node) return;
    const resizeObserver = new ResizeObserver(syncScrollState);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [seasonEpisodes.length, syncScrollState]);

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const node = stripRef.current;
    if (!node || scrollState.max <= 0) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    node.scrollLeft = Math.min(scrollState.max, Math.max(0, node.scrollLeft + delta));
    syncScrollState();
  };

  const scrollByStep = (direction: -1 | 1) => {
    const node = stripRef.current;
    if (!node || scrollState.max <= 0) return;
    const step = Math.max(280, Math.round(node.clientWidth * 0.75));
    node.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (!episodes.length) return null;

  return (
    <div className="border-b border-border bg-card px-3 py-2">
      {seasons.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {seasons.map((season) => (
            <button
              key={season}
              type="button"
              aria-pressed={season === selectedSeason}
              onClick={() => setSelectedSeason(season)}
              className={[
                "rounded-md border px-2 py-1 text-xs font-medium transition",
                season === selectedSeason
                  ? "border-accent/55 bg-accent/15 text-accent"
                  : "border-border bg-background text-muted hover:text-foreground",
              ].join(" ")}
            >
              {season === 0 ? "Рекап" : `${season} сезон`}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative flex items-center gap-1">
        {scrollState.max > 4 && scrollState.left > 4 ? (
          <button
            type="button"
            aria-label="Прокрутить серии влево"
            onClick={() => scrollByStep(-1)}
            className="shrink-0 rounded border border-border bg-background px-1.5 py-1 text-xs text-muted hover:text-foreground"
          >
            ‹
          </button>
        ) : null}
        <div
          ref={stripRef}
          onScroll={syncScrollState}
          onWheel={handleWheel}
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
        >
          {seasonEpisodes.map((item) => {
            const active =
              current?.seasonNumber === item.seasonNumber &&
              current?.episodeNumber === item.episodeNumber;
            return (
              <button
                key={`${item.seasonNumber}:${item.episodeNumber}`}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(item)}
                className={[
                  "shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "border-accent/55 bg-accent/15 text-accent"
                    : "border-border bg-background text-muted hover:text-foreground",
                ].join(" ")}
              >
                {item.episodeNumber}
              </button>
            );
          })}
        </div>
        {scrollState.max > 4 && scrollState.left < scrollState.max - 4 ? (
          <button
            type="button"
            aria-label="Прокрутить серии вправо"
            onClick={() => scrollByStep(1)}
            className="shrink-0 rounded border border-border bg-background px-1.5 py-1 text-xs text-muted hover:text-foreground"
          >
            ›
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TaPlusWatchSection({
  shikimoriId,
  animeTitle,
  translations,
  preferredKodikId = null,
  preferredSeason = null,
  preferredEpisode = null,
  initialPositionSeconds = null,
  onProgress,
  onPause,
  onTranslationChange,
  onEpisodeChange,
}: Props) {
  const playable = useMemo(
    () => translations.filter((item) => item.playerLink),
    [translations],
  );
  const [kodikId, setKodikId] = useState<string | null>(
    () => preferredKodikId ?? playable[0]?.kodikId ?? null,
  );
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [episode, setEpisode] = useState<EpisodeItem | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<Record<string, string>>({});
  const [quality, setQuality] = useState<string | null>(null);
  const [seekSeconds, setSeekSeconds] = useState<number | null>(initialPositionSeconds);
  const lastPositionRef = useRef(0);
  const userTouchedEpisodeRef = useRef(false);
  const playReportedRef = useRef(false);
  const onTranslationChangeRef = useRef(onTranslationChange);
  const onEpisodeChangeRef = useRef(onEpisodeChange);
  onTranslationChangeRef.current = onTranslationChange;
  onEpisodeChangeRef.current = onEpisodeChange;

  useEffect(() => {
    playReportedRef.current = false;
  }, [shikimoriId]);

  useEffect(() => {
    if (!playable.length) {
      setKodikId(null);
      return;
    }
    if (preferredKodikId && playable.some((item) => item.kodikId === preferredKodikId)) {
      setKodikId(preferredKodikId);
      return;
    }
    setKodikId((current) =>
      current && playable.some((item) => item.kodikId === current)
        ? current
        : (playable[0]?.kodikId ?? null),
    );
  }, [playable, preferredKodikId]);

  useEffect(() => {
    if (!kodikId) {
      setEpisodes([]);
      setEpisode(null);
      setEpisodesLoading(false);
      return;
    }

    const controller = new AbortController();
    setEpisodesLoading(true);
    setError(null);
    userTouchedEpisodeRef.current = false;

    void (async () => {
      try {
        const season = preferredSeason != null && preferredSeason >= 0 ? preferredSeason : 1;
        const params = new URLSearchParams({
          kodikId,
          season: String(season),
          exactSeason: "1",
        });
        const res = await fetch(`/api/anime/${shikimoriId}/episodes?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Не удалось загрузить список серий");
        const data = (await res.json()) as {
          seasonNumber?: number;
          seasonPlayerLink?: string | null;
          episodes?: EpisodeItem[];
        };
        const list = (data.episodes ?? []).map((item) => ({
          episodeNumber: item.episodeNumber,
          seasonNumber: item.seasonNumber,
          playerLink: item.playerLink,
        }));
        if (controller.signal.aborted) return;
        setEpisodes(list);

        const preferred =
          preferredSeason != null && preferredEpisode != null
            ? list.find(
                (item) =>
                  item.seasonNumber === preferredSeason &&
                  item.episodeNumber === preferredEpisode,
              )
            : null;
        setEpisode(preferred ?? list[0] ?? null);
        setEpisodesLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setEpisodes([]);
        setEpisode(null);
        setError(err instanceof Error ? err.message : "Ошибка загрузки серий");
        setEpisodesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [kodikId, preferredEpisode, preferredSeason, shikimoriId]);

  useEffect(() => {
    if (!kodikId || !episode) {
      setQualities({});
      setQuality(null);
      setStreamLoading(false);
      return;
    }

    const controller = new AbortController();
    setStreamLoading(true);
    setError(null);
    setQualities({});
    setQuality(null);

    void (async () => {
      try {
        const params = new URLSearchParams({
          kodikId,
          season: String(episode.seasonNumber),
          episode: String(episode.episodeNumber),
        });
        const res = await fetch(`/api/anime/${shikimoriId}/taplus?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await res.json()) as StreamResponse;
        if (controller.signal.aborted) return;
        if (!res.ok || !data.qualities || Object.keys(data.qualities).length === 0) {
          throw new Error(data.error || "Нет доступных качеств");
        }
        const keys = Object.keys(data.qualities).sort((a, b) => Number(b) - Number(a));
        const preferred =
          data.default != null && data.qualities[String(data.default)]
            ? String(data.default)
            : (keys[0] ?? null);
        setQualities(data.qualities);
        setQuality(preferred);
        setStreamLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Не удалось получить поток");
        setStreamLoading(false);
      }
    })();

    return () => controller.abort();
  }, [episode, kodikId, shikimoriId]);

  useEffect(() => {
    setSeekSeconds(initialPositionSeconds);
  }, [initialPositionSeconds, kodikId, episode?.seasonNumber, episode?.episodeNumber]);

  const streamUrl = quality && qualities[quality] ? qualities[quality]! : null;
  const qualityKeys = useMemo(
    () => Object.keys(qualities).sort((a, b) => Number(b) - Number(a)),
    [qualities],
  );

  const selectTranslation = (nextKodikId: string) => {
    setKodikId(nextKodikId);
    onTranslationChangeRef.current?.(nextKodikId);
  };

  const selectEpisode = (item: EpisodeItem) => {
    userTouchedEpisodeRef.current = true;
    setEpisode(item);
    setSeekSeconds(null);
    onEpisodeChangeRef.current?.({
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
    });
  };

  const handleProgress = useCallback(
    (payload: TaPlusPlayerProgressPayload) => {
      lastPositionRef.current = payload.positionSeconds;
      if (!playReportedRef.current) {
        playReportedRef.current = true;
        reportAnimePlay(shikimoriId, "taplus");
      }
      onProgress?.(payload);
    },
    [onProgress, shikimoriId],
  );

  if (!playable.length) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted">Нет ссылки Kodik для TA Plus.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      <EpisodeStrip episodes={episodes} current={episode} onSelect={selectEpisode} />
      {streamLoading || episodesLoading ? (
        <div className="aspect-video animate-pulse bg-surface-dim" />
      ) : error ? (
        <div className="flex aspect-video items-center justify-center bg-card px-4 text-center text-sm text-muted">
          {error}
        </div>
      ) : (
        <TaPlusPlayer
          src={streamUrl}
          title={`${animeTitle} — TA Plus`}
          seasonNumber={episode?.seasonNumber ?? preferredSeason ?? 1}
          episodeNumber={episode?.episodeNumber ?? preferredEpisode ?? 1}
          initialPositionSeconds={seekSeconds}
          onProgress={handleProgress}
          onPause={onPause}
        />
      )}

      <div className="border-t border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Качество</p>
          {qualityKeys.length ? (
            <div className="flex flex-wrap gap-1.5">
              {qualityKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={key === quality}
                  onClick={() => {
                    setSeekSeconds(lastPositionRef.current > 1 ? lastPositionRef.current : null);
                    setQuality(key);
                  }}
                  className={[
                    "rounded-md border px-2 py-1 text-xs font-medium transition",
                    key === quality
                      ? "border-accent/55 bg-accent/15 text-accent"
                      : "border-border bg-background text-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {key}p
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </div>

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-stretch gap-2">
          {playable.map((item) => {
            const active = item.kodikId === kodikId;
            const studioId = resolveTranslationStudioId(item.translationTitle);
            return (
              <li key={item.kodikId} className="flex min-w-0">
                <button
                  type="button"
                  aria-pressed={active}
                  data-studio={studioId ?? undefined}
                  onClick={() => selectTranslation(item.kodikId)}
                  className={[
                    "translation-btn relative flex h-full w-full flex-col items-center justify-center rounded-lg border px-3 py-1.5 text-center text-xs transition",
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
                  <span className="line-clamp-2 font-medium leading-snug">
                    {item.translationTitle}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
