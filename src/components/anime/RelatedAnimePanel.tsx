"use client";

import { useMemo, useState } from "react";
import type { RelatedAnimeDto, RelatedAnimeMode } from "@/lib/anime-related";
import { RelatedAnimeCard } from "@/components/anime/RelatedAnimeCard";
import {
  AnimeCardsHorizontalScroll,
  AnimeCardsHorizontalScrollSlot,
} from "@/components/anime/AnimeCardsHorizontalScroll";

type RelatedAnimePanelProps = {
  seasons: RelatedAnimeDto[];
  chronology: RelatedAnimeDto[];
  direct: RelatedAnimeDto[];
  currentShikimoriId: number;
};

function idsKey(items: RelatedAnimeDto[]): string {
  return items.map((item) => item.shikimoriId).join(",");
}

export function RelatedAnimePanel({
  seasons,
  chronology,
  direct,
  currentShikimoriId,
}: RelatedAnimePanelProps) {
  const hasSeasons = seasons.length > 0;
  const hasChronology = chronology.length > 0;
  const hasDirect = direct.length > 0;
  const chronologyDiffers = hasChronology && idsKey(chronology) !== idsKey(seasons);

  const [mode, setMode] = useState<RelatedAnimeMode>(
    hasSeasons ? "seasons" : hasChronology ? "chronology" : "direct",
  );

  const items = useMemo(() => {
    if (mode === "seasons" && hasSeasons) return seasons;
    if (mode === "chronology" && hasChronology) return chronology;
    return direct;
  }, [mode, hasSeasons, hasChronology, seasons, chronology, direct]);

  const showTabs =
    (hasSeasons && (chronologyDiffers || hasDirect)) ||
    (hasChronology && hasDirect && !hasSeasons);

  const highlightCurrent = mode === "seasons" || mode === "chronology";

  if (!hasSeasons && !hasChronology && !hasDirect) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Связанные аниме</h2>

        {showTabs ? (
          <div
            className="inline-flex flex-wrap rounded-lg border border-border bg-background/60 p-0.5"
            role="tablist"
            aria-label="Режим связанных аниме"
          >
            {hasSeasons ? (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "seasons"}
                onClick={() => setMode("seasons")}
                className={[
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm",
                  mode === "seasons"
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                Сезоны
              </button>
            ) : null}
            {hasChronology && (chronologyDiffers || !hasSeasons) ? (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "chronology"}
                onClick={() => setMode("chronology")}
                className={[
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm",
                  mode === "chronology"
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                Хронология
              </button>
            ) : null}
            {hasDirect ? (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "direct"}
                onClick={() => setMode("direct")}
                className={[
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm",
                  mode === "direct"
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                Напрямую
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Нет связанных аниме в этом режиме.</p>
      ) : (
        <AnimeCardsHorizontalScroll>
          {items.map((item) => (
            <AnimeCardsHorizontalScrollSlot key={item.shikimoriId}>
              <RelatedAnimeCard
                item={item}
                isCurrent={highlightCurrent && item.shikimoriId === currentShikimoriId}
                strip
              />
            </AnimeCardsHorizontalScrollSlot>
          ))}
        </AnimeCardsHorizontalScroll>
      )}
    </section>
  );
}
