"use client";

import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import { labelKind, labelStatus } from "@/lib/anime-labels";
import type { SearchResultDto } from "@/lib/search-shared";

export function SearchResultCard({ item }: { item: SearchResultDto }) {
  const listInfo = useUserListStatus(item.shikimoriId);
  const kindLabel = labelKind(item.kind);
  const statusLabel = labelStatus(item.status);

  return (
    <AnimeLink
      href={`/anime/${item.shikimoriId}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/15"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-dim">
        <AnimePoster
          src={item.posterUrl ?? item.screenshotUrl}
          shikimoriId={item.shikimoriId}
          alt={item.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <ListStatusBadge info={listInfo} className="absolute left-1.5 top-1.5 z-10" />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug text-foreground group-hover:text-accent">
          {item.title}
        </h3>
        {item.titleOriginal && item.titleOriginal !== item.title ? (
          <p className="line-clamp-1 text-xs text-muted">{item.titleOriginal}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-1.5 text-[11px] text-muted">
          {item.year ? <span>{item.year}</span> : null}
          {kindLabel ? <span>{kindLabel}</span> : null}
          {statusLabel ? <span>{statusLabel}</span> : null}
          {item.episodes ? <span>{item.episodes} эп.</span> : null}
        </div>
      </div>
    </AnimeLink>
  );
}
