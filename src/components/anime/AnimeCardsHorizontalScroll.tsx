import type { ReactNode } from "react";

const ROW_CLASS =
  "anime-cards-scroll-row flex items-stretch gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:thin]";

const SLOT_CLASS =
  "flex w-[8.75rem] shrink-0 self-stretch snap-start sm:w-[9.75rem] md:w-[10.5rem]";

export function AnimeCardsHorizontalScroll({ children }: { children: ReactNode }) {
  return <div className={ROW_CLASS}>{children}</div>;
}

export function AnimeCardsHorizontalScrollSlot({ children }: { children: ReactNode }) {
  return <div className={SLOT_CLASS}>{children}</div>;
}

export function AnimeCardsHorizontalScrollSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={ROW_CLASS} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`${SLOT_CLASS} overflow-hidden rounded-xl border border-border bg-card`}>
          <div className="aspect-[3/4] animate-pulse bg-surface-dim" />
          <div className="space-y-2 p-2.5">
            <div className="h-[2.5rem] animate-pulse rounded bg-surface-dim" />
            <div className="h-[2.25rem] animate-pulse rounded bg-surface-dim" />
          </div>
        </div>
      ))}
    </div>
  );
}
