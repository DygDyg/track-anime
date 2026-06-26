export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_PAGE_SIZE = 24;

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
};

export function buildSearchHref(input: { q?: string; genre?: string; page?: number }): string {
  const params = new URLSearchParams();
  const genre = input.genre?.trim();
  const query = input.q?.trim();

  if (genre) params.set("genre", genre);
  else if (query) params.set("q", query);

  if (input.page && input.page > 1) params.set("page", String(input.page));

  const serialized = params.toString();
  return serialized ? `/search?${serialized}` : "/search";
}
