import { prisma } from "@/lib/prisma";
import { ShikimoriAuthError, shikimoriAuthFetch } from "@/lib/shikimori/auth-client";
import {
  invalidateUserAnimeRatesCache,
  type ShikimoriUserRate,
} from "@/lib/shikimori/user-rates";
import type { ShikimoriListStatus } from "@/lib/shikimori/user-rates.types";
import type { UserAnimeListInfo } from "@/lib/user-anime-list-status";

type ShikimoriFavoriteRecord = {
  id: number;
  linked_id: number;
  linked_type: string;
};

function parseShikimoriDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

async function persistRateLocally(userId: string, rate: ShikimoriUserRate): Promise<void> {
  await prisma.userAnimeListEntry.upsert({
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
  });
}

async function removeRateLocally(userId: string, shikimoriId: number): Promise<void> {
  await prisma.userAnimeListEntry.deleteMany({
    where: { userId, shikimoriId },
  });
}

async function setBookmarkLocally(userId: string, shikimoriId: number, bookmark: boolean): Promise<void> {
  if (bookmark) {
    await prisma.userAnimeBookmark.upsert({
      where: { userId_shikimoriId: { userId, shikimoriId } },
      create: { userId, shikimoriId },
      update: {},
    });
    return;
  }

  await prisma.userAnimeBookmark.deleteMany({
    where: { userId, shikimoriId },
  });
}

async function findExistingRateId(userId: string, shikimoriId: number): Promise<number | null> {
  const entry = await prisma.userAnimeListEntry.findUnique({
    where: { userId_shikimoriId: { userId, shikimoriId } },
    select: { shikimoriRateId: true },
  });
  const rateId = entry?.shikimoriRateId;
  return rateId != null && rateId > 0 ? rateId : null;
}

function assertShikimoriUserId(shikimoriUserId: number): void {
  if (!Number.isInteger(shikimoriUserId) || shikimoriUserId <= 0) {
    throw new Error("Некорректный профиль Shikimori — войдите заново");
  }
}

function isRateMutationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Shikimori API (403|404|422): \/v2\/user_rates/.test(error.message);
}

async function clearLocalRateId(userId: string, shikimoriId: number): Promise<void> {
  await prisma.userAnimeListEntry.updateMany({
    where: { userId, shikimoriId },
    data: { shikimoriRateId: null },
  });
}

async function fetchRemoteAnimeRate(
  userId: string,
  shikimoriUserId: number,
  shikimoriAnimeId: number,
): Promise<ShikimoriUserRate | null> {
  const rates = await shikimoriAuthFetch<ShikimoriUserRate[]>(
    userId,
    `/v2/user_rates?user_id=${shikimoriUserId}&target_id=${shikimoriAnimeId}&target_type=Anime`,
  );

  if (!Array.isArray(rates) || rates.length === 0) return null;

  return (
    rates.find((rate) => rate.target_id === shikimoriAnimeId && rate.target_type === "Anime") ??
    rates[0] ??
    null
  );
}

async function resolveAnimeRateId(
  userId: string,
  shikimoriUserId: number,
  shikimoriAnimeId: number,
): Promise<number | null> {
  const localRateId = await findExistingRateId(userId, shikimoriAnimeId);
  if (localRateId) return localRateId;

  const remoteRate = await fetchRemoteAnimeRate(userId, shikimoriUserId, shikimoriAnimeId);
  return remoteRate?.id ?? null;
}

function buildCreateRateBody(
  shikimoriUserId: number,
  shikimoriAnimeId: number,
  listStatus: ShikimoriListStatus,
) {
  return {
    user_rate: {
      user_id: String(shikimoriUserId),
      target_id: String(shikimoriAnimeId),
      target_type: "Anime",
      status: listStatus,
    },
  };
}

function buildUpdateRateBody(shikimoriUserId: number, listStatus: ShikimoriListStatus) {
  return {
    user_rate: {
      user_id: String(shikimoriUserId),
      status: listStatus,
    },
  };
}

async function createUserRateOnShikimori(
  userId: string,
  shikimoriUserId: number,
  shikimoriAnimeId: number,
  listStatus: ShikimoriListStatus,
): Promise<ShikimoriUserRate> {
  return shikimoriAuthFetch<ShikimoriUserRate>(userId, "/v2/user_rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCreateRateBody(shikimoriUserId, shikimoriAnimeId, listStatus)),
  });
}

async function updateUserRateOnShikimori(
  userId: string,
  rateId: number,
  shikimoriUserId: number,
  listStatus: ShikimoriListStatus,
): Promise<ShikimoriUserRate> {
  return shikimoriAuthFetch<ShikimoriUserRate>(userId, `/v2/user_rates/${rateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildUpdateRateBody(shikimoriUserId, listStatus)),
  });
}

async function upsertUserRateOnShikimori(
  userId: string,
  shikimoriUserId: number,
  shikimoriAnimeId: number,
  listStatus: ShikimoriListStatus,
): Promise<ShikimoriUserRate> {
  const rateId = await resolveAnimeRateId(userId, shikimoriUserId, shikimoriAnimeId);

  if (rateId) {
    return updateUserRateOnShikimori(userId, rateId, shikimoriUserId, listStatus);
  }

  return createUserRateOnShikimori(userId, shikimoriUserId, shikimoriAnimeId, listStatus);
}

async function findFavoriteRecordId(userId: string, shikimoriId: number): Promise<number | null> {
  const records = await shikimoriAuthFetch<ShikimoriFavoriteRecord[]>(
    userId,
    `/favorites?linked_type=Anime&linked_id=${shikimoriId}`,
  );
  const match = Array.isArray(records)
    ? records.find((item) => item.linked_type === "Anime" && item.linked_id === shikimoriId)
    : null;
  return match?.id ?? null;
}

export async function setUserAnimeListStatus(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
  listStatus: ShikimoriListStatus,
): Promise<UserAnimeListInfo> {
  assertShikimoriUserId(shikimoriUserId);

  let rate: ShikimoriUserRate;
  try {
    rate = await upsertUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, listStatus);
  } catch (error) {
    if (!isRateMutationError(error)) throw error;

    await clearLocalRateId(userId, shikimoriId);
    const remoteRate = await fetchRemoteAnimeRate(userId, shikimoriUserId, shikimoriId);

    rate = remoteRate
      ? await updateUserRateOnShikimori(userId, remoteRate.id, shikimoriUserId, listStatus)
      : await createUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, listStatus);
  }

  if (!rate) {
    throw new Error("Shikimori did not return user rate");
  }

  await persistRateLocally(userId, rate);
  invalidateUserAnimeRatesCache(userId, shikimoriUserId);

  const bookmark = await prisma.userAnimeBookmark.findUnique({
    where: { userId_shikimoriId: { userId, shikimoriId } },
    select: { shikimoriId: true },
  });

  return {
    listStatus: rate.status,
    isBookmark: Boolean(bookmark),
  };
}

export async function removeUserAnimeListStatus(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
): Promise<UserAnimeListInfo | null> {
  assertShikimoriUserId(shikimoriUserId);

  const rateId = await resolveAnimeRateId(userId, shikimoriUserId, shikimoriId);
  if (rateId) {
    try {
      await shikimoriAuthFetch<void>(userId, `/v2/user_rates/${rateId}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (!isRateMutationError(error)) throw error;
    }
  }

  await removeRateLocally(userId, shikimoriId);
  invalidateUserAnimeRatesCache(userId, shikimoriUserId);

  const bookmark = await prisma.userAnimeBookmark.findUnique({
    where: { userId_shikimoriId: { userId, shikimoriId } },
    select: { shikimoriId: true },
  });

  if (!bookmark) return null;

  return {
    listStatus: null,
    isBookmark: true,
  };
}

export async function setUserAnimeBookmark(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
  bookmark: boolean,
): Promise<UserAnimeListInfo | null> {
  if (bookmark) {
    await shikimoriAuthFetch<void>(userId, "/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linked_type: "Anime",
        linked_id: shikimoriId,
      }),
    });
    await setBookmarkLocally(userId, shikimoriId, true);
  } else {
    const favoriteId = await findFavoriteRecordId(userId, shikimoriId);
    if (favoriteId) {
      await shikimoriAuthFetch<void>(userId, `/favorites/${favoriteId}`, {
        method: "DELETE",
      });
    }
    await setBookmarkLocally(userId, shikimoriId, false);
  }

  invalidateUserAnimeRatesCache(userId, shikimoriUserId);

  const entry = await prisma.userAnimeListEntry.findUnique({
    where: { userId_shikimoriId: { userId, shikimoriId } },
    select: { listStatus: true },
  });

  if (!entry && !bookmark) return null;

  return {
    listStatus: entry?.listStatus ?? null,
    isBookmark: bookmark,
  };
}

export async function removeUserAnimeFromAllLists(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
): Promise<null> {
  await removeUserAnimeListStatus(userId, shikimoriUserId, shikimoriId);
  await setUserAnimeBookmark(userId, shikimoriUserId, shikimoriId, false);
  return null;
}

export function isListMutationAuthError(error: unknown): error is ShikimoriAuthError {
  return error instanceof ShikimoriAuthError;
}
