"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { CvhPlayerFrame } from "@/components/anime/CvhPlayerFrame";
import {
  getCvhPub,
  listCvhEpisodesForVoice,
  listCvhVoices,
  matchCvhVoiceStudio,
  pickCvhEpisode,
  resolveCvhPlaylistForAnime,
  type CvhAggregator,
  type CvhVoiceOption,
} from "@/lib/cvh-player";
import { reportAnimePlay } from "@/lib/analytics/client-report";
import { resolveTranslationStudioId } from "@/lib/translation-colors";
import type {
  CvhPlayerEpisodeChange,
  CvhPlayerProgressPayload,
} from "@/components/anime/CvhVideoPlayerEmbed";

type CvhEpisode = { season: number; episode: number };

type Props = {
  shikimoriId: number;
  malId: number | null;
  animeTitle: string;
  /** Current Kodik/TA translation title — pick matching CVH voice when possible */
  preferredVoiceTitle?: string | null;
  preferredSeason?: number | null;
  preferredEpisode?: number | null;
  onProgress?: (payload: CvhPlayerProgressPayload) => void;
  onPause?: (payload: CvhPlayerProgressPayload) => void;
  /** When CVH voice is chosen, parent can sync Kodik translation / history */
  onVoiceStudioChange?: (studio: string) => void;
};

function CvhEpisodeStrip({
  episodes,
  current,
  onSelect,
}: {
  episodes: CvhEpisode[];
  current: CvhEpisode | null;
  onSelect: (item: CvhEpisode) => void;
}) {
  const seasons = useMemo(() => {
    const unique = [...new Set(episodes.map((item) => item.season))];
    unique.sort((a, b) => a - b);
    return unique;
  }, [episodes]);

  const [selectedSeason, setSelectedSeason] = useState(
    () => current?.season ?? seasons[0] ?? 1,
  );
  const [scrollState, setScrollState] = useState({ left: 0, max: 0 });
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current?.season != null) {
      setSelectedSeason(current.season);
      return;
    }
    if (seasons.length && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]!);
    }
  }, [current?.season, seasons, selectedSeason]);

  const seasonEpisodes = useMemo(
    () =>
      episodes
        .filter((item) => item.season === selectedSeason)
        .slice()
        .sort((a, b) => a.episode - b.episode),
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

  if (episodes.length <= 1) return null;

  const canScrollLeft = scrollState.left > 1;
  const canScrollRight = scrollState.left < scrollState.max - 1;
  const showSeasonSelect = seasons.length > 1;

  return (
    <div className="kodik-player-beta-episodes-shell relative" onWheel={handleWheel}>
      {canScrollLeft ? (
        <div className="kodik-player-beta-episodes-edge kodik-player-beta-episodes-edge--left">
          <button
            type="button"
            aria-label="Прокрутить серии влево"
            className="kodik-player-beta-episodes-scroll-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => scrollByStep(-1)}
          >
            ‹
          </button>
        </div>
      ) : null}
      {canScrollRight ? (
        <div className="kodik-player-beta-episodes-edge kodik-player-beta-episodes-edge--right">
          <button
            type="button"
            aria-label="Прокрутить серии вправо"
            className="kodik-player-beta-episodes-scroll-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => scrollByStep(1)}
          >
            ›
          </button>
        </div>
      ) : null}
      <div
        ref={stripRef}
        className="kodik-player-beta-episodes flex select-none gap-1.5 overflow-x-auto border-b border-border bg-[#0f0f0f] p-2"
        onScroll={syncScrollState}
      >
        {showSeasonSelect ? (
          <select
            value={selectedSeason}
            aria-label="Сезон"
            onChange={(event) => {
              const nextSeason = Number(event.target.value);
              setSelectedSeason(nextSeason);
              const firstInSeason = episodes.find((item) => item.season === nextSeason);
              if (firstInSeason) onSelect(firstInSeason);
            }}
            className="h-9 shrink-0 rounded-md border border-white/15 bg-black/65 px-2 text-xs font-semibold text-white/90 outline-none transition hover:border-accent/50 focus:border-accent"
          >
            {seasons.map((season) => (
              <option key={season} value={season}>
                {season === 0 ? "Спешлы" : `${season} сезон`}
              </option>
            ))}
          </select>
        ) : null}
        {seasonEpisodes.map((item) => {
          const active =
            current?.season === item.season && current?.episode === item.episode;
          return (
            <button
              key={`${item.season}:${item.episode}`}
              type="button"
              aria-current={active ? "true" : undefined}
              aria-label={
                item.season > 1
                  ? `Сезон ${item.season}, серия ${item.episode}`
                  : `Серия ${item.episode}`
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              className={[
                "inline-flex aspect-square h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition",
                active
                  ? "border-accent bg-accent text-white"
                  : "border-white/15 bg-white/5 text-white/85 hover:border-accent/50 hover:bg-white/10",
              ].join(" ")}
            >
              {item.episode}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CvhWatchSection({
  shikimoriId,
  malId,
  animeTitle,
  preferredVoiceTitle = null,
  preferredSeason = null,
  preferredEpisode = null,
  onProgress,
  onPause,
  onVoiceStudioChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titleId, setTitleId] = useState(String(shikimoriId));
  const [aggr, setAggr] = useState<CvhAggregator>("shikimori");
  const [voices, setVoices] = useState<CvhVoiceOption[]>([]);
  const [episodesByVoice, setEpisodesByVoice] = useState<Record<string, CvhEpisode[]>>({});
  const [voice, setVoice] = useState<string | null>(null);
  const [episode, setEpisode] = useState<CvhEpisode | null>(null);
  const userTouchedRef = useRef(false);
  const playReportedRef = useRef(false);
  const onVoiceStudioChangeRef = useRef(onVoiceStudioChange);
  onVoiceStudioChangeRef.current = onVoiceStudioChange;

  useEffect(() => {
    playReportedRef.current = false;
  }, [shikimoriId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    userTouchedRef.current = false;
    playReportedRef.current = false;
    setVoice(null);
    setEpisode(null);
    setVoices([]);
    setEpisodesByVoice({});
    setTitleId(String(shikimoriId));
    setAggr("shikimori");

    void (async () => {
      try {
        const resolved = await resolveCvhPlaylistForAnime({
          shikimoriId,
          malId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (!resolved) {
          setError("В VideoHUB нет этого тайтла.");
          setLoading(false);
          return;
        }

        const voiceList = listCvhVoices(resolved.playlist.items);
        const byVoice: Record<string, CvhEpisode[]> = {};
        for (const item of voiceList) {
          byVoice[item.studio] = listCvhEpisodesForVoice(
            resolved.playlist.items,
            item.studio,
          );
        }

        setTitleId(resolved.titleId);
        setAggr(resolved.aggr);
        setVoices(voiceList);
        setEpisodesByVoice(byVoice);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Не удалось загрузить VideoHUB.");
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [shikimoriId, malId]);

  useEffect(() => {
    if (loading || error || userTouchedRef.current) return;

    const matchedVoice =
      matchCvhVoiceStudio(preferredVoiceTitle, voices) ?? voices[0]?.studio ?? null;
    const voiceEpisodes =
      (matchedVoice && episodesByVoice[matchedVoice]) ||
      (matchedVoice ? [] : Object.values(episodesByVoice)[0]) ||
      [];
    const preferredPoint =
      preferredSeason != null &&
      preferredEpisode != null &&
      Number.isFinite(preferredSeason) &&
      Number.isFinite(preferredEpisode)
        ? {
            season: Math.trunc(preferredSeason),
            episode: Math.trunc(preferredEpisode),
          }
        : null;

    setVoice(matchedVoice);
    setEpisode(pickCvhEpisode(voiceEpisodes, preferredPoint));
  }, [
    loading,
    error,
    voices,
    episodesByVoice,
    preferredVoiceTitle,
    preferredSeason,
    preferredEpisode,
  ]);

  const episodeOptions = useMemo(() => {
    if (voice && episodesByVoice[voice]) return episodesByVoice[voice] ?? [];
    return Object.values(episodesByVoice)[0] ?? [];
  }, [episodesByVoice, voice]);

  useEffect(() => {
    if (!episodeOptions.length || !userTouchedRef.current) return;
    setEpisode((current) => {
      if (
        current &&
        episodeOptions.some(
          (item) => item.season === current.season && item.episode === current.episode,
        )
      ) {
        return current;
      }
      return pickCvhEpisode(episodeOptions, null) ?? episodeOptions[0] ?? null;
    });
  }, [episodeOptions]);

  const selectVoice = (studio: string) => {
    userTouchedRef.current = true;
    setVoice(studio);
    onVoiceStudioChangeRef.current?.(studio);
  };

  const selectEpisode = (item: CvhEpisode) => {
    userTouchedRef.current = true;
    setEpisode(item);
  };

  const handlePlayerEpisodeChange = (payload: CvhPlayerEpisodeChange) => {
    setEpisode((current) => {
      const next = {
        season: payload.seasonNumber,
        episode: payload.episodeNumber,
      };
      if (
        current != null &&
        (current.season !== next.season || current.episode !== next.episode)
      ) {
        userTouchedRef.current = true;
      }
      return current?.season === next.season && current?.episode === next.episode
        ? current
        : next;
    });
    if (!payload.voiceName?.trim()) return;
    const matched =
      matchCvhVoiceStudio(payload.voiceName, voices) ??
      voices.find((item) => item.studio === payload.voiceName)?.studio ??
      null;
    if (matched) {
      setVoice((current) => {
        if (current === matched) return current;
        onVoiceStudioChangeRef.current?.(matched);
        return matched;
      });
    }
  };

  const handleProgress = useCallback(
    (payload: CvhPlayerProgressPayload) => {
      if (!playReportedRef.current) {
        playReportedRef.current = true;
        reportAnimePlay(shikimoriId, "cvh");
      }
      onProgress?.(payload);
    },
    [onProgress, shikimoriId],
  );

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <div className="aspect-video animate-pulse bg-surface-dim" />
        <div className="border-t border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
          <p className="text-sm text-muted">{error}</p>
          <p className="mt-2 text-xs text-muted/80">Shikimori ID: {shikimoriId}</p>
          {malId ? (
            <p className="mt-1 text-xs text-muted/80">MAL ID: {malId}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      <CvhEpisodeStrip
        episodes={episodeOptions}
        current={episode}
        onSelect={selectEpisode}
      />
      <CvhPlayerFrame
        titleId={titleId}
        aggregator={aggr}
        publisherId={getCvhPub()}
        episode={episode?.episode ?? 1}
        season={episode?.season ?? 1}
        priorityVoice={voice}
        showVoiceOnly={true}
        title={`${animeTitle} — VideoHUB`}
        className="rounded-none border-0"
        onEpisodeChange={handlePlayerEpisodeChange}
        onProgress={handleProgress}
        onPause={onPause}
      />

      <div className="border-t border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Озвучка</p>
        </div>
        {voices.length === 0 ? (
          <p className="text-sm text-muted">Озвучки не найдены</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] items-stretch gap-2">
            {voices.map((item) => {
              const active = item.studio === voice;
              const studioId = resolveTranslationStudioId(item.studio);
              return (
                <li key={item.studio} className="flex min-w-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    data-studio={studioId ?? undefined}
                    onClick={() => selectVoice(item.studio)}
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
                    <span className="line-clamp-2 font-medium leading-snug">{item.studio}</span>
                    <span className="mt-0.5 text-[10px] leading-tight opacity-80">
                      {item.episodeCount} эп.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
