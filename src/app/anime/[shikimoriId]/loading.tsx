function ContentPanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 shadow-lg shadow-black/40 sm:p-6 ${className}`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
        <div className="mx-auto aspect-[3/4] w-[200px] shrink-0 animate-pulse rounded-xl bg-surface-dim sm:mx-0 sm:w-[220px] md:w-[240px]" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded-lg bg-surface-dim sm:h-10" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-dim" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-7 w-20 animate-pulse rounded-full bg-surface-dim" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-6 w-16 animate-pulse rounded-md bg-surface-dim" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnimePageLoading() {
  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)]" aria-busy="true">
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative z-10 py-5 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6 px-3 sm:px-6 lg:px-8">
          <ContentPanelSkeleton />
          <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
        </div>
      </div>
    </div>
  );
}
