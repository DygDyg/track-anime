"use client";

import { AnimeLink } from "@/components/AnimeLink";
import { useState, type MouseEvent } from "react";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { RelativeTime } from "@/components/RelativeTime";
import { formatEpisodeOfTotal, formatWatchPosition, type WatchHistoryItemDto } from "@/lib/watch-history";

function formatAddedLabel(createdAt: string): string {
  const created = new Date(createdAt);
  const diffMs = Date.now() - created.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (days >= 7) {
    return created.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: created.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  }

  if (days >= 1) {
    const mod10 = days % 10;
    const mod100 = days % 100;
    let word = "дней";
    if (mod10 === 1 && mod100 !== 11) word = "день";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "дня";
    return `${days} ${word} назад`;
  }

  return "";
}

function HistoryAddedAt({ createdAt }: { createdAt: string }) {
  const longLabel = formatAddedLabel(createdAt);

  return (
    <p className="mt-1 text-[11px] text-muted">
      {longLabel ? (
        <>Добавлено {longLabel}</>
      ) : (
        <>
          Добавлено <RelativeTime date={createdAt} />
        </>
      )}
    </p>
  );
}

function HistoryCard({
  item,
  onDelete,
}: {
  item: WatchHistoryItemDto;
  onDelete: (shikimoriId: number) => void;
}) {
  const href = `/anime/${item.shikimoriId}#player`;
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm(`Удалить «${item.animeTitle}» из истории?`);
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/user/watch-history/${item.shikimoriId}`, { method: "DELETE" });
      if (!res.ok) return;
      onDelete(item.shikimoriId);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="relative rounded-xl border border-border bg-card transition hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10">
      <AnimeLink
        href={href}
        className="group flex gap-3 p-3 sm:gap-4 sm:p-4 sm:pr-12"
      >
        <div className="relative w-[72px] shrink-0 overflow-hidden rounded-lg bg-surface-dim sm:w-[88px]">
          <AnimePoster
            src={item.posterUrl}
            shikimoriId={item.shikimoriId}
            alt={item.animeTitle}
            className="aspect-[3/4] h-full w-full object-cover"
          />
          <AnimeScoreBadge score={item.score} className="absolute right-1 top-1" size="sm" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition group-hover:text-accent">
              {item.animeTitle}
            </p>
            <p className="mt-1 text-xs text-muted">
              {item.translationTitle} · {formatEpisodeOfTotal(item.episodeNumber, item.episodesTotal)}
            </p>
            <HistoryAddedAt createdAt={item.createdAt} />
          </div>

          <div className="mt-auto space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
              <span>
                {formatWatchPosition(item.positionSeconds)} / {formatWatchPosition(item.episodeDurationSeconds)}
              </span>
              <span>{item.watchProgressPercent}%</span>
            </div>
            <div className="episode-progress">
              <div
                className="episode-progress-bar"
                style={{ width: `${item.watchProgressPercent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.watchProgressPercent}
                aria-label={`Просмотрено ${item.watchProgressPercent}% серии ${item.episodeNumber}`}
              />
            </div>
          </div>
        </div>
      </AnimeLink>

      <button
        type="button"
        onClick={(event) => void handleDelete(event)}
        disabled={deleting}
        aria-label={`Удалить «${item.animeTitle}» из истории`}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/90 text-muted transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 sm:right-3 sm:top-3"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </article>
  );
}

export function HistoryView({ initialItems }: { initialItems: WatchHistoryItemDto[] }) {
  const [items, setItems] = useState(initialItems);

  const handleDelete = (shikimoriId: number) => {
    setItems((current) => current.filter((item) => item.shikimoriId !== shikimoriId));
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">История</h1>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          Пока нет сохранённого прогресса. Начните смотреть аниме — позиция будет сохраняться автоматически.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.shikimoriId}>
              <HistoryCard item={item} onDelete={handleDelete} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
