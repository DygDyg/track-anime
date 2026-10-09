"use client";

import { AnimeCardHoverShell } from "@/components/AnimeCardHoverShell";
import { AnimeKindCornerBadge } from "@/components/AnimeKindCornerBadge";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { RelativeTime } from "@/components/RelativeTime";
import { ReleaseCardGenresRow, ReleaseCardMetaRow } from "@/components/ReleaseCardPreviewMeta";
import { TranslationBadge } from "@/components/TranslationBadge";
import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { listStatusCardAccentClass } from "@/components/favorites/favorites-tab-theme";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import { shouldShowListBadge } from "@/lib/user-anime-list-status";
import { earlySeriesCardAccentClass, episodeBadgeClass, isEarlySeriesRelease } from "@/lib/anime-labels";
import type { ReleaseItem, ReleaseItemDto } from "@/lib/releases";

function EpisodeNumberBadge({
  episode,
  status,
}: {
  episode: number;
  status: string | null;
}) {
  return (
    <div
      className={`rounded-tl-2xl border px-2 py-1 backdrop-blur-[2px] sm:px-2.5 sm:py-1.5 ${episodeBadgeClass(status)}`}
    >
      <span className="text-lg font-bold leading-none tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] sm:text-xl md:text-2xl">
        {episode}
      </span>
    </div>
  );
}

function EarlySeriesNewBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "rounded-md border border-white/90 bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-wide text-white shadow-[0_1px_4px_rgba(0,0,0,0.85)] ring-1 ring-black/50 sm:px-2 sm:text-[11px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      NEW
    </div>
  );
}

export function ReleaseCard({
  release,
  hoverPanelPortal = false,
}: {
  release: ReleaseItem | ReleaseItemDto;
  /** Hover-панель через portal — поверх overflow-контейнеров */
  hoverPanelPortal?: boolean;
}) {
  const { settings } = useSiteSettings();
  const listInfo = useUserListStatus(release.shikimoriId);
  const listAccentClass = listInfo ? listStatusCardAccentClass(listInfo.listStatus) : null;
  const showListMark = shouldShowListBadge(listInfo);
  const showEarlySeriesMark = isEarlySeriesRelease(release.episodeNumber, release.kind);

  const watchHref = release.playerLink ?? "#";
  const animeHref = release.shikimoriId ? `/anime/${release.shikimoriId}` : null;

  const previewUrl =
    settings.preferPosterOverScreenshot || !release.screenshotUrl
      ? release.posterUrl
      : release.screenshotUrl ?? release.posterUrl;

  const showScreenshotBackground =
    Boolean(release.screenshotUrl) && !settings.preferPosterOverScreenshot;

  const posterInner = (
    <AnimePoster
      src={release.posterUrl}
      fallbackSrc={release.screenshotUrl}
      shikimoriId={release.shikimoriId}
      alt={release.animeTitle}
      className="h-full w-full object-cover transition duration-300 group-hover/card:scale-105"
    />
  );

  const posterLink = animeHref ? (
    <AnimeLink href={animeHref} className="block h-full w-full">
      {posterInner}
    </AnimeLink>
  ) : (
    <a href={watchHref} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
      {posterInner}
    </a>
  );

  const title = animeHref ? (
    <AnimeLink href={animeHref}>
      <h3 className="release-card-title line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug group-hover/card:text-accent md:min-h-[4rem] md:text-sm">
        {release.animeTitle}
      </h3>
    </AnimeLink>
  ) : (
    <h3 className="release-card-title line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug md:min-h-[4rem] md:text-sm">
      {release.animeTitle}
    </h3>
  );

  return (
    <AnimeCardHoverShell
      release={release}
      previewUrl={previewUrl}
      hoverPanelPortal={hoverPanelPortal}
    >
      <article
        data-tv-card={animeHref ? true : undefined}
        tabIndex={animeHref ? 0 : undefined}
        aria-label={animeHref ? release.animeTitle : undefined}
        className={[
          "relative z-10 flex h-full gap-3 overflow-hidden rounded-lg border border-border p-2 transition group-hover/card:border-accent/40 group-hover/card:shadow-lg group-hover/card:shadow-accent/10 md:flex md:flex-col md:rounded-xl md:p-0",
          showScreenshotBackground ? "bg-surface-dim" : "bg-card",
          showListMark && listAccentClass ? `border-l-4 ${listAccentClass}` : "",
        ].join(" ")}
      >
        {showEarlySeriesMark ? (
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 z-20 h-1 ${earlySeriesCardAccentClass()}`}
          />
        ) : null}
        {showScreenshotBackground ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={release.screenshotUrl!}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              {...EXTERNAL_IMG_ATTRS}
              className="tv-decorative-blur absolute inset-0 h-full w-full scale-105 object-cover blur-[4px]"
            />
            <div className="card-screenshot-dim absolute inset-0" />
          </>
        ) : null}

        <div className="relative z-10 flex min-w-0 flex-1 gap-3 md:flex-col md:gap-0">
          <div className="relative w-[88px] shrink-0 overflow-hidden rounded-md bg-surface-dim sm:w-[96px] md:w-full md:shrink-0 md:rounded-none">
            <div className="aspect-[3/4] h-full w-full">{posterLink}</div>
            <ListStatusBadge
              info={listInfo}
              className="pointer-events-none absolute left-1 top-1 z-20 max-w-[calc(100%-0.5rem)] md:left-1.5 md:top-1.5"
            />
            <AnimeScoreBadge
              score={release.score}
              className="absolute right-1 top-1 z-20 md:right-1.5 md:top-1.5"
            />
            <AnimeKindCornerBadge kind={release.kind} className="absolute bottom-0 left-0 z-20" />
            <div className="pointer-events-none absolute bottom-0 right-0 z-20 flex flex-col items-end gap-0.5">
              {/* Desktop: NEW над номером серии. На мобиле — в ряду метаданных перед рейтингом. */}
              {showEarlySeriesMark ? (
                <div className="hidden md:block">
                  <EarlySeriesNewBadge />
                </div>
              ) : null}
              <EpisodeNumberBadge episode={release.episodeNumber} status={release.status} />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5 md:min-h-0 md:flex-1 md:justify-start md:gap-0 md:p-3">
            {title}
            <div className="space-y-1 md:hidden">
              <ReleaseCardMetaRow
                release={release}
                leading={
                  showEarlySeriesMark ? <EarlySeriesNewBadge className="shrink-0" /> : null
                }
              />
              <ReleaseCardGenresRow genres={release.genres} max={4} />
            </div>
            <div className="md:mt-1.5 md:min-h-[1.125rem]">
              <TranslationBadge name={release.translationName} className="max-w-full" />
            </div>
            <div className="mt-auto pt-1 md:pt-2">
              <RelativeTime
                date={release.releasedAt}
                mode={settings.showRelativeTime ? "relative" : "absolute"}
                className="text-sm font-semibold text-foreground md:text-base"
              />
            </div>
          </div>
        </div>
      </article>
    </AnimeCardHoverShell>
  );
}
