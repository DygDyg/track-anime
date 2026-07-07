import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/ui/PageLoadingSkeleton";

export default function FavoritesLoading() {
  return (
    <div className="py-5 sm:py-8" aria-busy="true" aria-label="Загрузка избранного">
      <div className="mx-3 sm:mx-6 lg:mx-8">
        <PageHeaderSkeleton titleWidth="w-44" />
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-9 w-24 animate-pulse rounded-lg bg-surface-dim" />
          ))}
        </div>
        <CardGridSkeleton count={16} />
      </div>
    </div>
  );
}
