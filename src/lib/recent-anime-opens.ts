export const RECENT_ANIME_OPENS_STORAGE_KEY = "track-anime-recent-opens";
export const RECENT_ANIME_OPENS_CHANGED_EVENT = "track-anime-recent-opens-changed";
export const RECENT_ANIME_OPENS_MAX = 300;

export type RecentAnimeOpenEntry = {
  shikimoriId: number;
  title: string;
  openedAt: string;
};

export function isRecentAnimeOpenEntry(value: unknown): value is RecentAnimeOpenEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecentAnimeOpenEntry>;
  return (
    typeof item.shikimoriId === "number" &&
    Number.isInteger(item.shikimoriId) &&
    item.shikimoriId > 0 &&
    typeof item.title === "string" &&
    item.title.length > 0 &&
    typeof item.openedAt === "string"
  );
}

function sortByOpenedAtDesc(items: RecentAnimeOpenEntry[]): RecentAnimeOpenEntry[] {
  return [...items].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  );
}

export function readRecentAnimeOpens(): RecentAnimeOpenEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(RECENT_ANIME_OPENS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortByOpenedAtDesc(parsed.filter(isRecentAnimeOpenEntry));
  } catch {
    return [];
  }
}

export function emitRecentAnimeOpensChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECENT_ANIME_OPENS_CHANGED_EVENT));
}

export function recordRecentAnimeOpen(shikimoriId: number, title: string): void {
  if (typeof window === "undefined") return;

  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;

  try {
    const now = new Date().toISOString();
    const existing = readRecentAnimeOpens().filter((item) => item.shikimoriId !== shikimoriId);
    const next = [{ shikimoriId, title: trimmedTitle, openedAt: now }, ...existing].slice(
      0,
      RECENT_ANIME_OPENS_MAX,
    );

    localStorage.setItem(RECENT_ANIME_OPENS_STORAGE_KEY, JSON.stringify(next));
    emitRecentAnimeOpensChanged();
  } catch {
    /* ignore quota / private mode */
  }
}

export function formatRecentAnimeOpenedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function writeRecentAnimeOpens(items: RecentAnimeOpenEntry[]): void {
  if (typeof window === "undefined") return;

  try {
    const next = sortByOpenedAtDesc(items).slice(0, RECENT_ANIME_OPENS_MAX);
    localStorage.setItem(RECENT_ANIME_OPENS_STORAGE_KEY, JSON.stringify(next));
    emitRecentAnimeOpensChanged();
  } catch {
    /* ignore quota / private mode */
  }
}

export async function fetchRemoteRecentAnimeOpens(): Promise<RecentAnimeOpenEntry[] | null> {
  const res = await fetch("/api/user/recent-anime-opens", { cache: "no-store" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load recent anime opens");
  const data = (await res.json()) as { items?: unknown };
  if (!Array.isArray(data.items)) return [];
  return sortByOpenedAtDesc(data.items.filter(isRecentAnimeOpenEntry));
}

export async function saveRemoteRecentAnimeOpen(
  shikimoriId: number,
  title: string,
): Promise<void> {
  const res = await fetch("/api/user/recent-anime-opens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shikimoriId, title }),
  });
  if (!res.ok && res.status !== 401) {
    throw new Error("Failed to save recent anime open");
  }
}

export async function syncRemoteRecentAnimeOpens(
  localItems: RecentAnimeOpenEntry[],
): Promise<RecentAnimeOpenEntry[] | null> {
  const res = await fetch("/api/user/recent-anime-opens", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: localItems }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to sync recent anime opens");
  const data = (await res.json()) as { items?: unknown };
  if (!Array.isArray(data.items)) return [];
  return sortByOpenedAtDesc(data.items.filter(isRecentAnimeOpenEntry));
}
