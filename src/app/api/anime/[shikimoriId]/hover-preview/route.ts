import { NextResponse } from "next/server";
import { buildAnimeHoverPreview } from "@/lib/anime-hover-preview";

type RouteContext = {
  params: Promise<{ shikimoriId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { shikimoriId: rawId } = await context.params;
  const shikimoriId = Number(rawId);

  if (!Number.isFinite(shikimoriId) || shikimoriId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const preview = await buildAnimeHoverPreview(shikimoriId);
    if (!preview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(preview, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/anime/hover-preview]", shikimoriId, error);
    return NextResponse.json({ error: "Preview lookup failed" }, { status: 500 });
  }
}
