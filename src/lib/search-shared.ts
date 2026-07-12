import type { AdvancedSearchFilters } from "@/lib/search-fields";

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_PAGE_SIZE = 24;
export const DEFAULT_HEADER_SEARCH_DEBOUNCE_MS = 1500;
export const MIN_HEADER_SEARCH_DEBOUNCE_MS = 500;
export const MAX_HEADER_SEARCH_DEBOUNCE_MS = 5000;
/** Меньше этого числа title-совпадений в шапке — второй запрос по описанию. */
export const HEADER_DESCRIPTION_SUPPLEMENT_THRESHOLD = 10;

export function parseExcludeShikimoriIds(value: string | null | undefined): number[] {
  if (!value?.trim()) return [];

  const seen = new Set<number>();
  const result: number[] = [];

  for (const part of value.split(",")) {
    const id = Number(part.trim());
    if (!Number.isFinite(id) || id <= 0) continue;
    const normalized = Math.floor(id);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function escapeIlikePattern(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

export type SearchResult = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  year: number | null;
  posterUrl: string | null;
  screenshotUrl: string | null;
  status: string | null;
  kind: string | null;
  episodes: number | null;
  score: string | null;
};

export type SearchResultDto = SearchResult;

export type SearchPage = {
  items: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  query: string;
  genre: string | null;
  /** Запрос с исправленной раскладкой, если по исходному ничего не найдено. */
  layoutCorrectedQuery?: string | null;
  tab?: "quick" | "advanced";
  advancedFilters?: AdvancedSearchFilters;
};

export function buildSearchHref(input: {
  q?: string;
  genre?: string;
  page?: number;
  tab?: "quick" | "advanced";
}): string {
  const params = new URLSearchParams();
  const tab = input.tab ?? "quick";
  if (tab === "advanced") params.set("tab", "advanced");
  const genre = input.genre?.trim();
  const query = input.q?.trim();

  if (genre) params.set("genre", genre);
  if (query) params.set("q", query);

  if (input.page && input.page > 1) params.set("page", String(input.page));

  const serialized = params.toString();
  return serialized ? `/search?${serialized}` : "/search";
}
