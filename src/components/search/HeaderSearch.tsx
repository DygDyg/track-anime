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
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimePoster } from "@/components/AnimePoster";
import { AnimeScoreBadge } from "@/components/AnimeScoreBadge";
import { useNavigationClick } from "@/components/NavigationProgress";
import { SearchResultMeta } from "@/components/search/SearchResultMeta";
import { headerControl } from "@/components/header/header-styles";
import { buildAdvancedSearchHref } from "@/lib/search-fields";
import { SEARCH_MIN_QUERY_LENGTH, buildSearchHref, type SearchResultDto } from "@/lib/search-shared";

const HEADER_SEARCH_LIMIT = 12;
const ADVANCED_SEARCH_HREF = buildAdvancedSearchHref({});
const SEARCH_PANEL_VIEWPORT_PADDING = 12;
/** sm breakpoint — совпадает с Tailwind */
const SEARCH_PANEL_MOBILE_MAX_WIDTH = 639;
/** Было 28rem (448px), +50% для десктопа */
const SEARCH_PANEL_DESKTOP_MAX_WIDTH = 672;

type SearchResponse = {
  total: number;
  items: SearchResultDto[];
};

type Props = {
  className?: string;
  onNavigate?: () => void;
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
          src={item.posterUrl ?? item.screenshotUrl}
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

export function HeaderSearch({ className = "", onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResultDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
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
    setItems([]);
    setTotal(0);
    setOpen(false);
    setLoading(false);
  }, []);

  const fetchResults = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const params = new URLSearchParams({
      q: trimmed,
      page: "1",
      pageSize: String(HEADER_SEARCH_LIMIT),
      includeTotal: "0",
    });

    try {
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok || requestId !== requestIdRef.current) return;

      const data = (await response.json()) as SearchResponse;
      if (requestId !== requestIdRef.current) return;

      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setTotal(0);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reset();
  }, [pathname, reset]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    if (query.trim().length < SEARCH_MIN_QUERY_LENGTH) {
      setItems([]);
      setTotal(0);
      setLoading(false);
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
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open || query.trim().length === 0) {
      setPanelRect(null);
      return;
    }

    updatePanelRect();
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);

    return () => {
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener("scroll", updatePanelRect, true);
    };
  }, [open, query, updatePanelRect, items.length, loading]);

  const handleSelect = () => {
    reset();
    onNavigate?.();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length >= SEARCH_MIN_QUERY_LENGTH) {
      reset();
      onNavigate?.();
      router.push(buildSearchHref({ q: trimmed }));
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setOpen(true);
    void fetchResults(query);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const trimmed = query.trim();
  const showPanel = open && trimmed.length > 0;
  const showHint = showPanel && trimmed.length < SEARCH_MIN_QUERY_LENGTH;
  const showEmpty = showPanel && trimmed.length >= SEARCH_MIN_QUERY_LENGTH && !loading && items.length === 0;
  const showResults = showPanel && trimmed.length >= SEARCH_MIN_QUERY_LENGTH && items.length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor={`${listboxId}-input`} className="sr-only">
          Поиск аниме
        </label>
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
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск аниме…"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={`${listboxId}-listbox`}
            aria-autocomplete="list"
            className={headerControl.searchInput}
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
          {loading ? (
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
      </form>

      {showPanel && panelRect ? (
        <div
          id={`${listboxId}-listbox`}
          role="listbox"
          style={{
            position: "fixed",
            top: panelRect.top,
            left: panelRect.left,
            width: panelRect.width,
            maxHeight: panelRect.maxHeight,
          }}
          className="site-search-panel z-[70] flex flex-col overflow-hidden rounded-xl border border-border shadow-lg"
        >
          {showHint ? (
            <p className="px-3 py-3 text-xs text-foreground/70">
              Введите минимум {SEARCH_MIN_QUERY_LENGTH} символа
            </p>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
              {Array.from({ length: 6 }, (_, index) => (
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
            <p className="px-3 py-3 text-sm text-foreground/80">Ничего не найдено</p>
          ) : null}

          {showResults ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {items.map((item) => (
                  <SearchResultRow key={item.shikimoriId} item={item} onSelect={handleSelect} />
                ))}
              </div>
              {total > items.length && items.length >= HEADER_SEARCH_LIMIT ? (
                <p className="shrink-0 border-t border-border bg-background px-3 py-2.5 text-xs text-foreground/70">
                  <Link
                    href={buildSearchHref({ q: trimmed })}
                    onClick={handleSelect}
                    className="font-medium text-accent hover:underline"
                  >
                    Показать все результаты
                  </Link>
                </p>
              ) : null}
            </>
          ) : null}

          <p className="shrink-0 border-t border-border bg-background px-3 py-2.5 text-xs text-foreground/70">
            <Link
              href={ADVANCED_SEARCH_HREF}
              onClick={handleSelect}
              className="font-medium text-accent hover:underline"
            >
              Подробный поиск
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
