import type { Metadata } from "next";
import { SearchResultsView } from "@/components/search/SearchResultsView";
import { buildSitePageMetadata } from "@/lib/site-metadata";
import {
  advancedFiltersSummary,
  hasAdvancedFilters,
  parseAdvancedFiltersFromParams,
  parseSearchTab,
} from "@/lib/search-fields";
import {
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
  parseSearchSort,
  searchAnimesAdvanced,
  searchAnimesQuick,
} from "@/lib/search";
import { parseGenreList } from "@/lib/search-fields";

export const revalidate = 60;

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const tab = parseSearchTab(params.tab);

  if (tab === "advanced") {
    const filters = parseAdvancedFiltersFromParams(params);
    if (hasAdvancedFilters(filters)) {
      const summary = advancedFiltersSummary(filters);
      return buildSitePageMetadata({
        title: `${summary} — поиск`,
        description: `Результаты расширенного поиска: ${summary}`,
        canonicalPath: `/search?${new URLSearchParams(params as Record<string, string>).toString()}`,
      });
    }

    return buildSitePageMetadata({
      title: "Поиск по полям",
      description: "Расширенный поиск аниме по названию, жанру, году, студии и другим полям",
      canonicalPath: "/search?tab=advanced",
    });
  }

  const trimmedGenre = params.genre?.trim();
  const trimmedQuery = params.q?.trim();

  if (trimmedGenre) {
    return buildSitePageMetadata({
      title: `${trimmedGenre} — поиск`,
      description: `Аниме в жанре ${trimmedGenre}`,
      canonicalPath: `/search?genre=${encodeURIComponent(trimmedGenre)}`,
    });
  }

  if (trimmedQuery) {
    return buildSitePageMetadata({
      title: `${trimmedQuery} — поиск`,
      description: `Результаты поиска по запросу «${trimmedQuery}»`,
      canonicalPath: `/search?q=${encodeURIComponent(trimmedQuery)}`,
    });
  }

  return buildSitePageMetadata({
    title: "Поиск",
    description: "Поиск аниме по названию и жанрам",
    canonicalPath: "/search",
  });
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.min(SEARCH_MAX_PAGE, Math.max(1, Number(params.page) || 1));
  const tab = parseSearchTab(params.tab);
  const sort = parseSearchSort(params.sort);
  const trimmedGenre = params.genre?.trim() ?? "";
  const trimmedQuery = params.q?.trim() ?? "";
  const advancedFilters = parseAdvancedFiltersFromParams(params);

  let result;

  if (tab === "advanced") {
    result = await searchAnimesAdvanced(advancedFilters, page, SEARCH_PAGE_SIZE, { sort });
  } else if (trimmedQuery || parseGenreList(trimmedGenre).length > 0) {
    result = await searchAnimesQuick(trimmedQuery, trimmedGenre, page, SEARCH_PAGE_SIZE, { sort });
    result = { ...result, tab: "quick" as const };
  } else {
    result = {
      items: [],
      total: 0,
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      hasMore: false,
      query: trimmedQuery,
      genre: trimmedGenre || null,
      tab,
      sort,
    };
  }

  return <SearchResultsView result={result} />;
}
