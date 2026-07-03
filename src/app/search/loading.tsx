import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/ui/PageLoadingSkeleton";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy="true" aria-label="Загрузка поиска">
      <PageHeaderSkeleton titleWidth="w-40" />
      <div className="mb-6 h-24 animate-pulse rounded-xl border border-border bg-card" />
      <CardGridSkeleton count={18} />
    </div>
  );
}
