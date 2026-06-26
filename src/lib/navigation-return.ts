import type { ReleaseItemDto, ReleasesCursor } from "@/lib/releases";

const NAV_RETURN_KEY = "ta:nav-return";
const FEED_STATE_PREFIX = "ta:feed:";
const MAX_AGE_MS = 30 * 60 * 1000;

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
  sessionStorage.setItem(NAV_RETURN_KEY, JSON.stringify(state));
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

export function consumeNavReturn(expectedPath: string): NavReturnState | null {
  const state = readNavReturn();
  if (!state || state.path !== expectedPath) return null;
  sessionStorage.removeItem(NAV_RETURN_KEY);
  return state;
}

function feedStateKey(path: string): string {
  return `${FEED_STATE_PREFIX}${path}`;
}

export function saveFeedState(path: string, data: FeedPersistState): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(feedStateKey(path), JSON.stringify(data));
}

export function consumeFeedState(path: string): FeedPersistState | null {
  if (typeof window === "undefined") return null;
  const key = feedStateKey(path);
  const state = readJson<FeedPersistState>(sessionStorage.getItem(key));
  if (!state) return null;
  sessionStorage.removeItem(key);
  return state;
}

export function consumePageRestore(path: string): { scrollY: number; feed: FeedPersistState | null } | null {
  const nav = consumeNavReturn(path);
  if (!nav) return null;
  return {
    scrollY: nav.scrollY,
    feed: consumeFeedState(path),
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
