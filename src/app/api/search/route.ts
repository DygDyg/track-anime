import { type NextRequest, NextResponse } from "next/server";
import {
  SEARCH_PAGE_SIZE,
  searchAnimes,
  searchAnimesByGenre,
  serializeSearchResult,
} from "@/lib/search";

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get("genre")?.trim() ?? "";
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    48,
    Math.max(1, Number(request.nextUrl.searchParams.get("pageSize")) || SEARCH_PAGE_SIZE),
  );
  const includeTotal = request.nextUrl.searchParams.get("includeTotal") !== "0";

  const result = genre
    ? await searchAnimesByGenre(genre, page, pageSize, { includeTotal })
    : await searchAnimes(q, page, pageSize, { includeTotal });

  return NextResponse.json(
    {
      query: result.query,
      genre: result.genre,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      hasMore: result.hasMore,
      items: result.items.map(serializeSearchResult),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
