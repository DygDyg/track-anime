"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { EpisodeSeasonPicker } from "@/components/anime/EpisodeSeasonPicker";
import { useHorizontalDragScroll } from "@/hooks/useHorizontalDragScroll";

type EpisodeItem = {
  episodeNumber: number;
  seasonNumber: number;
  playerLink: string | null;
};

type SeasonItem = {
  seasonNumber: number;
  title: string | null;
};

type Props = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  currentEpisode: number;
  disabled?: boolean;
  onSelect: (seasonNumber: number, episodeNumber: number, playerLink?: string | null) => void;
  overlay?: boolean;
};

function formatSeasonLabel(season: SeasonItem): string {
  if (season.title) return season.title;
  return season.seasonNumber === 0 ? "Спешлы" : `${season.seasonNumber} сезон`;
}

export function KodikPlayerBetaEpisodeStrip({
  shikimoriId,
  kodikId,
  seasonNumber,
  currentEpisode,
  disabled = false,
  onSelect,
  overlay = false,
}: Props) {
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [seasons, setSeasons] = useState<SeasonItem[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(seasonNumber);
  const [exactSeason, setExactSeason] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scrollState, setScrollState] = useState({ left: 0, max: 0 });

  useEffect(() => {
    setSelectedSeason(seasonNumber);
    setExactSeason(false);
  }, [kodikId, seasonNumber]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const params = new URLSearchParams({
          kodikId,
          season: String(selectedSeason),
        });
        if (exactSeason) params.set("exactSeason", "1");
        const res = await fetch(`/api/anime/${shikimoriId}/episodes?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as {
          seasonNumber?: number;
          seasonPlayerLink?: string | null;
          seasons?: SeasonItem[];
          episodes?: EpisodeItem[];
        };
        if (!cancelled) {
          if (data.seasonNumber != null && data.seasonNumber !== selectedSeason) {
            setSelectedSeason(data.seasonNumber);
          }
          setSeasons(data.seasons ?? []);
          setEpisodes(
            (data.episodes ?? []).map((episode) => ({
              episodeNumber: episode.episodeNumber,
              seasonNumber: episode.seasonNumber,
              playerLink: episode.playerLink ?? data.seasonPlayerLink ?? null,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setSeasons([]);
          setEpisodes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shikimoriId, kodikId, selectedSeason, exactSeason]);

  const { ref: stripRef, dragging, dragProps } = useHorizontalDragScroll();

  const syncScrollState = useCallback(() => {
    const node = stripRef.current;
    if (!node) return;

    setScrollState({
      left: node.scrollLeft,
      max: Math.max(0, node.scrollWidth - node.clientWidth),
    });
  }, [stripRef]);

  useEffect(() => {
    syncScrollState();

    const node = stripRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver(syncScrollState);
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [episodes.length, stripRef, syncScrollState]);

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

  const shellClass = overlay
    ? "kodik-player-beta-episodes-shell relative p-2"
    : "kodik-player-beta-episodes-shell relative";
  const rowClass = overlay
    ? "kodik-player-beta-episodes-row kodik-player-beta-episodes--overlay flex items-center gap-1.5 p-2 pt-1.5"
    : "kodik-player-beta-episodes-row flex items-center gap-1.5 border-b border-border bg-[#0f0f0f] p-2";
  const stripClass = [
    "kodik-player-beta-episodes flex min-w-0 flex-1 select-none gap-1.5 overflow-x-auto",
    scrollState.max > 0 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "",
  ]
    .filter(Boolean)
    .join(" ");
  const scrollBtnClass =
    "kodik-player-beta-episodes-scroll-btn inline-flex aspect-square h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-base font-semibold leading-none text-white/85 transition hover:border-accent/50 hover:bg-white/10";
  const canScrollLeft = scrollState.left > 1;
  const canScrollRight = scrollState.left < scrollState.max - 1;
  const showSeasonSelect = seasons.length > 1;
  const seasonOptions = useMemo(
    () =>
      seasons.map((season) => ({
        value: season.seasonNumber,
        label: formatSeasonLabel(season),
      })),
    [seasons],
  );
  const handleSeasonChange = (nextSeason: number) => {
    setSelectedSeason(nextSeason);
    setExactSeason(true);
  };
  const seasonPicker = showSeasonSelect ? (
    <EpisodeSeasonPicker
      seasons={seasonOptions}
      value={selectedSeason}
      disabled={disabled}
      onChange={handleSeasonChange}
    />
  ) : null;

  useEffect(() => {
    syncScrollState();
  }, [canScrollLeft, canScrollRight, syncScrollState]);

  if (loading && episodes.length === 0) {
    return (
      <div className={shellClass} onWheel={handleWheel}>
        <div className={rowClass}>
          {seasonPicker}
          <div className={stripClass}>
            <span className="px-2 py-1.5 text-xs text-white/50">Серии…</span>
          </div>
        </div>
      </div>
    );
  }

  if (episodes.length === 0) {
    if (!showSeasonSelect) return null;

    return (
      <div className={shellClass} onWheel={handleWheel}>
        <div className={rowClass}>
          {seasonPicker}
          <div className={stripClass}>
            <span className="px-2 py-1.5 text-xs text-white/50">Серий нет</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={rowClass}>
        {canScrollLeft ? (
          <button
            type="button"
            aria-label="Прокрутить серии влево"
            className={scrollBtnClass}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => scrollByStep(-1)}
          >
            ‹
          </button>
        ) : null}
        {seasonPicker}
        <div
          ref={stripRef}
          className={stripClass}
          onScroll={syncScrollState}
          onWheel={handleWheel}
          {...dragProps}
        >
          {episodes.map((episode) => {
            // Prefer exact season match; if parent still has season=1 after API remap
            // to selectedSeason, still highlight the playing episode in the shown list.
            const active =
              episode.episodeNumber === currentEpisode &&
              (episode.seasonNumber === seasonNumber ||
                (seasonNumber === 1 &&
                  episode.seasonNumber === selectedSeason &&
                  selectedSeason !== 1));
            return (
              <button
                key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                type="button"
                disabled={disabled}
                aria-current={active ? "true" : undefined}
                aria-label={`Сезон ${episode.seasonNumber}, серия ${episode.episodeNumber}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  onSelect(episode.seasonNumber, episode.episodeNumber, episode.playerLink)
                }
                className={[
                  "inline-flex aspect-square h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition",
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-white/15 bg-white/5 text-white/85 hover:border-accent/50 hover:bg-white/10",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                ].join(" ")}
              >
                {episode.episodeNumber}
              </button>
            );
          })}
        </div>
        {canScrollRight ? (
          <button
            type="button"
            aria-label="Прокрутить серии вправо"
            className={scrollBtnClass}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => scrollByStep(1)}
          >
            ›
          </button>
        ) : null}
      </div>
    </div>
  );
}
