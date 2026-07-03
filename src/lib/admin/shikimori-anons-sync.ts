import { prisma } from "@/lib/prisma";
import { fetchAllShikimoriAnons } from "@/lib/shikimori/animes-list";
import {
  buildShikimoriCalendarAnonsMap,
  fetchShikimoriCalendar,
} from "@/lib/shikimori/calendar-api";
import { isShikimoriMissingImage } from "@/lib/shikimori/client";
import { getShikimoriEndpoints, shikimoriAssetUrl } from "@/lib/shikimori/endpoints";
import { isShikimoriFullAnimeKind } from "@/lib/shikimori/full-anime-kinds";
import type { ShikimoriAnimeBrief } from "@/lib/shikimori/types";

export const SHIKIMORI_ANONS_SYNC_STATE_ID = "default";
export const DEFAULT_SHIKIMORI_ANONS_SYNC_INTERVAL_MINUTES = 360;

export type ShikimoriAnonsSyncResult = {
  upserted: number;
  removed: number;
  total: number;
  skipped?: boolean;
  skipReason?: string;
};

export type ShikimoriAnonsSyncStatusDto = {
  lastRunAt: string | null;
  lastStatus: string | null;
  entryCount: number;
  withScheduleCount: number;
  error: string | null;
  updatedAt: string | null;
  nextAutoRunAt: string | null;
  autoIntervalMinutes: number;
};

export async function getShikimoriAnonsSyncStatus(): Promise<ShikimoriAnonsSyncStatusDto> {
  const [state, entryCount, withScheduleCount] = await Promise.all([
    prisma.shikimoriAnonsSyncState.findUnique({
      where: { id: SHIKIMORI_ANONS_SYNC_STATE_ID },
    }),
    prisma.shikimoriAnonsEntry.count(),
    prisma.shikimoriAnonsEntry.count({
      where: { scheduleAt: { not: null } },
    }),
  ]);

  const lastRunAt = state?.lastRunAt ?? null;
  const nextAutoRunAt =
    lastRunAt != null
      ? new Date(lastRunAt.getTime() + DEFAULT_SHIKIMORI_ANONS_SYNC_INTERVAL_MINUTES * 60_000)
      : null;

  return {
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastStatus: state?.lastStatus ?? null,
    entryCount,
    withScheduleCount,
    error: state?.error ?? null,
    updatedAt: state?.updatedAt?.toISOString() ?? null,
    nextAutoRunAt: nextAutoRunAt?.toISOString() ?? null,
    autoIntervalMinutes: DEFAULT_SHIKIMORI_ANONS_SYNC_INTERVAL_MINUTES,
  };
}

function posterFromBrief(
  anime: ShikimoriAnimeBrief,
  endpoints: Awaited<ReturnType<typeof getShikimoriEndpoints>>,
): string | null {
  const image = anime.image;
  if (!image) return null;

  for (const path of [image.preview, image.x96, image.original, image.x48]) {
    if (isShikimoriMissingImage(path)) continue;
    const url = shikimoriAssetUrl(path, endpoints);
    if (url) return url;
  }

  return null;
}

export function parseShikimoriAiredOnSchedule(airedOn: string | null | undefined): Date | null {
  if (!airedOn?.trim()) return null;
  const trimmed = airedOn.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00+03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}-01T12:00:00+03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}-01-01T12:00:00+03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function resolveSchedule(
  anime: ShikimoriAnimeBrief,
  calendarById: Map<number, { scheduleAt: Date; nextEpisode: number }>,
): {
  scheduleAt: Date | null;
  scheduleSource: "next_episode" | "premiere" | null;
  nextEpisode: number | null;
} {
  const calendar = calendarById.get(anime.id);
  if (calendar) {
    return {
      scheduleAt: calendar.scheduleAt,
      scheduleSource: "next_episode",
      nextEpisode: calendar.nextEpisode,
    };
  }

  const premiere =
    parseShikimoriAiredOnSchedule(anime.aired_on) ??
    parseShikimoriAiredOnSchedule(anime.released_on);

  if (premiere) {
    return {
      scheduleAt: premiere,
      scheduleSource: "premiere",
      nextEpisode: null,
    };
  }

  return {
    scheduleAt: null,
    scheduleSource: null,
    nextEpisode: null,
  };
}

export async function runShikimoriAnonsSync(): Promise<ShikimoriAnonsSyncResult> {
  const endpoints = await getShikimoriEndpoints();
  const syncedAt = new Date();

  const [anonsList, calendarEntries] = await Promise.all([
    fetchAllShikimoriAnons(),
    fetchShikimoriCalendar(),
  ]);

  const calendarById = buildShikimoriCalendarAnonsMap(calendarEntries);
  const activeIds: number[] = [];
  let upserted = 0;

  for (const anime of anonsList) {
    if (anime.status !== "anons") continue;
    if (!isShikimoriFullAnimeKind(anime.kind)) continue;

    activeIds.push(anime.id);
    const schedule = resolveSchedule(anime, calendarById);

    await prisma.shikimoriAnonsEntry.upsert({
      where: { shikimoriId: anime.id },
      create: {
        shikimoriId: anime.id,
        animeTitle: anime.russian?.trim() || anime.name,
        posterUrl: posterFromBrief(anime, endpoints),
        kind: anime.kind ?? null,
        score: anime.score?.trim() || null,
        scheduleAt: schedule.scheduleAt,
        scheduleSource: schedule.scheduleSource,
        nextEpisode: schedule.nextEpisode,
        syncedAt,
      },
      update: {
        animeTitle: anime.russian?.trim() || anime.name,
        posterUrl: posterFromBrief(anime, endpoints),
        kind: anime.kind ?? null,
        score: anime.score?.trim() || null,
        scheduleAt: schedule.scheduleAt,
        scheduleSource: schedule.scheduleSource,
        nextEpisode: schedule.nextEpisode,
        syncedAt,
      },
    });

    upserted += 1;
  }

  const removed = activeIds.length
    ? (
        await prisma.shikimoriAnonsEntry.deleteMany({
          where: { shikimoriId: { notIn: activeIds } },
        })
      ).count
    : (await prisma.shikimoriAnonsEntry.deleteMany()).count;

  await prisma.shikimoriAnonsSyncState.upsert({
    where: { id: SHIKIMORI_ANONS_SYNC_STATE_ID },
    create: {
      id: SHIKIMORI_ANONS_SYNC_STATE_ID,
      lastRunAt: syncedAt,
      lastStatus: "ok",
      entryCount: upserted,
      error: null,
    },
    update: {
      lastRunAt: syncedAt,
      lastStatus: "ok",
      entryCount: upserted,
      error: null,
    },
  });

  return {
    upserted,
    removed,
    total: upserted,
  };
}

export async function maybeRunScheduledShikimoriAnonsSync(
  intervalMinutes = DEFAULT_SHIKIMORI_ANONS_SYNC_INTERVAL_MINUTES,
): Promise<ShikimoriAnonsSyncResult & { action: "ran" | "waiting" | "skipped" }> {
  const state = await prisma.shikimoriAnonsSyncState.findUnique({
    where: { id: SHIKIMORI_ANONS_SYNC_STATE_ID },
  });

  const now = Date.now();
  const lastRunMs = state?.lastRunAt ? state.lastRunAt.getTime() : 0;
  const intervalMs = intervalMinutes * 60 * 1000;

  if (lastRunMs > 0 && now - lastRunMs < intervalMs) {
    return {
      action: "waiting",
      upserted: 0,
      removed: 0,
      total: state?.entryCount ?? 0,
      skipped: true,
      skipReason: "interval_not_elapsed",
    };
  }

  try {
    const result = await runShikimoriAnonsSync();
    return { action: "ran", ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync_failed";

    await prisma.shikimoriAnonsSyncState.upsert({
      where: { id: SHIKIMORI_ANONS_SYNC_STATE_ID },
      create: {
        id: SHIKIMORI_ANONS_SYNC_STATE_ID,
        lastRunAt: new Date(),
        lastStatus: "error",
        error: message,
      },
      update: {
        lastRunAt: new Date(),
        lastStatus: "error",
        error: message,
      },
    });

    throw error;
  }
}
