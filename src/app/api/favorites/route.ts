import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAllFavoritesData, serializeFavoriteAnimeItem } from "@/lib/favorites-page";
import { ShikimoriAuthError } from "@/lib/shikimori/auth-client";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const data = await getAllFavoritesData(session.user.id, session.user.shikimoriId);
    const tabs = Object.fromEntries(
      Object.entries(data.tabs).map(([key, items]) => [
        key,
        items.map(serializeFavoriteAnimeItem),
      ]),
    );

    return NextResponse.json({
      tabs,
      counts: data.counts,
      mangaCount: data.mangaBookmarkCount,
      sync: {
        stale: data.sync.stale,
        syncedAt: data.sync.syncedAt?.toISOString() ?? null,
        error: data.sync.error,
      },
    });
  } catch (err) {
    if (err instanceof ShikimoriAuthError) {
      return NextResponse.json({ error: "shikimori_auth" }, { status: 401 });
    }
    console.error("[favorites]", err);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
