"use client";

import { AnimeCardHoverShell } from "@/components/AnimeCardHoverShell";
import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { SearchResultMeta } from "@/components/search/SearchResultMeta";
import { siteClass } from "@/components/site/site-styles";
import { searchResultToHoverRelease } from "@/lib/hover-panel-release";
import type { SearchResultDto } from "@/lib/search-shared";

export function SearchResultCard({ item }: { item: SearchResultDto }) {
  const listInfo = useUserListStatus(item.shikimoriId);
  const hoverRelease = searchResultToHoverRelease(item);
  const previewUrl = item.screenshotUrl ?? item.posterUrl;

  return (
    <AnimeCardHoverShell release={hoverRelease} previewUrl={previewUrl}>
      <AnimeLink
        href={`/anime/${item.shikimoriId}`}
        className={`${siteClass.card} group relative z-10 flex h-full flex-col`}
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-surface-dim">
          <AnimePoster
            src={item.posterUrl}
            fallbackSrc={item.screenshotUrl}
            shikimoriId={item.shikimoriId}
            alt={item.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
          <ListStatusBadge info={listInfo} className="absolute left-1.5 top-1.5 z-10" />
          <AnimeScoreBadge score={item.score} className="absolute right-1.5 top-1.5" />
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug text-foreground group-hover:text-accent">
            {item.title}
          </h3>
          {item.titleOriginal && item.titleOriginal !== item.title ? (
            <p className="line-clamp-1 text-xs text-muted">{item.titleOriginal}</p>
          ) : null}
          <SearchResultMeta item={item} className="mt-auto" />
        </div>
      </AnimeLink>
    </AnimeCardHoverShell>
  );
}
