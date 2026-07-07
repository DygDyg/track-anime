import type { AnimePageDto } from "@/lib/anime-page";
import { formatScoreVotes } from "@/lib/anime-labels";

export function AnimeShikimoriRating({ anime, className = "" }: { anime: AnimePageDto; className?: string }) {
  if (!anime.score) return null;

  const scoreNumber = Number.parseFloat(anime.score);
  const scorePercent = Number.isFinite(scoreNumber)
    ? Math.min(100, Math.max(0, (scoreNumber / 10) * 100))
    : 0;

  return (
    <div
      className={[
        "mt-4 border-y border-border bg-background/80 p-3 sm:mt-4 sm:rounded-xl sm:border",
        className,
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Рейтинг Shikimori</p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold tabular-nums text-accent">{anime.score}/10</span>
        {anime.scoreCount != null ? (
          <span className="text-[11px] text-muted">{formatScoreVotes(anime.scoreCount)}</span>
        ) : null}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-dim">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${scorePercent}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={Number.isFinite(scoreNumber) ? scoreNumber : undefined}
          aria-label={`Рейтинг Shikimori: ${anime.score} из 10`}
        />
      </div>
    </div>
  );
}
