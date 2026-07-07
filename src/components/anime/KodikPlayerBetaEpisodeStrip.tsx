"use client";

import { useEffect, useState } from "react";

type EpisodeItem = {
  episodeNumber: number;
  seasonNumber: number;
};

type Props = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  currentEpisode: number;
  disabled?: boolean;
  onSelect: (episodeNumber: number) => void;
  overlay?: boolean;
};

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const params = new URLSearchParams({
          kodikId,
          season: String(seasonNumber),
        });
        const res = await fetch(`/api/anime/${shikimoriId}/episodes?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as { episodes?: EpisodeItem[] };
        if (!cancelled) setEpisodes(data.episodes ?? []);
      } catch {
        if (!cancelled) setEpisodes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shikimoriId, kodikId, seasonNumber]);

  const stripClass = overlay
    ? "kodik-player-beta-episodes kodik-player-beta-episodes--overlay flex gap-1.5 overflow-x-auto p-2 pt-2.5"
    : "kodik-player-beta-episodes flex gap-1.5 overflow-x-auto border-b border-border bg-[#0f0f0f] p-2";

  if (loading && episodes.length === 0) {
    return (
      <div className={stripClass}>
        <span className="px-2 py-1.5 text-xs text-white/50">Серии…</span>
      </div>
    );
  }

  if (episodes.length === 0) return null;

  return (
    <div className={stripClass}>
      {episodes.map((episode) => {
        const active = episode.episodeNumber === currentEpisode;
        return (
          <button
            key={`${episode.seasonNumber}-${episode.episodeNumber}`}
            type="button"
            disabled={disabled}
            aria-current={active ? "true" : undefined}
            aria-label={`Серия ${episode.episodeNumber}`}
            onClick={() => onSelect(episode.episodeNumber)}
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
  );
}
