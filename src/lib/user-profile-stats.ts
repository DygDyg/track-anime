import { prisma } from "@/lib/prisma";
import { isFavoritesSyncStale, LIST_SYNC_TTL_MS } from "@/lib/favorites-sync";
import { LIST_STATUS_TABS } from "@/lib/shikimori/user-rates.types";

export type UserProfileStatsDto = {
  listSync: {
    lastSyncedAt: string | null;
    stale: boolean;
    error: string | null;
    cacheTtlMinutes: number;
    mangaBookmarkCount: number;
  };
  listCounts: Record<string, number>;
  bookmarks: number;
  watchHistory: number;
  totalListEntries: number;
  ratedCount: number;
  averageScore: number | null;
};

export async function getUserProfileStats(userId: string): Promise<UserProfileStatsDto> {
  const [sync, statusGroups, bookmarks, watchHistory, scoreAgg] = await Promise.all([
    prisma.userListSync.findUnique({ where: { userId } }),
    prisma.userAnimeListEntry.groupBy({
      by: ["listStatus"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.userAnimeBookmark.count({ where: { userId } }),
    prisma.userWatchProgress.count({ where: { userId } }),
    prisma.userAnimeListEntry.aggregate({
      where: { userId, userScore: { gt: 0 } },
      _avg: { userScore: true },
      _count: { _all: true },
    }),
  ]);

  const listCounts: Record<string, number> = {};
  for (const tab of LIST_STATUS_TABS) {
    listCounts[tab] = 0;
  }
  let totalListEntries = 0;
  for (const row of statusGroups) {
    listCounts[row.listStatus] = row._count._all;
    totalListEntries += row._count._all;
  }

  const lastSyncedAt = sync?.lastSyncedAt ?? null;

  return {
    listSync: {
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      stale: isFavoritesSyncStale(lastSyncedAt),
      error: sync?.lastSyncError ?? null,
      cacheTtlMinutes: Math.round(LIST_SYNC_TTL_MS / 60_000),
      mangaBookmarkCount: sync?.mangaBookmarkCount ?? 0,
    },
    listCounts,
    bookmarks,
    watchHistory,
    totalListEntries,
    ratedCount: scoreAgg._count._all,
    averageScore:
      scoreAgg._avg.userScore != null ? Math.round(scoreAgg._avg.userScore * 10) / 10 : null,
  };
}
