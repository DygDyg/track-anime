"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";

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
  const stripRef = useRef<HTMLDivElement>(null);

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
  }, [episodes.length, syncScrollState]);

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

  const stripClass = overlay
    ? "kodik-player-beta-episodes kodik-player-beta-episodes--overlay flex select-none gap-1.5 overflow-x-auto p-2 pt-1.5"
    : "kodik-player-beta-episodes flex select-none gap-1.5 overflow-x-auto border-b border-border bg-[#0f0f0f] p-2";
  const shellClass = overlay
    ? "kodik-player-beta-episodes-shell relative p-2"
    : "kodik-player-beta-episodes-shell relative";
  const canScrollLeft = scrollState.left > 1;
  const canScrollRight = scrollState.left < scrollState.max - 1;
  const showSeasonSelect = seasons.length > 1;
  const handleSeasonChange = (value: string) => {
    setSelectedSeason(Number(value));
    setExactSeason(true);
  };

  if (loading && episodes.length === 0) {
    return (
      <div className={shellClass} onWheel={handleWheel}>
        <div className={stripClass}>
          {showSeasonSelect ? (
            <select
              value={selectedSeason}
              disabled={disabled}
              aria-label="Сезон"
              onChange={(event) => handleSeasonChange(event.target.value)}
              className="h-9 shrink-0 rounded-md border border-white/15 bg-black/65 px-2 text-xs font-semibold text-white/90 outline-none transition hover:border-accent/50 focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {seasons.map((season) => (
                <option key={season.seasonNumber} value={season.seasonNumber}>
                  {formatSeasonLabel(season)}
                </option>
              ))}
            </select>
          ) : null}
          <span className="px-2 py-1.5 text-xs text-white/50">Серии…</span>
        </div>
      </div>
    );
  }

  if (episodes.length === 0) {
    if (!showSeasonSelect) return null;

    return (
      <div className={shellClass} onWheel={handleWheel}>
        <div className={stripClass}>
          <select
            value={selectedSeason}
            disabled={disabled}
            aria-label="Сезон"
            onChange={(event) => handleSeasonChange(event.target.value)}
            className="h-9 shrink-0 rounded-md border border-white/15 bg-black/65 px-2 text-xs font-semibold text-white/90 outline-none transition hover:border-accent/50 focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {seasons.map((season) => (
              <option key={season.seasonNumber} value={season.seasonNumber}>
                {formatSeasonLabel(season)}
              </option>
            ))}
          </select>
          <span className="px-2 py-1.5 text-xs text-white/50">Серий нет</span>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {canScrollLeft ? (
        <div
          aria-hidden="true"
          className="kodik-player-beta-episodes-edge kodik-player-beta-episodes-edge--left"
        />
      ) : null}
      {canScrollRight ? (
        <div
          aria-hidden="true"
          className="kodik-player-beta-episodes-edge kodik-player-beta-episodes-edge--right"
        />
      ) : null}
      <div ref={stripRef} className={stripClass} onScroll={syncScrollState} onWheel={handleWheel}>
        {showSeasonSelect ? (
          <select
            value={selectedSeason}
            disabled={disabled}
            aria-label="Сезон"
            onChange={(event) => handleSeasonChange(event.target.value)}
            className="h-9 shrink-0 rounded-md border border-white/15 bg-black/65 px-2 text-xs font-semibold text-white/90 outline-none transition hover:border-accent/50 focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {seasons.map((season) => (
              <option key={season.seasonNumber} value={season.seasonNumber}>
                {formatSeasonLabel(season)}
              </option>
            ))}
          </select>
        ) : null}
        {episodes.map((episode) => {
          const active =
            episode.seasonNumber === seasonNumber && episode.episodeNumber === currentEpisode;
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
    </div>
  );
}
