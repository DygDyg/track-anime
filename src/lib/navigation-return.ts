import type { ReleaseItemDto, ReleasesCursor } from "@/lib/releases";

const NAV_RETURN_KEY = "ta:nav-return";
const FEED_STATE_PREFIX = "ta:feed:";
const MAX_AGE_MS = 30 * 60 * 1000;
/** Keep restore payloads under typical sessionStorage quotas (~5MB). */
const FEED_ITEMS_SOFT_MAX = 96;
const FEED_ITEMS_HARD_MAX = 48;
const FEED_DESCRIPTION_MAX = 240;

export const BEFORE_ANIME_NAV_EVENT = "ta:before-anime-nav";

export type NavReturnState = {
  path: string;
  scrollY: number;
  savedAt: number;
};

export type FeedPersistState = {
  items: ReleaseItemDto[];
  hasMore: boolean;
  nextCursor: ReleasesCursor | null;
};

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function currentDocumentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

export function saveNavReturn(): void {
  if (typeof window === "undefined") return;

  const state: NavReturnState = {
    path: currentDocumentPath(),
    scrollY: window.scrollY,
    savedAt: Date.now(),
  };
  trySetSessionItem(NAV_RETURN_KEY, JSON.stringify(state));
}

export function notifyBeforeAnimeNav(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BEFORE_ANIME_NAV_EVENT));
  saveNavReturn();
}

export function readNavReturn(): NavReturnState | null {
  if (typeof window === "undefined") return null;

  const state = readJson<NavReturnState>(sessionStorage.getItem(NAV_RETURN_KEY));
  if (!state) return null;
  if (Date.now() - state.savedAt > MAX_AGE_MS) {
    sessionStorage.removeItem(NAV_RETURN_KEY);
    return null;
  }
  return state;
}

export function consumeNavReturn(
  expectedPath: string,
  options?: { samePathname?: boolean },
): NavReturnState | null {
  const state = readNavReturn();
  if (!state) return null;

  if (state.path === expectedPath) {
    sessionStorage.removeItem(NAV_RETURN_KEY);
    return state;
  }

  if (options?.samePathname && typeof window !== "undefined") {
    try {
      const saved = new URL(state.path, window.location.origin);
      const expected = new URL(expectedPath, window.location.origin);
      if (saved.pathname === expected.pathname) {
        sessionStorage.removeItem(NAV_RETURN_KEY);
        return state;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function feedStateKey(path: string): string {
  return `${FEED_STATE_PREFIX}${path}`;
}

function slimFeedState(
  data: FeedPersistState,
  options: { maxItems: number | null; keepDescription: boolean },
): FeedPersistState {
  const truncated =
    options.maxItems != null && data.items.length > options.maxItems;
  const sourceItems =
    options.maxItems == null ? data.items : data.items.slice(0, options.maxItems);
  const items = sourceItems.map((item) => ({
    ...item,
    description:
      options.keepDescription && item.description
        ? item.description.slice(0, FEED_DESCRIPTION_MAX)
        : null,
  }));

  const last = items[items.length - 1];
  if (!truncated || !last) {
    return { items, hasMore: data.hasMore, nextCursor: data.nextCursor };
  }

  return {
    items,
    hasMore: true,
    // loadMore dedupes by id; prefer releases so skipped middle pages can refill.
    nextCursor: {
      phase: "releases",
      releasedAt: last.releasedAt,
      id: last.id,
    },
  };
}

function clearFeedStates(): void {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(FEED_STATE_PREFIX)) keys.push(key);
  }
  for (const key of keys) sessionStorage.removeItem(key);
}

function trySetSessionItem(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function saveFeedState(path: string, data: FeedPersistState): void {
  if (typeof window === "undefined") return;

  const key = feedStateKey(path);
  const attempts: FeedPersistState[] = [
    slimFeedState(data, { maxItems: null, keepDescription: true }),
    slimFeedState(data, { maxItems: null, keepDescription: false }),
    slimFeedState(data, { maxItems: FEED_ITEMS_SOFT_MAX, keepDescription: false }),
    slimFeedState(data, { maxItems: FEED_ITEMS_HARD_MAX, keepDescription: false }),
  ];

  for (const attempt of attempts) {
    if (trySetSessionItem(key, JSON.stringify(attempt))) return;
  }

  clearFeedStates();
  for (const attempt of attempts) {
    if (trySetSessionItem(key, JSON.stringify(attempt))) return;
  }
  // Give up quietly: nav-return scroll still works without feed snapshot.
}

export function consumeFeedState(path: string): FeedPersistState | null {
  if (typeof window === "undefined") return null;
  const key = feedStateKey(path);
  const state = readJson<FeedPersistState>(sessionStorage.getItem(key));
  if (!state) return null;
  sessionStorage.removeItem(key);
  return state;
}

export function consumePageRestore(
  path: string,
  options?: { samePathname?: boolean },
): { scrollY: number; feed: FeedPersistState | null; savedPath: string } | null {
  const nav = consumeNavReturn(path, options);
  if (!nav) return null;
  return {
    scrollY: nav.scrollY,
    feed: consumeFeedState(path),
    savedPath: nav.path,
  };
}

export function restoreScrollY(scrollY: number): void {
  const scroll = () => window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
  scroll();
  requestAnimationFrame(scroll);
  window.setTimeout(scroll, 50);
  window.setTimeout(scroll, 200);
}

export function canReturnInApp(): boolean {
  if (typeof window === "undefined") return false;
  const referrer = document.referrer;
  if (!referrer) return window.history.length > 1;
  try {
    return new URL(referrer).origin === window.location.origin;
  } catch {
    return window.history.length > 1;
  }
}
