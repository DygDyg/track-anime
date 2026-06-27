import { type NextRequest, NextResponse } from "next/server";
import { isSearchFieldId } from "@/lib/search-fields";
import { suggestSearchFieldValues } from "@/lib/search-suggest";

const GENRE_SUGGEST_LIMIT = 500;

export async function GET(request: NextRequest) {
  const field = request.nextUrl.searchParams.get("field") ?? "";
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit")) || undefined;

  if (!isSearchFieldId(field)) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const limit =
    field === "genre"
      ? Math.min(GENRE_SUGGEST_LIMIT, Math.max(1, requestedLimit ?? GENRE_SUGGEST_LIMIT))
      : Math.min(20, Math.max(1, requestedLimit ?? 12));

  const items = await suggestSearchFieldValues(field, query, limit);

  return NextResponse.json(
    { field, query, items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  );
}
