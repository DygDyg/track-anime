import type { Metadata } from "next";
import { SearchResultsView } from "@/components/search/SearchResultsView";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  searchAnimes,
  searchAnimesByGenre,
} from "@/lib/search";

export const revalidate = 60;

type Props = {
  searchParams: Promise<{ q?: string; genre?: string; page?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q, genre } = await searchParams;
  const trimmedGenre = genre?.trim();
  const trimmedQuery = q?.trim();

  if (trimmedGenre) {
    return {
      title: `${trimmedGenre} — поиск — Track Anime`,
      description: `Аниме в жанре ${trimmedGenre}`,
    };
  }

  if (trimmedQuery) {
    return {
      title: `${trimmedQuery} — поиск — Track Anime`,
      description: `Результаты поиска по запросу «${trimmedQuery}»`,
    };
  }

  return {
    title: "Поиск — Track Anime",
    description: "Поиск аниме по названию и жанрам",
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, genre, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const trimmedGenre = genre?.trim() ?? "";
  const trimmedQuery = q?.trim() ?? "";

  let result;

  if (trimmedGenre.length >= SEARCH_MIN_QUERY_LENGTH) {
    result = await searchAnimesByGenre(trimmedGenre, page, SEARCH_PAGE_SIZE);
  } else if (trimmedQuery.length >= SEARCH_MIN_QUERY_LENGTH) {
    result = await searchAnimes(trimmedQuery, page, SEARCH_PAGE_SIZE);
  } else {
    result = {
      items: [],
      total: 0,
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      hasMore: false,
      query: trimmedQuery,
      genre: trimmedGenre || null,
    };
  }

  return <SearchResultsView result={result} />;
}
