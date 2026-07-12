"use client";

import { AnimeCardHoverShell } from "@/components/AnimeCardHoverShell";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import type { RelatedAnimeDto } from "@/lib/anime-related";
import { formatReleaseYear, labelKind, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { kindBadgeClass } from "@/lib/anime-kind-theme";
import { EXTERNAL_IMG_ATTRS } from "@/lib/external-image";
import { relatedToHoverRelease } from "@/lib/hover-panel-release";
import { relationBadgeClass } from "@/lib/anime-relation-theme";

export function RelatedAnimeCard({
  item,
  isCurrent = false,
  hideRelation = false,
  strip = false,
}: {
  item: RelatedAnimeDto;
  isCurrent?: boolean;
  hideRelation?: boolean;
  strip?: boolean;
}) {
  const { settings } = useSiteSettings();
  const kindLabel = labelKind(item.kind);
  const statusLabel = labelStatus(item.status);
  const listInfo = useUserListStatus(item.shikimoriId);
  const year = formatReleaseYear(item.airedOn, item.releasedOn);
  const kindClass = kindBadgeClass(item.kind);
  const statusClass = statusBadgeClass(item.status);
  const hoverRelease = relatedToHoverRelease(item);

  const previewUrl = item.screenshotUrl ?? item.posterUrl;

  const showScreenshotBackground =
    Boolean(item.screenshotUrl) && !settings.preferPosterOverScreenshot;

  return (
    <AnimeCardHoverShell
      release={hoverRelease}
      previewUrl={previewUrl}
      hoverPanelPortal={strip}
      className="flex h-full w-full min-h-0 flex-col"
    >
      <AnimeLink
        href={`/anime/${item.shikimoriId}`}
        className={[
          "group relative z-10 flex h-full w-full flex-col overflow-hidden rounded-xl border transition hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10",
          showScreenshotBackground ? "bg-surface-dim" : "bg-card",
          isCurrent ? "border-accent ring-2 ring-accent/35" : "border-border",
        ].join(" ")}
      >
        {showScreenshotBackground ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.screenshotUrl!}
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

        <div className="relative z-10 flex h-full flex-col">
          <div className="relative aspect-[3/4] shrink-0 overflow-hidden bg-surface-dim">
            <AnimePoster
              src={item.posterUrl}
              fallbackSrc={item.screenshotUrl}
              shikimoriId={item.shikimoriId}
              alt={item.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <ListStatusBadge info={listInfo} className="absolute right-1.5 top-1.5 z-10" />
            <AnimeScoreBadge score={item.score} className="absolute bottom-1.5 left-1.5 z-10" size="sm" />
            {!hideRelation && item.relationLabel ? (
              <span
                className={`absolute left-2 top-2 z-10 max-w-[calc(100%-0.75rem)] truncate ${relationBadgeClass(item.relation)}`}
              >
                {item.relationLabel}
              </span>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
            <h3
              className={[
                "text-sm font-semibold leading-snug group-hover:text-accent",
                strip ? "line-clamp-2 min-h-[2.5rem]" : "line-clamp-3 min-h-[3.75rem]",
              ].join(" ")}
            >
              {item.title}
            </h3>
            <div
              className={[
                "mt-auto flex flex-wrap items-start gap-1.5 text-[10px]",
                strip ? "min-h-[2.25rem] content-start" : "",
              ].join(" ")}
            >
              {year ? <span className="text-muted">{year}</span> : null}
              {item.episodes ? <span className="text-muted">{item.episodes} эп.</span> : null}
              {kindLabel && kindClass ? (
                <span className={kindClass}>{kindLabel}</span>
              ) : kindLabel ? (
                <span className="text-muted">{kindLabel}</span>
              ) : null}
              {statusLabel ? (
                <span
                  className={[
                    "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                    statusClass ?? "border-border text-muted",
                  ].join(" ")}
                >
                  {statusLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </AnimeLink>
    </AnimeCardHoverShell>
  );
}
