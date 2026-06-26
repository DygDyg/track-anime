import { prisma } from "@/lib/prisma";
import {
  fetchUserFavourites,
  type ShikimoriFavouritesResponse,
} from "@/lib/shikimori/favorites";
import { ShikimoriAuthError } from "@/lib/shikimori/auth-client";
import {
  fetchUserAnimeRates,
  type ShikimoriUserRate,
} from "@/lib/shikimori/user-rates";

export type FavoritesSyncStatus = {
  stale: boolean;
  syncedAt: Date | null;
  error: string | null;
};

export type FavoritesSyncPayload = {
  rates: ShikimoriUserRate[];
  favourites: ShikimoriFavouritesResponse;
  mangaBookmarkCount: number;
  sync: FavoritesSyncStatus;
};

export type FavoritesPayloadLoadResult = {
  payload: FavoritesSyncPayload;
  shouldBackgroundSync: boolean;
};

export const LIST_SYNC_TTL_MS = 5 * 60 * 1000;
const PERSIST_CHUNK_SIZE = 100;

function parseShikimoriDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function entryToRate(
  entry: {
    shikimoriId: number;
    shikimoriRateId: number | null;
    listStatus: string;
    userScore: number;
    watchedEpisodes: number;
    addedAt: Date | null;
    listUpdatedAt: Date | null;
  },
  shikimoriUserId: number,
): ShikimoriUserRate {
  return {
    id: entry.shikimoriRateId ?? 0,
    user_id: shikimoriUserId,
    target_id: entry.shikimoriId,
    target_type: "Anime",
    score: entry.userScore,
    status: entry.listStatus,
    episodes: entry.watchedEpisodes,
    rewatches: 0,
    created_at: entry.addedAt?.toISOString() ?? null,
    updated_at: entry.listUpdatedAt?.toISOString() ?? entry.addedAt?.toISOString() ?? null,
  };
}

export function isFavoritesSyncStale(lastSyncedAt: Date | null | undefined): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - lastSyncedAt.getTime() >= LIST_SYNC_TTL_MS;
}

async function upsertRatesChunk(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  rates: ShikimoriUserRate[],
): Promise<void> {
  await Promise.all(
    rates.map((rate) =>
      tx.userAnimeListEntry.upsert({
        where: {
          userId_shikimoriId: { userId, shikimoriId: rate.target_id },
        },
        create: {
          userId,
          shikimoriId: rate.target_id,
          shikimoriRateId: rate.id,
          listStatus: rate.status,
          userScore: rate.score,
          watchedEpisodes: rate.episodes,
          addedAt: parseShikimoriDate(rate.created_at),
          listUpdatedAt: parseShikimoriDate(rate.updated_at),
        },
        update: {
          shikimoriRateId: rate.id,
          listStatus: rate.status,
          userScore: rate.score,
          watchedEpisodes: rate.episodes,
          addedAt: parseShikimoriDate(rate.created_at),
          listUpdatedAt: parseShikimoriDate(rate.updated_at),
        },
      }),
    ),
  );
}

async function persistFavoritesSnapshot(
  userId: string,
  rates: ShikimoriUserRate[],
  favourites: ShikimoriFavouritesResponse,
): Promise<void> {
  const bookmarkIds = (favourites.animes ?? []).map((item) => item.id);
  const rateIds = rates.map((rate) => rate.target_id);
  const mangaBookmarkCount = (favourites.mangas?.length ?? 0) + (favourites.ranobe?.length ?? 0);

  await prisma.$transaction(async (tx) => {
    if (rateIds.length > 0) {
      await tx.userAnimeListEntry.deleteMany({
        where: { userId, shikimoriId: { notIn: rateIds } },
      });
    } else {
      await tx.userAnimeListEntry.deleteMany({ where: { userId } });
    }

    for (let i = 0; i < rates.length; i += PERSIST_CHUNK_SIZE) {
      await upsertRatesChunk(tx, userId, rates.slice(i, i + PERSIST_CHUNK_SIZE));
    }

    if (bookmarkIds.length > 0) {
      await tx.userAnimeBookmark.deleteMany({
        where: { userId, shikimoriId: { notIn: bookmarkIds } },
      });
      await tx.userAnimeBookmark.createMany({
        data: bookmarkIds.map((shikimoriId) => ({ userId, shikimoriId })),
        skipDuplicates: true,
      });
    } else {
      await tx.userAnimeBookmark.deleteMany({ where: { userId } });
    }

    await tx.userListSync.upsert({
      where: { userId },
      create: {
        userId,
        lastSyncedAt: new Date(),
        lastSyncError: null,
        mangaBookmarkCount,
      },
      update: {
        lastSyncedAt: new Date(),
        lastSyncError: null,
        mangaBookmarkCount,
      },
    });
  });
}

export async function loadFavoritesPayloadFromDb(
  userId: string,
  shikimoriUserId: number,
): Promise<FavoritesSyncPayload | null> {
  const [entries, bookmarks, sync] = await Promise.all([
    prisma.userAnimeListEntry.findMany({ where: { userId } }),
    prisma.userAnimeBookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.userListSync.findUnique({ where: { userId } }),
  ]);

  if (entries.length === 0 && bookmarks.length === 0) {
    return null;
  }

  return {
    rates: entries.map((entry) => entryToRate(entry, shikimoriUserId)),
    favourites: {
      animes: bookmarks.map((bookmark) => ({ id: bookmark.shikimoriId, name: "" })),
    },
    mangaBookmarkCount: sync?.mangaBookmarkCount ?? 0,
    sync: {
      stale: isFavoritesSyncStale(sync?.lastSyncedAt),
      syncedAt: sync?.lastSyncedAt ?? null,
      error: sync?.lastSyncError ?? null,
    },
  };
}

function syncErrorMessage(err: unknown): string {
  if (err instanceof ShikimoriAuthError) {
    return "Не удалось авторизоваться в Shikimori";
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Shikimori недоступен";
}

export async function getFavoritesPayloadForPage(
  userId: string,
  shikimoriUserId: number,
): Promise<FavoritesPayloadLoadResult> {
  const cached = await loadFavoritesPayloadFromDb(userId, shikimoriUserId);

  if (cached) {
    return {
      payload: cached,
      shouldBackgroundSync: cached.sync.stale && !cached.sync.error,
    };
  }

  const synced = await syncFavoritesWithShikimori(userId, shikimoriUserId);
  return {
    payload: synced,
    shouldBackgroundSync: false,
  };
}

export async function ensureUserAnimeListsSynced(
  userId: string,
  shikimoriUserId: number,
  options?: { force?: boolean },
): Promise<void> {
  if (!options?.force) {
    const sync = await prisma.userListSync.findUnique({ where: { userId } });
    const cached = await loadFavoritesPayloadFromDb(userId, shikimoriUserId);

    if (cached && !isFavoritesSyncStale(sync?.lastSyncedAt)) {
      return;
    }
  }

  await syncFavoritesWithShikimori(userId, shikimoriUserId);
}

const backgroundListSyncInFlight = new Set<string>();

/** Синхронизация списков в фоне — не блокирует ответ API. */
export function scheduleBackgroundUserAnimeListsSync(
  userId: string,
  shikimoriUserId: number,
): void {
  if (backgroundListSyncInFlight.has(userId)) return;

  backgroundListSyncInFlight.add(userId);
  void (async () => {
    try {
      await ensureUserAnimeListsSynced(userId, shikimoriUserId);
    } catch (error) {
      console.error("[favorites-sync] background sync failed:", error);
    } finally {
      backgroundListSyncInFlight.delete(userId);
    }
  })();
}

export async function syncFavoritesWithShikimori(
  userId: string,
  shikimoriUserId: number,
): Promise<FavoritesSyncPayload> {
  try {
    const [favourites, rates] = await Promise.all([
      fetchUserFavourites(userId, shikimoriUserId),
      fetchUserAnimeRates(userId, shikimoriUserId),
    ]);

    await persistFavoritesSnapshot(userId, rates, favourites);

    const mangaBookmarkCount = (favourites.mangas?.length ?? 0) + (favourites.ranobe?.length ?? 0);

    return {
      rates,
      favourites,
      mangaBookmarkCount,
      sync: {
        stale: false,
        syncedAt: new Date(),
        error: null,
      },
    };
  } catch (err) {
    const message = syncErrorMessage(err);
    const cached = await loadFavoritesPayloadFromDb(userId, shikimoriUserId);
    if (cached) {
      await prisma.userListSync
        .upsert({
          where: { userId },
          create: { userId, lastSyncError: message },
          update: { lastSyncError: message },
        })
        .catch(() => undefined);
      return {
        ...cached,
        sync: {
          stale: true,
          syncedAt: cached.sync.syncedAt,
          error: message,
        },
      };
    }
    throw err;
  }
}
