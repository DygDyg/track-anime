export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="aspect-[3/4] animate-pulse bg-surface-dim" />
          <div className="space-y-2 p-2">
            <div className="h-3 animate-pulse rounded bg-surface-dim" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-dim" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton({ titleWidth = "w-48" }: { titleWidth?: string }) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className={`h-8 animate-pulse rounded-lg bg-surface-dim sm:h-9 ${titleWidth}`} />
      <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-surface-dim" />
    </div>
  );
}
