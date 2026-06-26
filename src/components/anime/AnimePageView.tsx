import { AnimePageBackButton } from "@/components/anime/AnimePageBackButton";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScreenshotBackground } from "@/components/anime/AnimeScreenshotBackground";
import { FormattedDescription } from "@/components/anime/FormattedDescription";
import { AnimeMetadataList } from "@/components/anime/AnimeMetadataList";
import { AnimeShikimoriRating } from "@/components/anime/AnimeShikimoriRating";
import { AnimeWatchPanel } from "@/components/anime/AnimeWatchPanel";
import { AnimePageListBadge } from "@/components/anime/AnimePageListBadge";
import { AnimeListActions } from "@/components/anime/AnimeListActions";
import { RelatedAnimeSection } from "@/components/anime/RelatedAnimeSection";
import { AnimeShareButtons } from "@/components/anime/AnimeShareButtons";
import type { AnimePageDto } from "@/lib/anime-page";
import {
  formatReleaseSeasonBadge,
  labelKindShort,
  labelStatus,
  statusBadgeClass,
} from "@/lib/anime-labels";

function ContentPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card shadow-lg shadow-black/40 ${className}`}>
      {children}
    </div>
  );
}

function MetaBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={[
        "rounded-full border px-3 py-1 text-xs",
        className ?? "border-border bg-background text-foreground",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function AnimeInfoStat({
  label,
  value,
  hint,
  accent = false,
  progress,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  progress?: number | null;
}) {
  return (
    <div className="min-w-0 flex-1 px-0.5 py-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {hint ? <p className="text-[10px] text-muted">{hint}</p> : null}
      </div>
      <p
        className={[
          "mt-0.5 text-sm font-bold leading-tight",
          accent ? "text-accent" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </p>
      {progress != null && progress > 0 ? (
        <div className="episode-progress mt-1">
          <div
            className="episode-progress-bar"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(progress * 100))}
            aria-label={`${label}: ${value}`}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatEpisodeValue(episodes: number | null, episodesAired: number | null): string | null {
  if (episodes == null && episodesAired == null) return null;
  if (episodes == null || episodes <= 0) {
    return episodesAired != null ? String(episodesAired) : null;
  }
  return `${episodesAired ?? "?"} / ${episodes}`;
}

function AnimeInfoStats({ anime }: { anime: AnimePageDto }) {
  const episodeValue = formatEpisodeValue(anime.episodes, anime.episodesAired);

  if (!episodeValue) return null;

  const episodeProgress =
    anime.episodes != null && anime.episodes > 0 && anime.episodesAired != null
      ? anime.episodesAired / anime.episodes
      : null;

  const episodeHint =
    anime.episodes != null && anime.episodesAired != null && anime.episodes > 0
      ? `${Math.round((anime.episodesAired / anime.episodes) * 100)}%`
      : undefined;

  return (
    <div className="mt-3">
      <AnimeInfoStat
        label="Эпизоды"
        value={episodeValue}
        hint={episodeHint}
        accent
        progress={episodeProgress}
      />
    </div>
  );
}

export function AnimePageView({ anime }: { anime: AnimePageDto }) {
  const statusLabel = labelStatus(anime.status);
  const kindShortLabel = labelKindShort(anime.kind);
  const releaseSeasonLabel = formatReleaseSeasonBadge(anime.airedOn, anime.releasedOn);
  const titleWithKind = kindShortLabel ? `[${kindShortLabel}] ${anime.title}` : anime.title;

  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)]">
      <AnimeScreenshotBackground urls={anime.screenshots} fallbackUrl={anime.posterUrl} title={anime.title} />
      <div className="relative z-10 py-5 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6 px-3 sm:px-6 lg:px-8">
          <ContentPanel className="p-4 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
              <div className="mx-auto w-[200px] shrink-0 sm:mx-0 sm:w-[220px] md:w-[240px]">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-md">
                  <AnimePoster
                    src={anime.posterUrl}
                    shikimoriId={anime.shikimoriId}
                    alt={anime.title}
                    loading="eager"
                    size="full"
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <AnimePageListBadge
                    shikimoriId={anime.shikimoriId}
                    size="md"
                    className="absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)]"
                  />
                </div>
                <AnimeShareButtons anime={anime} />
                <AnimeShikimoriRating anime={anime} />
              </div>

              <div className="min-w-0 flex-1">
                <AnimePageBackButton className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-foreground" />

                <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl md:text-3xl">
                  {titleWithKind}
                </h1>

                {anime.titleOriginal && anime.titleOriginal !== anime.title ? (
                  <p className="mt-1 text-sm text-muted">{anime.titleOriginal}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <AnimePageListBadge shikimoriId={anime.shikimoriId} size="md" className="max-w-full" />
                  {releaseSeasonLabel ? <MetaBadge>{releaseSeasonLabel}</MetaBadge> : null}
                  {statusLabel ? (
                    <MetaBadge className={statusBadgeClass(anime.status) ?? undefined}>
                      {statusLabel}
                    </MetaBadge>
                  ) : null}
                </div>

                <AnimeInfoStats anime={anime} />

                <AnimeMetadataList anime={anime} />

                {anime.synonyms.length > 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Также: {anime.synonyms.join(" · ")}
                  </p>
                ) : null}

                {anime.shikimoriUrl ? (
                  <a
                    href={anime.shikimoriUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex text-sm text-accent transition hover:underline"
                  >
                    Открыть на Shikimori
                  </a>
                ) : null}

                <AnimeListActions shikimoriId={anime.shikimoriId} />
              </div>
            </div>
          </ContentPanel>

          {anime.description ? (
            <ContentPanel className="p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold text-foreground">Описание</h2>
              <FormattedDescription
                text={anime.description}
                paragraphClassName="text-sm leading-relaxed text-muted sm:text-base"
              />
            </ContentPanel>
          ) : null}

          <AnimeWatchPanel
            shikimoriId={anime.shikimoriId}
            animeTitle={anime.title}
            translations={anime.translations}
          />

          <RelatedAnimeSection shikimoriId={anime.shikimoriId} />
        </div>
      </div>
    </div>
  );
}
