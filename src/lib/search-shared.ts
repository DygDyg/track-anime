import type { AdvancedSearchFilters } from "@/lib/search-fields";

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_PAGE_SIZE = 24;

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
