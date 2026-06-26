"use client";

import { AnimeLink } from "@/components/AnimeLink";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimePoster } from "@/components/AnimePoster";
import { useNavigationClick } from "@/components/NavigationProgress";
import { headerControl } from "@/components/header/header-styles";
import { labelKind, labelStatus } from "@/lib/anime-labels";
import { SEARCH_MIN_QUERY_LENGTH, buildSearchHref, type SearchResultDto } from "@/lib/search-shared";

const HEADER_SEARCH_LIMIT = 8;

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
  const kindLabel = labelKind(item.kind);
  const statusLabel = labelStatus(item.status);

  return (
    <AnimeLink
      href={href}
      onClick={handleClick}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-surface-dim"
    >
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface-dim">
        <AnimePoster
          src={item.posterUrl ?? item.screenshotUrl}
          shikimoriId={item.shikimoriId}
          alt={item.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {item.titleOriginal && item.titleOriginal !== item.title ? (
          <p className="truncate text-xs text-muted">{item.titleOriginal}</p>
        ) : (
          <p className="truncate text-xs text-muted">
            {[statusLabel, kindLabel, item.year].filter(Boolean).join(" · ") || "Аниме"}
          </p>
        )}
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

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResultDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

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
    setLoading(true);

    const params = new URLSearchParams({
      q: trimmed,
      page: "1",
      pageSize: String(HEADER_SEARCH_LIMIT),
      includeTotal: "0",
    });

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok || requestId !== requestIdRef.current) return;

      const data = (await response.json()) as SearchResponse;
      if (requestId !== requestIdRef.current) return;

      setItems(data.items);
      setTotal(data.total);
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
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-accent border-r-transparent"
            />
          ) : null}
        </div>
      </form>

      {showPanel ? (
        <div
          id={`${listboxId}-listbox`}
          role="listbox"
          className="site-search-panel absolute right-0 top-[calc(100%+0.35rem)] z-[60] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border"
        >
          {showHint ? (
            <p className="px-3 py-3 text-xs text-foreground/70">
              Введите минимум {SEARCH_MIN_QUERY_LENGTH} символа
            </p>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="space-y-2 px-2 py-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-2 py-2">
                  <div className="h-12 w-9 animate-pulse rounded-md bg-surface-dim" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 animate-pulse rounded bg-surface-dim" />
                    <div className="h-2.5 w-2/3 animate-pulse rounded bg-surface-dim" />
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
              <div className="max-h-80 overflow-y-auto p-1">
                {items.map((item) => (
                  <SearchResultRow key={item.shikimoriId} item={item} onSelect={handleSelect} />
                ))}
              </div>
              {total > items.length && items.length >= HEADER_SEARCH_LIMIT ? (
                <p className="border-t border-border bg-background px-3 py-2 text-xs text-foreground/70">
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
        </div>
      ) : null}
    </div>
  );
}
