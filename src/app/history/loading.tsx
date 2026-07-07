import { homeFeedGridClassName, homeFeedGutterX } from "@/lib/home-feed-layout";

export default function HistoryLoading() {
  return (
    <div className="py-6 sm:py-8" aria-busy="true" aria-label="Загрузка истории">
      <div className={`${homeFeedGutterX} mb-6`}>
        <div className="h-8 w-36 animate-pulse rounded-lg bg-surface-dim sm:h-9" />
      </div>
      <div className={`${homeFeedGutterX} mb-6`}>
        <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
      </div>
      <div className={`${homeFeedGridClassName} ${homeFeedGutterX}`}>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex gap-3 rounded-lg border border-border bg-card p-2 md:flex-col md:p-0">
            <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-md bg-surface-dim sm:h-[88px] sm:w-[88px] md:h-auto md:w-full md:rounded-none">
              <div className="aspect-[3/4] w-full" />
            </div>
            <div className="flex flex-1 flex-col gap-2 py-1 md:p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-dim" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-dim" />
              <div className="mt-auto h-2 w-full animate-pulse rounded bg-surface-dim" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
