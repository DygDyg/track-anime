import { getPublicUserByShikimoriId } from "@/lib/public-user";
import {
  buildFavoritesFromShikimoriPayload,
  getPublicFavoritesData,
  type FavoritesAllData,
} from "@/lib/favorites-page";
import type { FavoritesSyncPayload } from "@/lib/favorites-sync";
import {
  countAnimeBookmarks,
  countMangaBookmarks,
  fetchPublicUserAnimeRates,
  fetchPublicUserFavourites,
} from "@/lib/shikimori/public-lists";
import {
  fetchShikimoriUserById,
  type ShikimoriUserDetails,
} from "@/lib/shikimori/users";
import { LIST_STATUS_TABS } from "@/lib/shikimori/user-rates.types";
import { getUserProfileStats, type UserProfileStatsDto } from "@/lib/user-profile-stats";

export type ResolvedProfile = {
  shikimoriId: number;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
  memberSince: string | null;
  localUserId: string | null;
  onTrackAnime: boolean;
};

function emptyListCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tab of LIST_STATUS_TABS) {
    counts[tab] = 0;
  }
  return counts;
}

function averageFromScoreDistribution(
  rows: Array<{ name: string; value: number }> | undefined,
): { ratedCount: number; averageScore: number | null } {
  if (!rows?.length) {
    return { ratedCount: 0, averageScore: null };
  }

  let ratedCount = 0;
  let weighted = 0;
  for (const row of rows) {
    const score = Number(row.name);
    if (!Number.isFinite(score) || row.value <= 0) continue;
    ratedCount += row.value;
    weighted += score * row.value;
  }

  return {
    ratedCount,
    averageScore:
      ratedCount > 0 ? Math.round((weighted / ratedCount) * 10) / 10 : null,
  };
}

function statsFromShikimoriUser(
  user: ShikimoriUserDetails,
  bookmarkCount: number,
  mangaBookmarkCount: number,
): UserProfileStatsDto {
  const listCounts = emptyListCounts();
  let totalListEntries = 0;

  for (const row of user.stats?.full_statuses?.anime ?? []) {
    if (LIST_STATUS_TABS.includes(row.name as (typeof LIST_STATUS_TABS)[number])) {
      listCounts[row.name] = row.size;
      totalListEntries += row.size;
    }
  }

  const { ratedCount, averageScore } = averageFromScoreDistribution(user.stats?.scores?.anime);

  return {
    listSync: {
      lastSyncedAt: new Date().toISOString(),
      stale: false,
      error: null,
      cacheTtlMinutes: 10,
      mangaBookmarkCount,
    },
    listCounts,
    bookmarks: bookmarkCount,
    watchHistory: 0,
    totalListEntries,
    ratedCount,
    averageScore,
  };
}

export async function resolveUserProfile(
  shikimoriId: number,
): Promise<{ profile: ResolvedProfile; shikimori: ShikimoriUserDetails | null } | null> {
  const local = await getPublicUserByShikimoriId(shikimoriId);
  if (local) {
    return {
      profile: {
        shikimoriId: local.shikimoriId,
        nickname: local.nickname,
        avatar: local.avatar,
        isAdmin: local.isAdmin,
        memberSince: local.createdAt.toISOString(),
        localUserId: local.id,
        onTrackAnime: true,
      },
      shikimori: null,
    };
  }

  const shikimori = await fetchShikimoriUserById(shikimoriId);
  if (!shikimori) return null;

  return {
    profile: {
      shikimoriId: shikimori.id,
      nickname: shikimori.nickname,
      avatar: shikimori.avatar,
      isAdmin: false,
      memberSince: null,
      localUserId: null,
      onTrackAnime: false,
    },
    shikimori,
  };
}

export async function getResolvedProfileStats(
  profile: ResolvedProfile,
  shikimoriDetails?: ShikimoriUserDetails | null,
): Promise<{ stats: UserProfileStatsDto; source: "site" | "shikimori" }> {
  if (profile.onTrackAnime && profile.localUserId) {
    const cached = await getUserProfileStats(profile.localUserId);
    if (
      cached.totalListEntries > 0 ||
      cached.bookmarks > 0 ||
      cached.listSync.lastSyncedAt
    ) {
      return { stats: cached, source: "site" };
    }
  }

  const user =
    shikimoriDetails ??
    (await fetchShikimoriUserById(profile.shikimoriId));

  if (!user) {
    return {
      stats: {
        listSync: {
          lastSyncedAt: null,
          stale: true,
          error: null,
          cacheTtlMinutes: 10,
          mangaBookmarkCount: 0,
        },
        listCounts: emptyListCounts(),
        bookmarks: 0,
        watchHistory: 0,
        totalListEntries: 0,
        ratedCount: 0,
        averageScore: null,
      },
      source: "shikimori",
    };
  }

  const favourites = await fetchPublicUserFavourites(profile.shikimoriId);
  return {
    stats: statsFromShikimoriUser(
      user,
      countAnimeBookmarks(favourites),
      countMangaBookmarks(favourites),
    ),
    source: "shikimori",
  };
}

async function buildLiveShikimoriFavorites(
  shikimoriUserId: number,
): Promise<FavoritesAllData | null> {
  const [rates, favourites] = await Promise.all([
    fetchPublicUserAnimeRates(shikimoriUserId),
    fetchPublicUserFavourites(shikimoriUserId),
  ]);

  if (rates.length === 0 && countAnimeBookmarks(favourites) === 0) {
    return null;
  }

  const payload: FavoritesSyncPayload = {
    rates,
    favourites,
    mangaBookmarkCount: countMangaBookmarks(favourites),
    sync: {
      stale: false,
      syncedAt: new Date(),
      error: null,
    },
  };

  return buildFavoritesFromShikimoriPayload(payload);
}

export async function getResolvedUserFavorites(
  profile: ResolvedProfile,
): Promise<{ data: FavoritesAllData | null; source: "site" | "shikimori" }> {
  if (profile.localUserId) {
    const cached = await getPublicFavoritesData(profile.localUserId, profile.shikimoriId);
    if (cached) return { data: cached, source: "site" };
  }

  try {
    const data = await buildLiveShikimoriFavorites(profile.shikimoriId);
    return { data, source: "shikimori" };
  } catch (err) {
    console.error("[user-profile-resolver] live favorites failed:", err);
    return { data: null, source: "shikimori" };
  }
}
