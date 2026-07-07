import { NextRequest, NextResponse } from "next/server";
import { getAnimeCommentsPage } from "@/lib/anime-comments";

type RouteContext = {
  params: Promise<{ shikimoriId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { shikimoriId: rawId } = await context.params;
  const shikimoriId = Number(rawId);

  if (!Number.isFinite(shikimoriId) || shikimoriId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const pageRaw = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, Number(pageRaw) || 1);

  try {
    const data = await getAnimeCommentsPage(shikimoriId, page);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("[api/anime/comments]", shikimoriId, error);
    return NextResponse.json({ error: "Comments lookup failed" }, { status: 500 });
  }
}
