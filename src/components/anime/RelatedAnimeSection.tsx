import { Suspense } from "react";
import { getRelatedAnimesBundle } from "@/lib/anime-related";
import { RelatedAnimePanel } from "@/components/anime/RelatedAnimePanel";
import { AnimeCardsHorizontalScrollSkeleton } from "@/components/anime/AnimeCardsHorizontalScroll";

function RelatedAnimeSkeleton() {
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5"
      aria-busy="true"
      aria-label="Загрузка связанных аниме"
    >
      <div className="mb-4 h-6 w-44 animate-pulse rounded bg-surface-dim" />
      <AnimeCardsHorizontalScrollSkeleton />
    </section>
  );
}

async function RelatedAnimePanelAsync({ shikimoriId }: { shikimoriId: number }) {
  const bundle = await getRelatedAnimesBundle(shikimoriId);
  return (
    <RelatedAnimePanel
      seasons={bundle.seasons}
      chronology={bundle.chronology}
      direct={bundle.direct}
      currentShikimoriId={shikimoriId}
    />
  );
}

export function RelatedAnimeSection({ shikimoriId }: { shikimoriId: number }) {
  return (
    <Suspense fallback={<RelatedAnimeSkeleton />}>
      <RelatedAnimePanelAsync shikimoriId={shikimoriId} />
    </Suspense>
  );
}
