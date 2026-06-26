import { prisma } from "@/lib/prisma";

export const COVER_CACHE_SETTINGS_ID = "default";

export const COVER_MAX_AGE_OPTIONS = [0, 1, 3, 7, 14, 30, 90] as const;
export const COVER_BROWSER_CACHE_OPTIONS = [1, 3, 7, 14, 30] as const;

export type CoverCacheSettingsDto = {
  enabled: boolean;
  maxAgeDays: number;
  quality: number;
  maxHeight: number;
  browserCacheDays: number;
  updatedAt: string;
};

export type CoverCacheRuntimeSettings = {
  enabled: boolean;
  maxAgeDays: number;
  quality: number;
  maxHeight: number;
  browserCacheSec: number;
};

export const DEFAULT_COVER_CACHE_RUNTIME: CoverCacheRuntimeSettings = {
  enabled: true,
  maxAgeDays: 7,
  quality: 70,
  maxHeight: 450,
  browserCacheSec: 7 * 24 * 60 * 60,
};

export const DEFAULT_COVER_CACHE_DTO: CoverCacheSettingsDto = {
  enabled: DEFAULT_COVER_CACHE_RUNTIME.enabled,
  maxAgeDays: DEFAULT_COVER_CACHE_RUNTIME.maxAgeDays,
  quality: DEFAULT_COVER_CACHE_RUNTIME.quality,
  maxHeight: DEFAULT_COVER_CACHE_RUNTIME.maxHeight,
  browserCacheDays: 7,
  updatedAt: new Date(0).toISOString(),
};

let cachedSettings: { value: CoverCacheRuntimeSettings; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function hasCoverCacheSettingsModel(): boolean {
  const delegate = (prisma as { coverCacheSettings?: { upsert?: unknown } }).coverCacheSettings;
  return typeof delegate?.upsert === "function";
}

export function invalidateCoverCacheSettingsCache(): void {
  cachedSettings = null;
}

function toRuntime(row: {
  enabled: boolean;
  maxAgeDays: number;
  quality: number;
  maxHeight: number;
  browserCacheDays: number;
}): CoverCacheRuntimeSettings {
  return {
    enabled: row.enabled,
    maxAgeDays: row.maxAgeDays,
    quality: row.quality,
    maxHeight: row.maxHeight,
    browserCacheSec: row.browserCacheDays * 24 * 60 * 60,
  };
}

function toDto(row: {
  enabled: boolean;
  maxAgeDays: number;
  quality: number;
  maxHeight: number;
  browserCacheDays: number;
  updatedAt: Date;
}): CoverCacheSettingsDto {
  return {
    enabled: row.enabled,
    maxAgeDays: row.maxAgeDays,
    quality: row.quality,
    maxHeight: row.maxHeight,
    browserCacheDays: row.browserCacheDays,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureCoverCacheSettings(): Promise<void> {
  if (!hasCoverCacheSettingsModel()) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await prisma.coverCacheSettings.upsert({
    where: { id: COVER_CACHE_SETTINGS_ID },
    create: {
      id: COVER_CACHE_SETTINGS_ID,
      enabled: DEFAULT_COVER_CACHE_RUNTIME.enabled,
      maxAgeDays: DEFAULT_COVER_CACHE_RUNTIME.maxAgeDays,
      quality: DEFAULT_COVER_CACHE_RUNTIME.quality,
      maxHeight: DEFAULT_COVER_CACHE_RUNTIME.maxHeight,
      browserCacheDays: DEFAULT_COVER_CACHE_RUNTIME.browserCacheSec / (24 * 60 * 60),
    },
    update: {},
  });
}

export async function getCoverCacheSettingsDto(): Promise<CoverCacheSettingsDto> {
  try {
    await ensureCoverCacheSettings();
    const row = await prisma.coverCacheSettings.findUniqueOrThrow({
      where: { id: COVER_CACHE_SETTINGS_ID },
    });
    return toDto(row);
  } catch (error) {
    console.warn("[cover-cache] settings dto fallback:", error);
    return DEFAULT_COVER_CACHE_DTO;
  }
}

export async function getCoverCacheRuntimeSettings(): Promise<CoverCacheRuntimeSettings> {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }

  try {
    await ensureCoverCacheSettings();
    const row = await prisma.coverCacheSettings.findUniqueOrThrow({
      where: { id: COVER_CACHE_SETTINGS_ID },
    });
    const value = toRuntime(row);
    cachedSettings = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[cover-cache] runtime settings fallback:", error);
    return DEFAULT_COVER_CACHE_RUNTIME;
  }
}

export async function updateCoverCacheSettings(input: {
  enabled?: boolean;
  maxAgeDays?: number;
  quality?: number;
  maxHeight?: number;
  browserCacheDays?: number;
}): Promise<CoverCacheSettingsDto> {
  await ensureCoverCacheSettings();

  const data: {
    enabled?: boolean;
    maxAgeDays?: number;
    quality?: number;
    maxHeight?: number;
    browserCacheDays?: number;
  } = {};

  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.maxAgeDays !== undefined) data.maxAgeDays = input.maxAgeDays;
  if (input.quality !== undefined) data.quality = input.quality;
  if (input.maxHeight !== undefined) data.maxHeight = input.maxHeight;
  if (input.browserCacheDays !== undefined) data.browserCacheDays = input.browserCacheDays;

  await prisma.coverCacheSettings.update({
    where: { id: COVER_CACHE_SETTINGS_ID },
    data,
  });

  invalidateCoverCacheSettingsCache();
  return getCoverCacheSettingsDto();
}

export type CoverCacheAdminStats = {
  count: number;
  totalSizeMb: number;
};

export async function getCoverCacheAdminStats(): Promise<CoverCacheAdminStats> {
  const { readCoverCacheStats } = await import("@/lib/cover-cache");
  const stats = readCoverCacheStats();
  return { count: stats.count, totalSizeMb: stats.total_size_mb };
}
