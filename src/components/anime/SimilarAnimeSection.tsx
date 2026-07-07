import { Suspense } from "react";
import { getSimilarAnimes } from "@/lib/anime-related";
import { RelatedAnimeCard } from "@/components/anime/RelatedAnimeCard";
import {
  AnimeCardsHorizontalScroll,
  AnimeCardsHorizontalScrollSkeleton,
  AnimeCardsHorizontalScrollSlot,
} from "@/components/anime/AnimeCardsHorizontalScroll";

function SimilarAnimeSkeleton() {
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5"
      aria-busy="true"
      aria-label="Загрузка похожих аниме"
    >
      <div className="mb-4 h-6 w-40 animate-pulse rounded bg-surface-dim" />
      <AnimeCardsHorizontalScrollSkeleton />
    </section>
  );
}

async function SimilarAnimeGridAsync({ shikimoriId }: { shikimoriId: number }) {
  const items = await getSimilarAnimes(shikimoriId);
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Похожие аниме</h2>
      <AnimeCardsHorizontalScroll>
        {items.map((item) => (
          <AnimeCardsHorizontalScrollSlot key={item.shikimoriId}>
            <RelatedAnimeCard item={item} hideRelation strip />
          </AnimeCardsHorizontalScrollSlot>
        ))}
      </AnimeCardsHorizontalScroll>
    </section>
  );
}

export function SimilarAnimeSection({ shikimoriId }: { shikimoriId: number }) {
  return (
    <Suspense fallback={<SimilarAnimeSkeleton />}>
      <SimilarAnimeGridAsync shikimoriId={shikimoriId} />
    </Suspense>
  );
}
