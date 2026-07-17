import { NextRequest, NextResponse } from "next/server";
import {
  RELEASES_FEED_CACHE_SECONDS,
  RELEASES_FEED_STALE_WHILE_REVALIDATE_SECONDS,
  getRecentReleasesPage,
  getRecentReleasesPageLive,
  serializeRelease,
  type ReleasesCursor,
} from "@/lib/releases";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

function parseCursor(raw: string | null): ReleasesCursor | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ReleasesCursor>;
    if (typeof parsed.releasedAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    const phase = parsed.phase ?? "catalog";
    if (phase !== "releases" && phase !== "catalog") {
      return null;
    }
    return { phase, releasedAt: parsed.releasedAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  const cursor = parseCursor(searchParams.get("cursor"));
  const live = searchParams.get("live") === "1";

  const { items, hasMore, nextCursor } = live
    ? await getRecentReleasesPageLive(pageSize, cursor)
    : await getRecentReleasesPage(pageSize, cursor);

  return NextResponse.json(
    {
      items: items.map(serializeRelease),
      hasMore,
      nextCursor,
    },
    {
      headers: {
        "Cache-Control": live
          ? "private, no-store"
          : `public, s-maxage=${RELEASES_FEED_CACHE_SECONDS}, stale-while-revalidate=${RELEASES_FEED_STALE_WHILE_REVALIDATE_SECONDS}`,
      },
    },
  );
}
