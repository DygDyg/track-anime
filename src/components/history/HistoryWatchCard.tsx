"use client";

/**
 * Единая карточка истории просмотра.
 * Используется на /history и в блоке «Новое в вашей истории» на главной.
 * При изменении дизайна править только этот файл.
 */

import { AnimeCardHoverShell } from "@/components/AnimeCardHoverShell";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { HistoryWatchProgressBlock } from "@/components/HistoryWatchProgressBlock";
import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { listStatusCardAccentClass } from "@/components/favorites/favorites-tab-theme";
import { TranslationBadge } from "@/components/TranslationBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import { episodeBadgeClass } from "@/lib/anime-labels";
import { formatHistoryWatchHint } from "@/lib/history-watch-card";
import { shouldShowListBadge } from "@/lib/user-anime-list-status";
import type { ReleaseItem, ReleaseItemDto } from "@/lib/releases";
import type { ReactNode } from "react";

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

export type HistoryWatchCardProps = {
  release: ReleaseItem | ReleaseItemDto;
  progress: {
    watchedEpisodeNumber: number;
    watchProgressPercent: number;
    watchPositionSeconds: number;
    watchDurationSeconds: number;
  };
  footer: ReactNode;
  /** Ссылка на страницу аниме; по умолчанию /anime/{id} */
  animeHref?: string;
  hoverPanelPortal?: boolean;
  onDelete?: () => void | Promise<void>;
  deleting?: boolean;
};

export function HistoryWatchCard({
  release,
  progress,
  footer,
  animeHref: animeHrefProp,
  hoverPanelPortal = false,
  onDelete,
  deleting = false,
}: HistoryWatchCardProps) {
  const { settings } = useSiteSettings();
  const listInfo = useUserListStatus(release.shikimoriId);
  const listAccentClass = listInfo ? listStatusCardAccentClass(listInfo.listStatus) : null;
  const showListMark = shouldShowListBadge(listInfo);

  const animeHref =
    animeHrefProp ?? (release.shikimoriId ? `/anime/${release.shikimoriId}` : null);

  const previewUrl =
    settings.preferPosterOverScreenshot || !release.screenshotUrl
      ? release.posterUrl
      : release.screenshotUrl ?? release.posterUrl;

  const showScreenshotBackground =
    Boolean(release.screenshotUrl) && !settings.preferPosterOverScreenshot;

  const historyHint = formatHistoryWatchHint(progress.watchedEpisodeNumber);

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
    posterInner
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
      onDeleteFromHistory={onDelete}
      deletingFromHistory={deleting}
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
              className="absolute inset-0 h-full w-full scale-105 object-cover blur-[4px]"
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
            <div className="pointer-events-none absolute bottom-0 right-0 z-20">
              <EpisodeNumberBadge episode={release.episodeNumber} status={release.status} />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5 md:min-h-0 md:flex-1 md:justify-start md:gap-0 md:p-3">
            <HistoryWatchProgressBlock
              hint={historyHint}
              percent={progress.watchProgressPercent}
              positionSeconds={progress.watchPositionSeconds}
              durationSeconds={progress.watchDurationSeconds}
              episodeNumber={progress.watchedEpisodeNumber}
              className="mb-1 md:mb-1.5"
            />
            {title}
            <div className="md:mt-1.5 md:min-h-[1.125rem]">
              <TranslationBadge name={release.translationName} className="max-w-full" />
            </div>
            <div className="mt-auto pt-1 md:pt-2">{footer}</div>
          </div>
        </div>

        {onDelete ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onDelete();
            }}
            disabled={deleting}
            aria-busy={deleting}
            aria-label={`Удалить «${release.animeTitle}» из истории`}
            className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted shadow-sm transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-wait disabled:opacity-50 md:hidden sm:right-3 sm:top-3"
          >
            {deleting ? (
              <LoadingSpinner size="xs" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ) : null}
      </article>
    </AnimeCardHoverShell>
  );
}
