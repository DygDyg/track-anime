import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
/** Bulk INSERT keeps the tx short; leave headroom for large deletes + snapshot write. */
const PERSIST_TX_TIMEOUT_MS = 30_000;
const PERSIST_TX_MAX_WAIT_MS = 20_000;

type RateSnapshotRow = {
  id: number;
  user_id: number;
  target_id: number;
  target_type: "Anime";
  score: number;
  status: string;
  episodes: number;
  rewatches: number;
  created_at: string | null;
  updated_at: string | null;
};

type BulkRateRow = {
  id: string;
  shikimoriId: number;
  shikimoriRateId: number | null;
  listStatus: string;
  userScore: number;
  watchedEpisodes: number;
  rewatches: number;
  addedAt: string | null;
  listUpdatedAt: string | null;
};

function parseShikimoriDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function entryToRate(
  entry: {
    shikimoriId: number;
    shikimoriRateId: number | null;
    listStatus: string;
    userScore: number;
    watchedEpisodes: number;
    rewatches: number;
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
    rewatches: entry.rewatches,
    created_at: entry.addedAt?.toISOString() ?? null,
    updated_at: entry.listUpdatedAt?.toISOString() ?? entry.addedAt?.toISOString() ?? null,
  };
}

function rateToSnapshotRow(rate: ShikimoriUserRate, shikimoriUserId: number): RateSnapshotRow {
  return {
    id: rate.id,
    user_id: rate.user_id || shikimoriUserId,
    target_id: rate.target_id,
    target_type: "Anime",
    score: rate.score,
    status: rate.status,
    episodes: rate.episodes,
    rewatches: rate.rewatches,
    created_at: rate.created_at ?? null,
    updated_at: rate.updated_at ?? rate.created_at ?? null,
  };
}

function isRateSnapshotRow(value: unknown): value is RateSnapshotRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.target_id === "number" &&
    typeof row.status === "string" &&
    typeof row.score === "number" &&
    typeof row.episodes === "number"
  );
}

function snapshotRowsToRates(rows: unknown, shikimoriUserId: number): ShikimoriUserRate[] | null {
  if (!Array.isArray(rows)) return null;
  const rates: ShikimoriUserRate[] = [];
  for (const item of rows) {
    if (!isRateSnapshotRow(item)) return null;
    rates.push({
      id: typeof item.id === "number" ? item.id : 0,
      user_id: typeof item.user_id === "number" ? item.user_id : shikimoriUserId,
      target_id: item.target_id,
      target_type: "Anime",
      score: item.score,
      status: item.status,
      episodes: item.episodes,
      rewatches: typeof item.rewatches === "number" ? item.rewatches : 0,
      created_at: typeof item.created_at === "string" ? item.created_at : null,
      updated_at: typeof item.updated_at === "string" ? item.updated_at : null,
    });
  }
  return rates;
}

function snapshotBookmarkIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) return null;
    ids.push(item);
  }
  return ids;
}

export function isFavoritesSyncStale(lastSyncedAt: Date | null | undefined): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - lastSyncedAt.getTime() >= LIST_SYNC_TTL_MS;
}

/** Drop response cache so favorites page falls back to row canon after a point mutation. */
export async function invalidateFavoritesListSnapshot(userId: string): Promise<void> {
  await prisma.userListSync
    .updateMany({
      where: { userId },
      data: { ratesSnapshot: Prisma.DbNull, bookmarksSnapshot: Prisma.DbNull },
    })
    .catch(() => undefined);
}

async function bulkUpsertRates(
  tx: Prisma.TransactionClient,
  userId: string,
  rates: ShikimoriUserRate[],
): Promise<void> {
  if (rates.length === 0) return;

  const rows: BulkRateRow[] = rates.map((rate) => ({
    id: randomUUID(),
    shikimoriId: rate.target_id,
    shikimoriRateId: rate.id > 0 ? rate.id : null,
    listStatus: rate.status,
    userScore: rate.score,
    watchedEpisodes: rate.episodes,
    rewatches: rate.rewatches,
    addedAt: toIsoOrNull(parseShikimoriDate(rate.created_at)),
    listUpdatedAt: toIsoOrNull(parseShikimoriDate(rate.updated_at)),
  }));

  // Same semantics as former Prisma upsert: create sets rewatches; conflict update does NOT.
  await tx.$executeRaw`
    INSERT INTO "UserAnimeListEntry" (
      "id",
      "userId",
      "shikimoriId",
      "shikimoriRateId",
      "listStatus",
      "userScore",
      "watchedEpisodes",
      "rewatches",
      "addedAt",
      "listUpdatedAt",
      "createdAt",
      "updatedAt"
    )
    SELECT
      x.id,
      ${userId},
      x."shikimoriId",
      x."shikimoriRateId",
      x."listStatus",
      x."userScore",
      x."watchedEpisodes",
      x.rewatches,
      x."addedAt",
      x."listUpdatedAt",
      NOW(),
      NOW()
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
      id text,
      "shikimoriId" int,
      "shikimoriRateId" int,
      "listStatus" text,
      "userScore" int,
      "watchedEpisodes" int,
      rewatches int,
      "addedAt" timestamptz,
      "listUpdatedAt" timestamptz
    )
    ON CONFLICT ("userId", "shikimoriId") DO UPDATE SET
      "shikimoriRateId" = EXCLUDED."shikimoriRateId",
      "listStatus" = EXCLUDED."listStatus",
      "userScore" = EXCLUDED."userScore",
      "watchedEpisodes" = EXCLUDED."watchedEpisodes",
      "addedAt" = EXCLUDED."addedAt",
      "listUpdatedAt" = EXCLUDED."listUpdatedAt",
      "updatedAt" = NOW()
  `;
}

async function persistFavoritesSnapshot(
  userId: string,
  rates: ShikimoriUserRate[],
  favourites: ShikimoriFavouritesResponse,
  shikimoriUserId: number,
): Promise<void> {
  const bookmarkIds = (favourites.animes ?? []).map((item) => item.id);
  const rateIds = rates.map((rate) => rate.target_id);
  const mangaBookmarkCount = (favourites.mangas?.length ?? 0) + (favourites.ranobe?.length ?? 0);
  const ratesSnapshot = rates.map((rate) => rateToSnapshotRow(rate, shikimoriUserId));
  const syncedAt = new Date();

  await prisma.$transaction(
    async (tx) => {
      if (rateIds.length > 0) {
        await tx.userAnimeListEntry.deleteMany({
          where: { userId, shikimoriId: { notIn: rateIds } },
        });
      } else {
        await tx.userAnimeListEntry.deleteMany({ where: { userId } });
      }

      await bulkUpsertRates(tx, userId, rates);

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
          lastSyncedAt: syncedAt,
          lastSyncError: null,
          mangaBookmarkCount,
          ratesSnapshot,
          bookmarksSnapshot: bookmarkIds,
        },
        update: {
          lastSyncedAt: syncedAt,
          lastSyncError: null,
          mangaBookmarkCount,
          ratesSnapshot,
          bookmarksSnapshot: bookmarkIds,
        },
      });
    },
    { maxWait: PERSIST_TX_MAX_WAIT_MS, timeout: PERSIST_TX_TIMEOUT_MS },
  );
}

export async function loadFavoritesPayloadFromDb(
  userId: string,
  shikimoriUserId: number,
): Promise<FavoritesSyncPayload | null> {
  const sync = await prisma.userListSync.findUnique({ where: { userId } });

  const snapshotRates = snapshotRowsToRates(sync?.ratesSnapshot, shikimoriUserId);
  const snapshotBookmarks = snapshotBookmarkIds(sync?.bookmarksSnapshot);

  if (snapshotRates != null && snapshotBookmarks != null) {
    if (snapshotRates.length === 0 && snapshotBookmarks.length === 0) {
      return null;
    }
    return {
      rates: snapshotRates,
      favourites: {
        animes: snapshotBookmarks.map((id) => ({ id, name: "" })),
      },
      mangaBookmarkCount: sync?.mangaBookmarkCount ?? 0,
      sync: {
        stale: isFavoritesSyncStale(sync?.lastSyncedAt),
        syncedAt: sync?.lastSyncedAt ?? null,
        error: sync?.lastSyncError ?? null,
      },
    };
  }

  const [entries, bookmarks] = await Promise.all([
    prisma.userAnimeListEntry.findMany({ where: { userId } }),
    prisma.userAnimeBookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
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
    return err.message || "Связь с Shikimori истекла — переподключите";
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

    await persistFavoritesSnapshot(userId, rates, favourites, shikimoriUserId);

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
