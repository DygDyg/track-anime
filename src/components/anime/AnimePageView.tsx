import { AnimeAgeRatingBadge } from "@/components/anime/AnimeAgeRatingBadge";
import { AdminAnimeDebugButton } from "@/components/admin/AdminAnimeDebugButton";
import { AnimePageBackButton } from "@/components/anime/AnimePageBackButton";
import { AnimeScreenshotBackground } from "@/components/anime/AnimeScreenshotBackground";
import { FormattedDescription } from "@/components/anime/FormattedDescription";
import { AnimeMetadataList } from "@/components/anime/AnimeMetadataList";
import { AnimeShikimoriRating } from "@/components/anime/AnimeShikimoriRating";
import { AnimeWatchPanel } from "@/components/anime/AnimeWatchPanel";
import { AnimePageListBadge } from "@/components/anime/AnimePageListBadge";
import { AnimeListActions } from "@/components/anime/AnimeListActions";
import { AnimeRewatchAction } from "@/components/anime/AnimeRewatchAction";
import { AnimePosterCover } from "@/components/anime/AnimePosterCover";
import { AnimeScreenshotGallery } from "@/components/anime/AnimeScreenshotGallery";
import { RelatedAnimeSection } from "@/components/anime/RelatedAnimeSection";
import { SimilarAnimeSection } from "@/components/anime/SimilarAnimeSection";
import { AnimeCommentsSection } from "@/components/anime/AnimeCommentsSection";
import { AnimeShareButtons } from "@/components/anime/AnimeShareButtons";
import { AnimeTrailerEmbed } from "@/components/anime/AnimeTrailerEmbed";
import { RecentAnimeOpenRecorder } from "@/components/anime/RecentAnimeOpenRecorder";
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

function AnimeTitleBlock({
  anime,
  titleWithKind,
  className = "",
}: {
  anime: AnimePageDto;
  titleWithKind: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl md:text-3xl">
        {titleWithKind}
      </h1>

      {anime.titleOriginal && anime.titleOriginal !== anime.title ? (
        <p className="mt-1 text-sm text-muted">{anime.titleOriginal}</p>
      ) : null}

      {anime.synonyms.length > 0 ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Также: {anime.synonyms.join(" · ")}
        </p>
      ) : null}
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
      <RecentAnimeOpenRecorder shikimoriId={anime.shikimoriId} title={anime.title} />
      <AnimeScreenshotBackground urls={anime.screenshots} fallbackUrl={anime.posterUrl} title={anime.title} />
      <div className="relative z-10 py-5 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6 px-3 sm:px-6 lg:px-8">
          <ContentPanel className="overflow-x-hidden p-0 sm:overflow-visible sm:p-6">
            <div className="anime-page-hero-row relative flex flex-col gap-5 sm:flex-row sm:gap-8">
              <div className="px-4 pt-4 sm:hidden">
                <AnimePageBackButton className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-foreground" />
                <AnimeTitleBlock anime={anime} titleWithKind={titleWithKind} />
              </div>

              <aside className="flex w-full shrink-0 flex-col sm:w-[220px] md:w-[240px]">
                <AnimePosterCover
                  shikimoriId={anime.shikimoriId}
                  posterUrl={anime.posterUrl}
                  fallbackSrc={anime.screenshots[0] ?? null}
                  title={anime.title}
                />
                <div className="px-4 sm:px-0">
                  <AnimeShareButtons anime={anime} />
                </div>
                <div className="anime-page-mobile-fullbleed sm:mx-0">
                  <AnimeShikimoriRating anime={anime} className="sm:rounded-xl" />
                </div>
                {anime.trailerYoutubeId ? (
                  <div className="anime-page-mobile-fullbleed sm:mx-0">
                    <AnimeTrailerEmbed
                      shikimoriId={anime.shikimoriId}
                      youtubeId={anime.trailerYoutubeId}
                      posterUrl={anime.posterUrl}
                      title={anime.title}
                      className="sm:rounded-lg"
                    />
                  </div>
                ) : null}
              </aside>

              <div className="min-w-0 flex-1 px-4 sm:px-0">
                <AnimePageBackButton className="mb-3 hidden items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-foreground sm:inline-flex" />

                <AnimeTitleBlock anime={anime} titleWithKind={titleWithKind} className="hidden sm:block" />

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <AnimePageListBadge shikimoriId={anime.shikimoriId} size="md" className="max-w-full" />
                  {releaseSeasonLabel ? <MetaBadge>{releaseSeasonLabel}</MetaBadge> : null}
                  {statusLabel ? (
                    <MetaBadge className={statusBadgeClass(anime.status) ?? undefined}>
                      {statusLabel}
                    </MetaBadge>
                  ) : null}
                  <AnimeAgeRatingBadge rating={anime.rating} />
                  <AdminAnimeDebugButton shikimoriId={anime.shikimoriId} compact />
                </div>

                <AnimeInfoStats anime={anime} />

                <AnimeMetadataList anime={anime} />

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

                {anime.screenshots.length > 0 ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <AnimeScreenshotGallery title={anime.title} screenshots={anime.screenshots} />
                  </div>
                ) : null}

                <AnimeListActions shikimoriId={anime.shikimoriId} />
                <AnimeRewatchAction shikimoriId={anime.shikimoriId} />
              </div>
            </div>
          </ContentPanel>

          {anime.description ? (
            <ContentPanel className="p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold text-foreground">Описание</h2>
              <div className="anime-description-body">
                <FormattedDescription
                  text={anime.description}
                  paragraphClassName="text-sm leading-relaxed text-muted sm:text-base"
                  enableEntityHover
                />
              </div>
            </ContentPanel>
          ) : null}

          <AnimeWatchPanel
            shikimoriId={anime.shikimoriId}
            animeTitle={anime.title}
            translations={anime.translations}
            episodesTotal={anime.episodes}
          />

          <RelatedAnimeSection shikimoriId={anime.shikimoriId} />

          <SimilarAnimeSection shikimoriId={anime.shikimoriId} />

          <AnimeCommentsSection shikimoriId={anime.shikimoriId} />
        </div>
      </div>
    </div>
  );
}
