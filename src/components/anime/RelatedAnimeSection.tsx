import { Suspense } from "react";
import { getRelatedAnimes } from "@/lib/anime-related";
import { RelatedAnimePanel } from "@/components/anime/RelatedAnimePanel";

function RelatedAnimeSkeleton() {
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-5"
      aria-busy="true"
      aria-label="Загрузка связанных аниме"
    >
      <div className="mb-4 h-6 w-44 animate-pulse rounded bg-surface-dim" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="aspect-[3/4] animate-pulse bg-surface-dim" />
            <div className="space-y-2 p-2.5">
              <div className="h-3 animate-pulse rounded bg-surface-dim" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-surface-dim" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function RelatedAnimePanelAsync({ shikimoriId }: { shikimoriId: number }) {
  const items = await getRelatedAnimes(shikimoriId);
  return <RelatedAnimePanel items={items} />;
}

export function RelatedAnimeSection({ shikimoriId }: { shikimoriId: number }) {
  return (
    <Suspense fallback={<RelatedAnimeSkeleton />}>
      <RelatedAnimePanelAsync shikimoriId={shikimoriId} />
    </Suspense>
  );
}
