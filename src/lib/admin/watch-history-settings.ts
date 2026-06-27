import { prisma } from "@/lib/prisma";

export const WATCH_HISTORY_SETTINGS_ID = "default";

/** Доля длительности последней серии, после которой тайтл убирается из истории (50 = 50%). */
export const DEFAULT_COMPLETE_EPISODE_THRESHOLD_PCT = 50;
export const MIN_COMPLETE_EPISODE_THRESHOLD_PCT = 1;
export const MAX_COMPLETE_EPISODE_THRESHOLD_PCT = 99;

export type WatchHistorySettingsDto = {
  completeEpisodeThresholdPct: number;
  updatedAt: string;
};

export const DEFAULT_WATCH_HISTORY_SETTINGS_DTO: WatchHistorySettingsDto = {
  completeEpisodeThresholdPct: DEFAULT_COMPLETE_EPISODE_THRESHOLD_PCT,
  updatedAt: new Date(0).toISOString(),
};

let cachedThresholdPct: { value: number; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function hasWatchHistorySettingsModel(): boolean {
  const delegate = (prisma as { watchHistorySettings?: { upsert?: unknown } }).watchHistorySettings;
  return typeof delegate?.upsert === "function";
}

export function invalidateWatchHistorySettingsCache(): void {
  cachedThresholdPct = null;
}

export function clampCompleteEpisodeThresholdPct(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COMPLETE_EPISODE_THRESHOLD_PCT;
  return Math.min(
    MAX_COMPLETE_EPISODE_THRESHOLD_PCT,
    Math.max(MIN_COMPLETE_EPISODE_THRESHOLD_PCT, Math.round(value)),
  );
}

export function completeEpisodeThresholdRatio(percent: number): number {
  return clampCompleteEpisodeThresholdPct(percent) / 100;
}

function toDto(row: { completeEpisodeThresholdPct: number; updatedAt: Date }): WatchHistorySettingsDto {
  return {
    completeEpisodeThresholdPct: clampCompleteEpisodeThresholdPct(row.completeEpisodeThresholdPct),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureWatchHistorySettings(): Promise<void> {
  if (!hasWatchHistorySettingsModel()) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await prisma.watchHistorySettings.upsert({
    where: { id: WATCH_HISTORY_SETTINGS_ID },
    create: {
      id: WATCH_HISTORY_SETTINGS_ID,
      completeEpisodeThresholdPct: DEFAULT_COMPLETE_EPISODE_THRESHOLD_PCT,
    },
    update: {},
  });
}

export async function getWatchHistorySettingsDto(): Promise<WatchHistorySettingsDto> {
  try {
    await ensureWatchHistorySettings();
    const row = await prisma.watchHistorySettings.findUniqueOrThrow({
      where: { id: WATCH_HISTORY_SETTINGS_ID },
    });
    return toDto(row);
  } catch (error) {
    console.warn("[watch-history] settings dto fallback:", error);
    return DEFAULT_WATCH_HISTORY_SETTINGS_DTO;
  }
}

export async function getWatchHistoryCompleteThresholdPct(): Promise<number> {
  if (cachedThresholdPct && Date.now() - cachedThresholdPct.at < SETTINGS_CACHE_MS) {
    return cachedThresholdPct.value;
  }

  try {
    await ensureWatchHistorySettings();
    const row = await prisma.watchHistorySettings.findUniqueOrThrow({
      where: { id: WATCH_HISTORY_SETTINGS_ID },
    });
    const value = clampCompleteEpisodeThresholdPct(row.completeEpisodeThresholdPct);
    cachedThresholdPct = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[watch-history] runtime settings fallback:", error);
    return DEFAULT_COMPLETE_EPISODE_THRESHOLD_PCT;
  }
}

export async function getWatchHistoryCompleteThresholdRatio(): Promise<number> {
  const pct = await getWatchHistoryCompleteThresholdPct();
  return completeEpisodeThresholdRatio(pct);
}

export async function updateWatchHistorySettings(input: {
  completeEpisodeThresholdPct?: number;
}): Promise<WatchHistorySettingsDto> {
  await ensureWatchHistorySettings();

  const data: { completeEpisodeThresholdPct?: number } = {};
  if (input.completeEpisodeThresholdPct !== undefined) {
    data.completeEpisodeThresholdPct = clampCompleteEpisodeThresholdPct(
      input.completeEpisodeThresholdPct,
    );
  }

  await prisma.watchHistorySettings.update({
    where: { id: WATCH_HISTORY_SETTINGS_ID },
    data,
  });

  invalidateWatchHistorySettingsCache();
  return getWatchHistorySettingsDto();
}
