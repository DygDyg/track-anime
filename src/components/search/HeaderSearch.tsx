"use client";

import { AnimeLink } from "@/components/AnimeLink";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { useNavigationClick, useNavigationPendingSetter } from "@/components/NavigationProgress";
import { SearchResultMeta } from "@/components/search/SearchResultMeta";
import { siteClass } from "@/components/site/site-styles";
import { buildAdvancedSearchHref } from "@/lib/search-fields";
import { getAlternateKeyboardLayoutQuery } from "@/lib/keyboard-layout";
import { useMobileKeyboardInset } from "@/hooks/useMobileKeyboardInset";
import { SEARCH_MIN_QUERY_LENGTH, HEADER_DESCRIPTION_SUPPLEMENT_THRESHOLD, buildSearchHref, type SearchResultDto } from "@/lib/search-shared";

const HEADER_SEARCH_LIMIT = 12;
const HEADER_SEARCH_INPUT_CLASS = `${siteClass.input} site-search-input !bg-card !pl-10 !pr-11 focus:ring-2 focus:ring-accent/25`;
const ADVANCED_SEARCH_HREF = buildAdvancedSearchHref({});
const SEARCH_PANEL_VIEWPORT_PADDING = 12;
/** sm breakpoint — совпадает с Tailwind */
const SEARCH_PANEL_MOBILE_MAX_WIDTH = 639;
/** Было 28rem (448px), +50% для десктопа */
const SEARCH_PANEL_DESKTOP_MAX_WIDTH = 672;

type SearchResponse = {
  total: number;
  items: SearchResultDto[];
  layoutCorrectedQuery?: string | null;
};

type Props = {
  className?: string;
  onNavigate?: () => void;
  autoFocus?: boolean;
  /** dropdown — шапка; bottom — мобильный sheet (поле под шапкой, результаты ниже вниз) */
  variant?: "dropdown" | "bottom";
  sheetOpen?: boolean;
};

function SearchResultRow({
  item,
  onSelect,
}: {
  item: SearchResultDto;
  onSelect: () => void;
}) {
  const href = `/anime/${item.shikimoriId}`;
  const handleClick = useNavigationClick(href, onSelect);

  return (
    <AnimeLink
      href={href}
      onClick={handleClick}
      className="flex items-center gap-4 rounded-lg px-2.5 py-2.5 transition hover:bg-surface-dim"
    >
      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-dim shadow-sm">
        <AnimePoster
          src={item.posterUrl}
          fallbackSrc={item.screenshotUrl}
          shikimoriId={item.shikimoriId}
          alt={item.title}
          className="h-full w-full object-cover"
        />
        <AnimeScoreBadge score={item.score} className="absolute right-0.5 top-0.5" size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base font-medium leading-snug text-foreground">{item.title}</p>
        {item.titleOriginal && item.titleOriginal !== item.title ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-muted">{item.titleOriginal}</p>
        ) : null}
        <SearchResultMeta item={item} className="mt-1" />
      </div>
    </AnimeLink>
  );
}

export function HeaderSearch({
  className = "",
  onNavigate,
  autoFocus = false,
  variant = "dropdown",
  sheetOpen = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const setNavPending = useNavigationPendingSetter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);

  const isBottomSheet = variant === "bottom";

  useMobileKeyboardInset(isBottomSheet && sheetOpen);

  const [query, setQuery] = useState("");
  const [layoutCorrectedQuery, setLayoutCorrectedQuery] = useState<string | null>(null);
  const [items, setItems] = useState<SearchResultDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandingSearch, setExpandingSearch] = useState(false);
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const updatePanelRect = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const viewportPadding = SEARCH_PANEL_VIEWPORT_PADDING;
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth <= SEARCH_PANEL_MOBILE_MAX_WIDTH;
    const top = rect.bottom + 6;
    const maxHeight = Math.max(280, window.innerHeight - top - viewportPadding);

    let width: number;
    let left: number;

    if (isMobile) {
      width = viewportWidth - viewportPadding * 2;
      left = viewportPadding;
    } else {
      const maxWidth = Math.min(
        SEARCH_PANEL_DESKTOP_MAX_WIDTH,
        viewportWidth - viewportPadding * 2,
      );
      width = Math.max(rect.width, maxWidth);
      left = rect.right - width;
      left = Math.max(viewportPadding, Math.min(left, viewportWidth - width - viewportPadding));
    }

    setPanelRect({
      top,
      left,
      width,
      maxHeight,
    });
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setLayoutCorrectedQuery(null);
    setItems([]);
    setTotal(0);
    setOpen(false);
    setLoading(false);
    setExpandingSearch(false);
  }, []);

  const fetchSearch = useCallback(async (params: URLSearchParams, signal: AbortSignal) => {
    const response = await fetch(`/api/search?${params.toString()}`, { signal });
    if (!response.ok) throw new Error("search failed");
    return (await response.json()) as SearchResponse;
  }, []);

  const fetchResults = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
      setItems([]);
      setTotal(0);
      setLayoutCorrectedQuery(null);
      setLoading(false);
      setExpandingSearch(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setExpandingSearch(false);
    setLayoutCorrectedQuery(null);

    const runSearch = async (searchValue: string) => {
      const titleParams = new URLSearchParams({
        q: searchValue,
        page: "1",
        pageSize: String(HEADER_SEARCH_LIMIT),
        includeTotal: "0",
      });

      const titleData = await fetchSearch(titleParams, controller.signal);
      if (requestId !== requestIdRef.current) return null;

      let mergedItems = titleData.items;
      let mergedTotal = titleData.total;

      if (titleData.items.length < HEADER_DESCRIPTION_SUPPLEMENT_THRESHOLD) {
        const needed = HEADER_SEARCH_LIMIT - titleData.items.length;
        if (needed > 0) {
          setExpandingSearch(true);

          const descriptionParams = new URLSearchParams({
            q: searchValue,
            page: "1",
            pageSize: String(needed),
            includeTotal: "0",
            descriptionOnly: "1",
          });
          if (titleData.items.length > 0) {
            descriptionParams.set(
              "excludeIds",
              titleData.items.map((item) => item.shikimoriId).join(","),
            );
          }

          try {
            const descriptionData = await fetchSearch(descriptionParams, controller.signal);
            if (requestId !== requestIdRef.current) return null;
            mergedItems = [...titleData.items, ...descriptionData.items];
            mergedTotal = mergedItems.length;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return null;
            if (requestId !== requestIdRef.current) return null;
          } finally {
            if (requestId === requestIdRef.current) setExpandingSearch(false);
          }
        }
      }

      return { items: mergedItems, total: mergedTotal };
    };

    try {
      const primary = await runSearch(trimmed);
      if (requestId !== requestIdRef.current || primary === null) return;

      if (primary.items.length > 0) {
        setItems(primary.items);
        setTotal(primary.total);
        setLoading(false);
        return;
      }

      const alternateQuery = getAlternateKeyboardLayoutQuery(trimmed);
      if (!alternateQuery) {
        setItems([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const corrected = await runSearch(alternateQuery);
      if (requestId !== requestIdRef.current || corrected === null) return;

      setItems(corrected.items);
      setTotal(corrected.total);
      setLayoutCorrectedQuery(corrected.items.length > 0 ? alternateQuery : null);
      setLoading(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setTotal(0);
      setLayoutCorrectedQuery(null);
      setLoading(false);
      setExpandingSearch(false);
    }
  }, [fetchSearch]);

  useEffect(() => {
    reset();
  }, [pathname, reset]);

  useEffect(() => {
    if (!autoFocus || !sheetOpen) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    const t = window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 350);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [autoFocus, sheetOpen]);

  useEffect(() => {
    if (!isBottomSheet || !sheetOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isBottomSheet, sheetOpen]);

  useEffect(() => {
    if (!isBottomSheet || !sheetOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        onNavigate?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isBottomSheet, sheetOpen, onNavigate]);

  useEffect(() => {
    if (!isBottomSheet) return;
    if (sheetOpen) {
      setOpen(true);
      return;
    }
    reset();
  }, [isBottomSheet, sheetOpen, reset]);

  useEffect(() => {
    const el = resultsScrollRef.current;
    if (!el || !isBottomSheet) return;
    el.scrollTop = 0;
  }, [items, loading, expandingSearch, isBottomSheet]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    if (query.trim().length < SEARCH_MIN_QUERY_LENGTH) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      setExpandingSearch(false);
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      void fetchResults(query);
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults]);

  useEffect(() => {
    if (isBottomSheet) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isBottomSheet]);

  useLayoutEffect(() => {
    if (isBottomSheet || !open || query.trim().length === 0) {
      if (!isBottomSheet) setPanelRect(null);
      return;
    }

    updatePanelRect();
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);

    return () => {
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener("scroll", updatePanelRect, true);
    };
  }, [open, query, updatePanelRect, items.length, loading, expandingSearch, isBottomSheet]);

  const handleSelect = () => {
    reset();
    onNavigate?.();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    const effectiveQuery = layoutCorrectedQuery ?? trimmed;
    if (effectiveQuery.length >= SEARCH_MIN_QUERY_LENGTH) {
      reset();
      onNavigate?.();
      setNavPending(true);
      startTransition(() => {
        router.push(buildSearchHref({ q: effectiveQuery }));
      });
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setOpen(true);
    void fetchResults(query);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      if (isBottomSheet) {
        onNavigate?.();
        return;
      }
      inputRef.current?.blur();
    }
  };

  const trimmed = query.trim();
  const effectiveQuery = layoutCorrectedQuery ?? trimmed;
  const showPanel = (isBottomSheet ? sheetOpen && open : open) && trimmed.length > 0;
  const showHint = showPanel && trimmed.length < SEARCH_MIN_QUERY_LENGTH;
  const showEmpty =
    showPanel && trimmed.length >= SEARCH_MIN_QUERY_LENGTH && !loading && !expandingSearch && items.length === 0;
  const showResults =
    showPanel && trimmed.length >= SEARCH_MIN_QUERY_LENGTH && (items.length > 0 || expandingSearch);
  const showSearchBusy = loading || expandingSearch;

  const searchInput = (
    <div className="relative">
      <input
        ref={inputRef}
        id={`${listboxId}-input`}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Поиск аниме…"
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={`${listboxId}-listbox`}
        aria-autocomplete="list"
        className={HEADER_SEARCH_INPUT_CLASS}
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" strokeLinecap="round" />
      </svg>
      {showSearchBusy ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center"
        >
          <span className="site-search-spinner inline-block h-4 w-4 rounded-full border-2 border-accent border-r-transparent" />
        </span>
      ) : (
        <Link
          href={ADVANCED_SEARCH_HREF}
          onClick={handleSelect}
          className="absolute inset-y-0 right-1.5 z-10 inline-flex w-8 items-center justify-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-accent"
          aria-label="Подробный поиск"
          title="Подробный поиск"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
        </Link>
      )}
    </div>
  );

  const resultsListbox = showPanel ? (
    <div
      id={`${listboxId}-listbox`}
      role="listbox"
      className={[
        "site-search-panel flex flex-col overflow-hidden",
        isBottomSheet
          ? "mobile-top-search-panel max-h-full min-h-0 flex flex-col overflow-hidden rounded-xl border border-border"
          : "z-[70] flex flex-col overflow-hidden rounded-xl border border-border shadow-lg",
      ].join(" ")}
      style={
        isBottomSheet
          ? undefined
          : panelRect
            ? {
                position: "fixed",
                top: panelRect.top,
                left: panelRect.left,
                width: panelRect.width,
                maxHeight: panelRect.maxHeight,
              }
            : undefined
      }
    >
      {showHint ? (
        <p className="shrink-0 px-3 py-3 text-xs text-foreground/70">
          Введите минимум {SEARCH_MIN_QUERY_LENGTH} символа
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <div
          ref={isBottomSheet ? resultsScrollRef : undefined}
          className={[
            "min-h-0 space-y-2 overflow-y-auto px-2 py-2",
            isBottomSheet ? "mobile-top-search-results overflow-y-auto" : "flex-1",
          ].join(" ")}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-2.5 py-2.5">
              <div className="h-24 w-16 animate-pulse rounded-lg bg-surface-dim" />
              <div className="flex-1 space-y-2">
                <div className="h-4 animate-pulse rounded bg-surface-dim" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-surface-dim" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <p className="shrink-0 px-3 py-3 text-sm text-foreground/80">Ничего не найдено</p>
      ) : null}

      {showResults ? (
        <>
          {layoutCorrectedQuery ? (
            <p className="shrink-0 border-b border-border px-3 py-2.5 text-xs text-foreground/80">
              По запросу «{trimmed}» ничего не найдено. Показаны результаты для «{layoutCorrectedQuery}»
              (исправлена раскладка клавиатуры).
            </p>
          ) : null}
          <div
            ref={isBottomSheet ? resultsScrollRef : undefined}
            className={[
              "min-h-0 overflow-y-auto p-2",
              isBottomSheet ? "mobile-top-search-results overflow-y-auto" : "flex-1",
            ].join(" ")}
          >
            {items.map((item) => (
              <SearchResultRow key={item.shikimoriId} item={item} onSelect={handleSelect} />
            ))}
            {expandingSearch ? (
              <p className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted">
                <span className="site-search-spinner inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-accent border-r-transparent" />
                Расширяю поиск…
              </p>
            ) : null}
          </div>
          {total > items.length && items.length >= HEADER_SEARCH_LIMIT ? (
            <p className="shrink-0 border-t border-border bg-background px-3 py-2.5 text-xs text-foreground/70">
              <Link
                href={buildSearchHref({ q: effectiveQuery })}
                onClick={handleSelect}
                className="font-medium text-accent hover:underline"
              >
                Показать все результаты
              </Link>
            </p>
          ) : null}
        </>
      ) : null}

      {!isBottomSheet ? (
        <p className="shrink-0 border-t border-border bg-background px-3 py-2.5 text-xs text-foreground/70">
          <Link
            href={ADVANCED_SEARCH_HREF}
            onClick={handleSelect}
            className="font-medium text-accent hover:underline"
          >
            Подробный поиск
          </Link>
        </p>
      ) : null}
    </div>
  ) : null;

  if (isBottomSheet) {
    return (
      <>
        {sheetOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[54] bg-background/60"
            aria-label="Закрыть поиск"
            onClick={() => onNavigate?.()}
          />
        ) : null}

        {sheetOpen ? (
          <div
            ref={rootRef}
            role="search"
            className="mobile-top-search-input-bar site-panel fixed inset-x-0 z-[56] rounded-none border-x-0 border-t-0 px-3 py-2.5"
          >
            <label htmlFor={`${listboxId}-input`} className="sr-only">
              Поиск аниме
            </label>
            <form onSubmit={handleSubmit}>{searchInput}</form>
          </div>
        ) : (
          <div ref={rootRef} className="hidden" aria-hidden />
        )}

        {sheetOpen ? (
          <div className="mobile-top-search-results-wrap pointer-events-none fixed inset-x-0 z-[55] flex flex-col px-3 pt-2">
            {resultsListbox ? <div className="pointer-events-auto min-h-0 max-h-full">{resultsListbox}</div> : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor={`${listboxId}-input`} className="sr-only">
          Поиск аниме
        </label>
        {searchInput}
      </form>

      {showPanel && panelRect ? resultsListbox : null}
    </div>
  );
}
