import { NextRequest, NextResponse } from "next/server";
import { getRecentReleasesPageLive, serializeRelease, type ReleasesCursor } from "@/lib/releases";

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

  const { items, hasMore, nextCursor } = await getRecentReleasesPageLive(pageSize, cursor);

  return NextResponse.json(
    {
      items: items.map(serializeRelease),
      hasMore,
      nextCursor,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
