import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isFavoritesSyncStale, syncFavoritesWithShikimori } from "@/lib/favorites-sync";
import { ShikimoriAuthError } from "@/lib/shikimori/auth-client";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sync = await prisma.userListSync.findUnique({ where: { userId: session.user.id } });
  if (!isFavoritesSyncStale(sync?.lastSyncedAt)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await syncFavoritesWithShikimori(session.user.id, session.user.shikimoriId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ShikimoriAuthError) {
      return NextResponse.json({ error: "shikimori_auth" }, { status: 401 });
    }
    console.error("[favorites/sync]", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
