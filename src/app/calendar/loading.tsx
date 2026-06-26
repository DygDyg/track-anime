const RELEASE_GRID_CLASS =
  "flex flex-col gap-2 overflow-visible px-3 sm:px-6 md:grid md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:items-stretch md:gap-x-8 md:gap-y-4 md:px-12 md:overflow-visible lg:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] lg:gap-x-10 lg:px-16 xl:px-24";

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[3/4] animate-pulse bg-surface-dim" />
      <div className="space-y-2 p-2">
        <div className="h-3 animate-pulse rounded bg-surface-dim" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-dim" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-surface-dim" />
      </div>
    </div>
  );
}

function DaySkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <section className="overflow-visible">
      <div className="mb-3 flex items-center gap-3 px-3 sm:px-6 md:px-12 lg:px-16 xl:px-24">
        <div className="h-6 w-28 animate-pulse rounded-md bg-surface-dim sm:h-7 sm:w-36" />
        <div className="h-4 w-16 animate-pulse rounded bg-surface-dim" />
      </div>
      <div className={RELEASE_GRID_CLASS}>
        {Array.from({ length: cards }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}

export default function CalendarLoading() {
  return (
    <div className="py-5 sm:py-8" aria-busy="true" aria-label="Загрузка календаря">
      <header className="mb-6 px-3 sm:px-6 md:px-12 lg:px-16 xl:px-24">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-dim sm:h-9 sm:w-48" />
        <div className="mt-2 h-3 w-28 animate-pulse rounded bg-surface-dim" />
      </header>

      <div className="space-y-8 sm:space-y-10">
        <DaySkeleton cards={5} />
        <DaySkeleton cards={4} />
        <DaySkeleton cards={6} />
      </div>
    </div>
  );
}
