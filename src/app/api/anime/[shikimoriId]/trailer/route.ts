import { NextRequest, NextResponse } from "next/server";
import { getYoutubeTrailerId } from "@/lib/shikimori/trailer";

type RouteContext = {
  params: Promise<{ shikimoriId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { shikimoriId: rawId } = await context.params;
  const shikimoriId = Number(rawId);

  if (!Number.isFinite(shikimoriId) || shikimoriId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const youtubeId = await getYoutubeTrailerId(shikimoriId);
    return NextResponse.json(
      { youtubeId },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("[api/anime/trailer]", shikimoriId, error);
    return NextResponse.json({ error: "Trailer lookup failed" }, { status: 500 });
  }
}
