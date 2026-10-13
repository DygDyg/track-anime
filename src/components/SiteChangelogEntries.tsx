"use client";

import type {
  SiteChangelogEntry,
  SiteChangelogItemKind,
} from "@/lib/site-changelog-types";

const KIND_LABEL: Record<SiteChangelogItemKind, string> = {
  feature: "Новое",
  improvement: "Улучшение",
  change: "Изменение",
  fix: "Исправление",
};

const KIND_BADGE: Record<SiteChangelogItemKind, string> = {
  feature: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  improvement: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  change: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  fix: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function formatChangelogWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SiteChangelogEntryCard({ entry }: { entry: SiteChangelogEntry }) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {entry.title?.trim() || "Обновление сайта"}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{formatChangelogWhen(entry.recordedAt)}</p>
        </div>
        {entry.buildNumber != null ? (
          <span className="text-xs text-muted">сборка #{entry.buildNumber}</span>
        ) : null}
      </header>
      <ul className="space-y-2">
        {entry.items.map((item, index) => (
          <li key={`${entry.id}-${index}`} className="flex gap-2 text-sm text-foreground">
            <span
              className={[
                "inline-flex w-[7.25rem] shrink-0 items-center justify-center self-start rounded-md px-1.5 py-0.5 text-center text-[11px] font-medium ring-1 ring-inset",
                KIND_BADGE[item.kind],
              ].join(" ")}
            >
              {KIND_LABEL[item.kind]}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function SiteChangelogEntriesStack({
  entries,
  emptyText = "Пока нет завершённых обновлений",
}: {
  entries: SiteChangelogEntry[];
  emptyText?: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <SiteChangelogEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export async function fetchCompletedSiteChangelog(): Promise<SiteChangelogEntry[]> {
  const res = await fetch("/api/site-changelog", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { entries?: unknown };
  if (!Array.isArray(data.entries)) return [];
  return data.entries.filter(
    (entry): entry is SiteChangelogEntry =>
      typeof entry === "object" &&
      entry != null &&
      typeof (entry as SiteChangelogEntry).id === "string" &&
      typeof (entry as SiteChangelogEntry).recordedAt === "string" &&
      Array.isArray((entry as SiteChangelogEntry).items),
  );
}

export function isWhatsNewForceParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
