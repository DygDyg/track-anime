"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReleaseCard } from "@/components/ReleaseCard";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import type { HomeTranslationFilter } from "@/lib/site-settings";
import { isHomeTranslationVisible } from "@/lib/site-settings";
import {
  BEFORE_ANIME_NAV_EVENT,
  consumePageRestore,
  restoreScrollY,
  saveFeedState,
} from "@/lib/navigation-return";
import type { ReleaseItemDto, ReleasesCursor } from "@/lib/releases";
import { homeFeedGridClassName, homeFeedGutterX } from "@/lib/home-feed-layout";

type Props = {
  initialItems: ReleaseItemDto[];
  initialHasMore: boolean;
  initialNextCursor: ReleasesCursor | null;
  pageSize?: number;
  /** id тайтлов, уже показанных выше (блок истории) */
  excludeIds?: string[];
};

const LOAD_AHEAD_PX = 1800;
const MAX_LOAD_MORE_PAGE_SIZE = 48;
const MAX_EMPTY_PAGES = 8;
const RELEASES_FETCH_TIMEOUT_MS = 20_000;
const HOME_PATH = "/";
const HOME_FEED_POLL_MS = 60_000;
const HOME_FEED_POLL_START_MS = 15_000;
const HOME_FEED_SCROLL_TOP_PX = 120;

type ReleasesPageResponse = {
  items: ReleaseItemDto[];
  hasMore: boolean;
  nextCursor: ReleasesCursor | null;
};

export function ReleaseFeed({
  initialItems,
  initialHasMore,
  initialNextCursor,
  pageSize = 24,
  excludeIds = [],
}: Props) {
  const { settings } = useSiteSettings();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const nextCursorRef = useRef(initialNextCursor);
  const hasMoreRef = useRef(initialHasMore);
  const loadingRef = useRef(false);
  const itemsRef = useRef(initialItems);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const persistFeed = useCallback(() => {
    saveFeedState(HOME_PATH, {
      items: itemsRef.current,
      hasMore: hasMoreRef.current,
      nextCursor: nextCursorRef.current,
    });
  }, []);

  useLayoutEffect(() => {
    const restored = consumePageRestore(HOME_PATH);
    if (!restored) return;

    if (restored.feed) {
      itemsRef.current = restored.feed.items;
      hasMoreRef.current = restored.feed.hasMore;
      nextCursorRef.current = restored.feed.nextCursor;
      setItems(restored.feed.items);
      setHasMore(restored.feed.hasMore);
    }

    restoreScrollY(restored.scrollY);
  }, []);

  useEffect(() => {
    window.addEventListener(BEFORE_ANIME_NAV_EVENT, persistFeed);
    return () => window.removeEventListener(BEFORE_ANIME_NAV_EVENT, persistFeed);
  }, [persistFeed]);

  const excludeIdSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !excludeIdSet.has(item.id) &&
          isHomeTranslationVisible(item.translationName, settings.homeTranslationFilter),
      ),
    [items, excludeIdSet, settings.homeTranslationFilter],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current || !nextCursorRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    let cursor = nextCursorRef.current;
    let emptyPages = 0;

    try {
      while (emptyPages < MAX_EMPTY_PAGES && cursor) {
        const loadPageSize = Math.min(MAX_LOAD_MORE_PAGE_SIZE, pageSize * 2);
        const params = new URLSearchParams({
          pageSize: String(loadPageSize),
          cursor: JSON.stringify(cursor),
        });
        const data = await fetchReleasesPage(params);

        const ids = new Set(itemsRef.current.map((i) => i.id));
        const fresh = data.items.filter((i) => !ids.has(i.id));

        if (fresh.length > 0) {
          const nextItems = [...itemsRef.current, ...fresh];
          itemsRef.current = nextItems;
          setItems(nextItems);
        }

        hasMoreRef.current = data.hasMore;
        nextCursorRef.current = data.nextCursor;
        setHasMore(data.hasMore);

        if (!data.hasMore || !data.nextCursor) break;

        const visibleCount = visibleItemsCount(itemsRef.current, settings.homeTranslationFilter);
        if (visibleCount >= pageSize) break;

        if (fresh.length === 0) {
          emptyPages += 1;
        } else {
          emptyPages = 0;
        }

        cursor = data.nextCursor;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [pageSize, settings.homeTranslationFilter]);

  const pollForNewReleases = useCallback(async () => {
    if (document.hidden) return;

    try {
      const params = new URLSearchParams({ pageSize: String(pageSize), live: "1" });
      const data = await fetchReleasesPage(params);

      const merged = mergeReleaseFeedHead(itemsRef.current, data.items);
      if (!releaseFeedHeadChanged(itemsRef.current, merged, pageSize)) return;

      const wasNearTop = window.scrollY <= HOME_FEED_SCROLL_TOP_PX;
      const prevScrollHeight = document.documentElement.scrollHeight;

      itemsRef.current = merged;
      setItems(merged);

      if (!wasNearTop) {
        requestAnimationFrame(() => {
          const delta = document.documentElement.scrollHeight - prevScrollHeight;
          if (delta > 0) {
            window.scrollTo({ top: window.scrollY + delta });
          }
        });
      }
    } catch {
      /* тихий polling */
    }
  }, [pageSize]);

  const pollForNewReleasesRef = useRef(pollForNewReleases);
  pollForNewReleasesRef.current = pollForNewReleases;

  useEffect(() => {
    let intervalId: number | undefined;

    const runPoll = () => {
      if (document.hidden) return;
      void pollForNewReleasesRef.current();
    };

    const startId = window.setTimeout(() => {
      runPoll();
      intervalId = window.setInterval(runPoll, HOME_FEED_POLL_MS);
    }, HOME_FEED_POLL_START_MS);

    const onVisibilityChange = () => {
      if (!document.hidden) runPoll();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(startId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const checkNearEnd = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;

    const el = sentinelRef.current;
    if (!el) return;

    const { top } = el.getBoundingClientRect();
    if (top <= window.innerHeight + LOAD_AHEAD_PX) {
      void loadMoreRef.current();
    }
  }, []);

  useEffect(() => {
    const onScroll = () => checkNearEnd();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const timers = [0, 150, 500, 1200].map((ms) => window.setTimeout(checkNearEnd, ms));

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [checkNearEnd]);

  useLayoutEffect(() => {
    if (!loading) checkNearEnd();
  }, [visibleItems.length, loading, checkNearEnd]);

  useEffect(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    if (visibleItems.length >= pageSize) return;
    void loadMoreRef.current();
  }, [visibleItems.length, pageSize, settings.homeTranslationFilter]);

  return (
    <>
      <div className={`${homeFeedGridClassName} ${homeFeedGutterX} md:overflow-visible`}>
        {visibleItems.map((release) => (
          <ReleaseCard key={release.id} release={release} />
        ))}
      </div>

      {visibleItems.length === 0 && !loading ? (
        <div className="mx-3 mt-4 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center sm:mx-6 lg:mx-8">
          <p className="text-sm text-muted">
            Нет серий для выбранных озвучек. Откройте настройки и отметьте нужные студии.
          </p>
        </div>
      ) : null}

      <div className="flex min-h-16 flex-col items-center justify-center px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
        {loading ? (
          <p className="text-sm text-muted">Загрузка...</p>
        ) : error ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="min-h-11 rounded-lg px-4 py-2 text-sm text-accent underline-offset-2 hover:underline"
          >
            {error}. Нажмите, чтобы повторить
          </button>
        ) : hasMore ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="min-h-11 rounded-lg px-4 py-2 text-sm text-muted transition hover:bg-card hover:text-foreground"
          >
            Загрузить ещё
          </button>
        ) : visibleItems.length > 0 ? (
          <p className="text-sm text-muted">Все серии загружены</p>
        ) : null}
      </div>
    </>
  );
}

async function fetchReleasesPage(params: URLSearchParams): Promise<ReleasesPageResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), RELEASES_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`/api/releases?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Не удалось загрузить серии");
    return (await res.json()) as ReleasesPageResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Загрузка заняла слишком много времени");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function visibleItemsCount(items: ReleaseItemDto[], filter: HomeTranslationFilter): number {
  return items.filter((item) => isHomeTranslationVisible(item.translationName, filter)).length;
}

/** Обновляет верх ленты по свежей первой странице, сохраняя подгруженный хвост. */
function mergeReleaseFeedHead(current: ReleaseItemDto[], latestPage: ReleaseItemDto[]): ReleaseItemDto[] {
  const latestIds = new Set(latestPage.map((item) => item.id));
  const tail = current.filter((item) => !latestIds.has(item.id));
  return [...latestPage, ...tail];
}

function releaseFeedHeadChanged(
  current: ReleaseItemDto[],
  merged: ReleaseItemDto[],
  compareCount: number,
): boolean {
  if (current.length !== merged.length) return true;

  const limit = Math.min(compareCount, current.length, merged.length);
  for (let index = 0; index < limit; index += 1) {
    const left = current[index];
    const right = merged[index];
    if (
      left.id !== right.id ||
      left.episodeNumber !== right.episodeNumber ||
      left.releasedAt !== right.releasedAt ||
      left.translationName !== right.translationName
    ) {
      return true;
    }
  }

  return false;
}
