export default function HistoryLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label="Загрузка истории">
      <div className="mb-6 h-8 w-36 animate-pulse rounded-lg bg-surface-dim sm:h-9" />
      <div className="mb-6 h-32 animate-pulse rounded-xl border border-border bg-card" />
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex gap-3 rounded-xl border border-border bg-card p-3 sm:gap-4 sm:p-4">
            <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-lg bg-surface-dim sm:h-[88px] sm:w-[88px]" />
            <div className="flex flex-1 flex-col gap-2 py-1">
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
