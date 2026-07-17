"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { siteClass } from "@/components/site/site-styles";
import type { AdvancedSearchFilters } from "@/lib/search-fields";
import { buildSearchApiParams } from "@/lib/search-fields";
import type { SearchResultDto } from "@/lib/search-shared";

const LOAD_AHEAD_PX = 480;

type SearchResponse = {
  items: SearchResultDto[];
  page: number;
  hasMore: boolean;
  total: number;
};

type Props = {
  initialItems: SearchResultDto[];
  initialPage: number;
  initialHasMore: boolean;
  initialTotal: number;
  tab: "quick" | "advanced";
  query: string;
  genre: string | null;
  advancedFilters?: AdvancedSearchFilters;
  pageSize: number;
};

function mergeItems(current: SearchResultDto[], next: SearchResultDto[]): SearchResultDto[] {
  const ids = new Set(current.map((item) => item.shikimoriId));
  const appended = next.filter((item) => !ids.has(item.shikimoriId));
  return appended.length > 0 ? [...current, ...appended] : current;
}

export function SearchResultsInfiniteGrid({
  initialItems,
  initialPage,
  initialHasMore,
  initialTotal,
  tab,
  query,
  genre,
  advancedFilters,
  pageSize,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  const pageRef = useRef(initialPage);

  useEffect(() => {
    setItems(initialItems);
    setPage(initialPage);
    setHasMore(initialHasMore);
    setTotal(initialTotal);
    setError(null);
    pageRef.current = initialPage;
    hasMoreRef.current = initialHasMore;
  }, [initialItems, initialPage, initialHasMore, initialTotal]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const nextPage = pageRef.current + 1;
    const params = buildSearchApiParams({
      tab,
      query,
      genre,
      advancedFilters,
      page: nextPage,
      pageSize,
      includeTotal: false,
    });

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) throw new Error("Ошибка загрузки");

      const data = (await response.json()) as SearchResponse;
      setItems((current) => mergeItems(current, data.items));
      pageRef.current = data.page;
      hasMoreRef.current = data.hasMore;
      setPage(data.page);
      setHasMore(data.hasMore);
      if (data.total > 0) setTotal(data.total);
    } catch {
      setError("Не удалось загрузить результаты");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [advancedFilters, genre, pageSize, query, tab]);

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

    const timers = [0, 150, 400].map((ms) => window.setTimeout(checkNearEnd, ms));

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [checkNearEnd]);

  useLayoutEffect(() => {
    if (!loading) checkNearEnd();
  }, [items.length, loading, checkNearEnd]);

  return (
    <>
      <p className="text-sm text-muted">
        Показано: {items.length.toLocaleString("ru-RU")}
        {total > 0 ? ` из ${total.toLocaleString("ru-RU")}` : null}
      </p>

      <div className="search-results-grid flex flex-col gap-3">
        {items.map((item) => (
          <SearchResultCard key={item.shikimoriId} item={item} />
        ))}
      </div>

      <div className="flex min-h-14 flex-col items-center justify-center pt-4">
        <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
        {loading ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : error ? (
          <button type="button" onClick={() => void loadMore()} className={siteClass.textLink}>
            {error}. Повторить
          </button>
        ) : hasMore ? (
          <p className="text-sm text-muted">Прокрутите вниз для следующих результатов</p>
        ) : items.length > 0 ? (
          <p className="text-sm text-muted">Все результаты загружены</p>
        ) : null}
      </div>
    </>
  );
}
