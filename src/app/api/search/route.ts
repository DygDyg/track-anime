import { type NextRequest, NextResponse } from "next/server";
import { parseAdvancedFiltersFromParams, parseSearchTab } from "@/lib/search-fields";
import { parseExcludeShikimoriIds } from "@/lib/search-shared";
import {
  SEARCH_PAGE_SIZE,
  searchAnimesAdvanced,
  searchAnimesByDescription,
  searchAnimesQuick,
  serializeSearchResult,
} from "@/lib/search";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tab = parseSearchTab(params.get("tab"));
  const genre = params.get("genre")?.trim() ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(
    48,
    Math.max(1, Number(params.get("pageSize")) || SEARCH_PAGE_SIZE),
  );
  const includeTotal = params.get("includeTotal") !== "0";
  const descriptionOnly = params.get("descriptionOnly") === "1";
  const excludeShikimoriIds = parseExcludeShikimoriIds(params.get("excludeIds"));

  const result = descriptionOnly
    ? await searchAnimesByDescription(q, page, pageSize, excludeShikimoriIds, { includeTotal })
    : tab === "advanced"
      ? await searchAnimesAdvanced(parseAdvancedFiltersFromParams(params), page, pageSize, {
          includeTotal,
        })
      : await searchAnimesQuick(q, genre, page, pageSize, { includeTotal });

  return NextResponse.json(
    {
      query: result.query,
      layoutCorrectedQuery: result.layoutCorrectedQuery ?? null,
      genre: result.genre,
      tab: result.tab ?? "quick",
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
