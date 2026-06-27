"use client";

import { AnimeLink } from "@/components/AnimeLink";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { ListStatusBadge } from "@/components/favorites/ListStatusBadge";
import { useUserListStatus } from "@/components/favorites/UserListStatusProvider";
import type { RelatedAnimeDto } from "@/lib/anime-related";
import { formatReleaseYear, labelKind, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { kindBadgeClass } from "@/lib/anime-kind-theme";
import { relationBadgeClass } from "@/lib/anime-relation-theme";

function RelatedAnimeCard({ item }: { item: RelatedAnimeDto }) {
  const kindLabel = labelKind(item.kind);
  const statusLabel = labelStatus(item.status);
  const listInfo = useUserListStatus(item.shikimoriId);
  const year = formatReleaseYear(item.airedOn, item.releasedOn);
  const kindClass = kindBadgeClass(item.kind);
  const statusClass = statusBadgeClass(item.status);

  return (
    <AnimeLink
      href={`/anime/${item.shikimoriId}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-dim">
        <AnimePoster
          src={item.posterUrl}
          shikimoriId={item.shikimoriId}
          alt={item.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <ListStatusBadge info={listInfo} className="absolute right-1.5 top-1.5 z-10" />
        <AnimeScoreBadge score={item.score} className="absolute left-1.5 bottom-1.5 z-10" size="sm" />
        <span
          className={`absolute left-2 top-2 z-10 max-w-[calc(100%-0.75rem)] truncate ${relationBadgeClass(item.relation)}`}
        >
          {item.relationLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h3 className="line-clamp-3 min-h-[3.75rem] text-sm font-semibold leading-snug group-hover:text-accent">
          {item.title}
        </h3>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[10px]">
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
    </AnimeLink>
  );
}

export function RelatedAnimePanel({ items }: { items: RelatedAnimeDto[] }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Связанные аниме</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => (
          <RelatedAnimeCard key={item.shikimoriId} item={item} />
        ))}
      </div>
    </section>
  );
}
