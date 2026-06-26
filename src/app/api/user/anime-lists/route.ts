import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  isFavoritesSyncStale,
  scheduleBackgroundUserAnimeListsSync,
} from "@/lib/favorites-sync";
import { prisma } from "@/lib/prisma";
import {
  getUserAnimeListStatusMap,
  serializeUserAnimeListMap,
} from "@/lib/user-anime-list-status";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ lists: {} });
  }

  const [map, sync] = await Promise.all([
    getUserAnimeListStatusMap(session.user.id),
    prisma.userListSync.findUnique({ where: { userId: session.user.id } }),
  ]);

  if (isFavoritesSyncStale(sync?.lastSyncedAt)) {
    scheduleBackgroundUserAnimeListsSync(session.user.id, session.user.shikimoriId);
  }

  return NextResponse.json({
    lists: serializeUserAnimeListMap(map),
  });
}
