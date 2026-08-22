import { effectiveRewatches, showsRewatchCount } from "@/lib/anime-rewatches";
import { prisma } from "@/lib/prisma";
import { ShikimoriAuthError, shikimoriAuthFetch } from "@/lib/shikimori/auth-client";
import {
  invalidateUserAnimeRatesCache,
  type ShikimoriUserRate,
} from "@/lib/shikimori/user-rates";
import type { ShikimoriListStatus } from "@/lib/shikimori/user-rates.types";
import { normalizeUserAnimeScore, type UserAnimeListInfo } from "@/lib/user-anime-list-status";

type UserRatePatch = {
  listStatus?: ShikimoriListStatus;
  rewatches?: number;
  /** 0 = сбросить оценку; 1–10 = поставить */
  score?: number;
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
      rewatches: rate.rewatches,
      addedAt: parseShikimoriDate(rate.created_at),
      listUpdatedAt: parseShikimoriDate(rate.updated_at),
    },
    update: {
      shikimoriRateId: rate.id,
      listStatus: rate.status,
      userScore: rate.score,
      watchedEpisodes: rate.episodes,
      rewatches: rate.rewatches,
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

async function findLocalEntry(userId: string, shikimoriId: number) {
  return prisma.userAnimeListEntry.findUnique({
    where: { userId_shikimoriId: { userId, shikimoriId } },
    select: { listStatus: true, rewatches: true, userScore: true },
  });
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
  patch: UserRatePatch,
) {
  const user_rate: Record<string, string> = {
    user_id: String(shikimoriUserId),
    target_id: String(shikimoriAnimeId),
    target_type: "Anime",
  };

  if (patch.listStatus) user_rate.status = patch.listStatus;
  if (patch.rewatches != null) user_rate.rewatches = String(patch.rewatches);
  if (patch.score != null) user_rate.score = String(patch.score);

  return { user_rate };
}

function buildUpdateRateBody(patch: UserRatePatch) {
  const user_rate: Record<string, string> = {};
  if (patch.listStatus) user_rate.status = patch.listStatus;
  if (patch.rewatches != null) user_rate.rewatches = String(patch.rewatches);
  if (patch.score != null) user_rate.score = String(patch.score);
  return { user_rate };
}

async function createUserRateOnShikimori(
  userId: string,
  shikimoriUserId: number,
  shikimoriAnimeId: number,
  patch: UserRatePatch,
): Promise<ShikimoriUserRate> {
  return shikimoriAuthFetch<ShikimoriUserRate>(userId, "/v2/user_rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCreateRateBody(shikimoriUserId, shikimoriAnimeId, patch)),
  });
}

async function updateUserRateOnShikimori(
  userId: string,
  rateId: number,
  patch: UserRatePatch,
): Promise<ShikimoriUserRate> {
  return shikimoriAuthFetch<ShikimoriUserRate>(userId, `/v2/user_rates/${rateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildUpdateRateBody(patch)),
  });
}

async function upsertUserRateOnShikimori(
  userId: string,
  shikimoriUserId: number,
  shikimoriAnimeId: number,
  patch: UserRatePatch,
): Promise<ShikimoriUserRate> {
  const rateId = await resolveAnimeRateId(userId, shikimoriUserId, shikimoriAnimeId);

  if (rateId) {
    return updateUserRateOnShikimori(userId, rateId, patch);
  }

  // Оценка без статуса: создаём rate со статусом «Запланировано» (как на Shikimori).
  const createPatch: UserRatePatch =
    patch.listStatus != null
      ? patch
      : patch.score != null
        ? { ...patch, listStatus: "planned" }
        : patch;

  if (!createPatch.listStatus) {
    throw new Error("Нельзя создать запись без статуса списка");
  }

  return createUserRateOnShikimori(userId, shikimoriUserId, shikimoriAnimeId, createPatch);
}

async function mutateUserRateOnShikimori(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
  patch: UserRatePatch,
): Promise<ShikimoriUserRate> {
  try {
    return await upsertUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, patch);
  } catch (error) {
    if (!isRateMutationError(error)) throw error;

    await clearLocalRateId(userId, shikimoriId);
    const remoteRate = await fetchRemoteAnimeRate(userId, shikimoriUserId, shikimoriId);

    if (remoteRate) {
      return updateUserRateOnShikimori(userId, remoteRate.id, patch);
    }

    const createPatch: UserRatePatch =
      patch.listStatus != null
        ? patch
        : patch.score != null
          ? { ...patch, listStatus: "planned" }
          : patch;

    if (!createPatch.listStatus) {
      throw error;
    }

    return createUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, createPatch);
  }
}

async function buildListInfo(userId: string, shikimoriId: number, rate?: ShikimoriUserRate | null) {
  const [entry, bookmark] = await Promise.all([
    rate
      ? Promise.resolve({
          listStatus: rate.status,
          rewatches: rate.rewatches,
          userScore: rate.score,
        })
      : findLocalEntry(userId, shikimoriId),
    prisma.userAnimeBookmark.findUnique({
      where: { userId_shikimoriId: { userId, shikimoriId } },
      select: { shikimoriId: true },
    }),
  ]);

  if (!entry && !bookmark) return null;

  const listStatus = entry?.listStatus ?? null;
  return {
    listStatus,
    isBookmark: Boolean(bookmark),
    rewatches: entry ? effectiveRewatches(entry.rewatches, listStatus) : null,
    userScore: entry ? normalizeUserAnimeScore(entry.userScore) : null,
  } satisfies UserAnimeListInfo;
}

function completedRewatchesDefault(listStatus: ShikimoriListStatus, current: number | null | undefined): number | undefined {
  if (listStatus !== "completed" && listStatus !== "rewatching") return undefined;
  return Math.max(current ?? 0, 1);
}

export async function setUserAnimeScore(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
  score: number,
): Promise<UserAnimeListInfo> {
  assertShikimoriUserId(shikimoriUserId);

  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new Error("Оценка должна быть от 0 до 10");
  }

  // Сброс оценки без записи в списке — no-op.
  if (score === 0) {
    const rateId = await resolveAnimeRateId(userId, shikimoriUserId, shikimoriId);
    if (!rateId) {
      const listInfo = await buildListInfo(userId, shikimoriId);
      if (!listInfo) {
        throw new Error("Аниме ещё нет в списке");
      }
      return listInfo;
    }
  }

  const rate = await mutateUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, { score });
  await persistRateLocally(userId, rate);
  invalidateUserAnimeRatesCache(userId, shikimoriUserId);

  const listInfo = await buildListInfo(userId, shikimoriId, rate);
  if (!listInfo) {
    throw new Error("Не удалось обновить локальный список");
  }

  return listInfo;
}

export async function setUserAnimeListStatus(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
  listStatus: ShikimoriListStatus,
): Promise<UserAnimeListInfo> {
  assertShikimoriUserId(shikimoriUserId);

  const local = await findLocalEntry(userId, shikimoriId);
  const rewatches = completedRewatchesDefault(listStatus, local?.rewatches);

  const patch: UserRatePatch = { listStatus };
  if (rewatches != null) patch.rewatches = rewatches;

  const rate = await mutateUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, patch);
  if (!rate) {
    throw new Error("Shikimori did not return user rate");
  }

  await persistRateLocally(userId, rate);
  invalidateUserAnimeRatesCache(userId, shikimoriUserId);

  const listInfo = await buildListInfo(userId, shikimoriId, rate);
  if (!listInfo) {
    throw new Error("Не удалось обновить локальный список");
  }

  return listInfo;
}

export async function incrementUserAnimeRewatch(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
): Promise<UserAnimeListInfo> {
  assertShikimoriUserId(shikimoriUserId);

  const local = await findLocalEntry(userId, shikimoriId);
  if (!local || local.listStatus !== "completed") {
    throw new Error("Пересмотр доступен только для просмотренных аниме");
  }

  const next = effectiveRewatches(local.rewatches, local.listStatus) + 1;
  const rate = await mutateUserRateOnShikimori(userId, shikimoriUserId, shikimoriId, {
    listStatus: "completed",
    rewatches: next,
  });

  await persistRateLocally(userId, rate);
  invalidateUserAnimeRatesCache(userId, shikimoriUserId);

  const listInfo = await buildListInfo(userId, shikimoriId, rate);
  if (!listInfo) {
    throw new Error("Не удалось обновить локальный список");
  }

  return listInfo;
}

export async function setUserAnimeRewatches(
  userId: string,
  _shikimoriUserId: number,
  shikimoriId: number,
  rewatches: number,
): Promise<UserAnimeListInfo> {
  const local = await findLocalEntry(userId, shikimoriId);
  if (!local?.listStatus) {
    throw new Error("Аниме должно быть в списке");
  }

  if (!showsRewatchCount(local.listStatus) && rewatches > 0) {
    throw new Error("Счётчик пересмотров доступен только для просмотренных аниме");
  }

  await prisma.userAnimeListEntry.update({
    where: { userId_shikimoriId: { userId, shikimoriId } },
    data: { rewatches },
  });

  const listInfo = await buildListInfo(userId, shikimoriId);
  if (!listInfo) {
    throw new Error("Не удалось обновить локальный список");
  }

  return listInfo;
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

  return buildListInfo(userId, shikimoriId);
}

export async function setUserAnimeBookmark(
  userId: string,
  shikimoriUserId: number,
  shikimoriId: number,
  bookmark: boolean,
): Promise<UserAnimeListInfo | null> {
  if (bookmark) {
    await shikimoriAuthFetch<void>(userId, `/favorites/Anime/${shikimoriId}`, {
      method: "POST",
    });
    await setBookmarkLocally(userId, shikimoriId, true);
  } else {
    await shikimoriAuthFetch<void>(userId, `/favorites/Anime/${shikimoriId}`, {
      method: "DELETE",
    });
    await setBookmarkLocally(userId, shikimoriId, false);
  }

  invalidateUserAnimeRatesCache(userId, shikimoriUserId);
  return buildListInfo(userId, shikimoriId);
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
