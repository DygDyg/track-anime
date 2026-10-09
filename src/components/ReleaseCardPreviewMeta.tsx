import { AnimeKindInfoLink } from "@/components/AnimeKindInfoLink";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { GenreInfoLink } from "@/components/GenreInfoLink";
import { labelKind, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { kindBadgeClass } from "@/lib/anime-kind-theme";
import type { HoverPanelReleaseInput } from "@/lib/hover-panel-release";
import type { ReactNode } from "react";

type MetaRowProps = {
  release: HoverPanelReleaseInput;
  /** Элемент перед рейтингом (например NEW) */
  leading?: ReactNode;
  className?: string;
};

export function ReleaseCardMetaRow({ release, leading = null, className = "" }: MetaRowProps) {
  const kindLabel = labelKind(release.kind);
  const kindClass = kindBadgeClass(release.kind);
  const statusLabel = labelStatus(release.status);
  const statusClass = statusBadgeClass(release.status);
  const catalogEpisodes = "catalogEpisodes" in release ? release.catalogEpisodes : null;
  const episodeLabel =
    release.episodeNumber > 0
      ? `${release.episodeNumber} серия`
      : catalogEpisodes
        ? `${catalogEpisodes} эп.`
        : null;

  return (
    <div className={["flex flex-wrap items-center gap-1.5 text-xs", className].filter(Boolean).join(" ")}>
      {leading}
      {release.score ? <AnimeScoreBadge score={release.score} variant="inline" size="sm" /> : null}
      {episodeLabel ? (
        <span className="font-semibold tabular-nums text-foreground">{episodeLabel}</span>
      ) : null}
      {kindLabel && kindClass ? (
        <>
          <span className="text-muted/70">·</span>
          <AnimeKindInfoLink kind={release.kind} className={kindClass}>
            {kindLabel}
          </AnimeKindInfoLink>
        </>
      ) : null}
      {statusLabel && statusClass ? (
        <>
          <span className="text-muted/70">·</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusClass}`}>
            {statusLabel}
          </span>
        </>
      ) : null}
    </div>
  );
}

type GenresRowProps = {
  genres: string[];
  max?: number;
  className?: string;
};

export function ReleaseCardGenresRow({ genres, max = 6, className = "" }: GenresRowProps) {
  if (genres.length === 0) return null;

  return (
    <p className={["text-xs leading-relaxed", className].filter(Boolean).join(" ")}>
      <span className="text-muted">Жанры: </span>
      {genres.slice(0, max).map((genre, index) => (
        <span key={genre}>
          {index > 0 ? ", " : null}
          <GenreInfoLink genre={genre} className="font-medium text-accent transition hover:underline">
            {genre}
          </GenreInfoLink>
        </span>
      ))}
    </p>
  );
}
