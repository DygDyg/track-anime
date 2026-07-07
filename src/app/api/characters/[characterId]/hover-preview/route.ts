import { NextResponse } from "next/server";
import { buildCharacterHoverPreview } from "@/lib/shikimori/characters";

type RouteContext = {
  params: Promise<{ characterId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { characterId: rawId } = await context.params;
  const characterId = Number(rawId);

  if (!Number.isFinite(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const preview = await buildCharacterHoverPreview(characterId);
    if (!preview) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(preview, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[api/characters/hover-preview]", characterId, error);
    return NextResponse.json({ error: "Preview lookup failed" }, { status: 500 });
  }
}
