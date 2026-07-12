import { prisma } from "@/lib/prisma";
import { resolveMalIdForShikimoriId } from "@/lib/shikimori/mal-id";

const ANISKIP_BASE_URL = "https://api.aniskip.com";
const ANISKIP_PROVIDER = "aniskip";
const ANISKIP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EPISODE_LENGTH_BUCKET_SECONDS = 5;

export type AnimeSkipType = "op" | "ed" | "mixed-op" | "mixed-ed";

export type AnimeEpisodeSkipTimeDto = {
  skipType: AnimeSkipType;
  startTime: number;
  endTime: number;
  externalSkipId: string | null;
  episodeLength: number;
};

export type AnimeEpisodeSkipTimesDto = {
  found: boolean;
  source: "cache" | "aniskip" | "missing-mal-id";
  shikimoriId: number;
  malId: number | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeLength: number;
  results: AnimeEpisodeSkipTimeDto[];
};

type AniSkipResponse = {
  found?: boolean;
  results?: AniSkipResult[];
};

type AniSkipResult = {
  interval?: {
    startTime?: unknown;
    endTime?: unknown;
  };
  skipType?: unknown;
  skipId?: unknown;
  episodeLength?: unknown;
};

const DEFAULT_SKIP_TYPES: AnimeSkipType[] = ["op", "ed", "mixed-op", "mixed-ed"];

function normalizePositiveInt(value: number): number | null {
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function normalizeEpisodeLength(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds / EPISODE_LENGTH_BUCKET_SECONDS) * EPISODE_LENGTH_BUCKET_SECONDS;
}

function isSkipType(value: unknown): value is AnimeSkipType {
  return (
    value === "op" ||
    value === "ed" ||
    value === "mixed-op" ||
    value === "mixed-ed"
  );
}

function isFresh(date: Date): boolean {
  return Date.now() - date.getTime() < ANISKIP_CACHE_TTL_MS;
}

function mapCachedRow(row: {
  skipType: string;
  startTime: number;
  endTime: number;
  externalSkipId: string | null;
  episodeLength: number;
}): AnimeEpisodeSkipTimeDto | null {
  if (!isSkipType(row.skipType)) return null;
  return {
    skipType: row.skipType,
    startTime: row.startTime,
    endTime: row.endTime,
    externalSkipId: row.externalSkipId,
    episodeLength: row.episodeLength,
  };
}

function mapAniSkipResult(result: AniSkipResult, fallbackEpisodeLength: number): AnimeEpisodeSkipTimeDto | null {
  const startTime = Number(result.interval?.startTime);
  const endTime = Number(result.interval?.endTime);
  const episodeLength = Number(result.episodeLength);

  if (!isSkipType(result.skipType)) return null;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (startTime < 0 || endTime <= startTime) return null;

  return {
    skipType: result.skipType,
    startTime,
    endTime,
    externalSkipId: typeof result.skipId === "string" ? result.skipId : null,
    episodeLength: Number.isFinite(episodeLength) && episodeLength > 0 ? episodeLength : fallbackEpisodeLength,
  };
}

async function fetchAniSkipTimes(input: {
  malId: number;
  episodeNumber: number;
  episodeLength: number;
}): Promise<AnimeEpisodeSkipTimeDto[]> {
  const params = new URLSearchParams();
  for (const type of DEFAULT_SKIP_TYPES) {
    params.append("types", type);
  }
  params.set("episodeLength", String(input.episodeLength));

  const res = await fetch(
    `${ANISKIP_BASE_URL}/v2/skip-times/${input.malId}/${input.episodeNumber}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    },
  );

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`AniSkip API ${res.status}`);
  }

  const data = (await res.json()) as AniSkipResponse;
  if (!data.found || !Array.isArray(data.results)) return [];

  return data.results
    .map((result) => mapAniSkipResult(result, input.episodeLength))
    .filter((result): result is AnimeEpisodeSkipTimeDto => result != null);
}

async function loadCachedSkipTimes(input: {
  shikimoriId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeLength: number;
}): Promise<{ fresh: boolean; results: AnimeEpisodeSkipTimeDto[] }> {
  const rows = await prisma.animeEpisodeSkipTime.findMany({
    where: {
      provider: ANISKIP_PROVIDER,
      shikimoriId: input.shikimoriId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      episodeLength: input.episodeLength,
    },
    orderBy: [{ startTime: "asc" }, { skipType: "asc" }],
    select: {
      skipType: true,
      startTime: true,
      endTime: true,
      externalSkipId: true,
      episodeLength: true,
      syncedAt: true,
    },
  });

  if (rows.length === 0) return { fresh: false, results: [] };
  const fresh = rows.every((row) => isFresh(row.syncedAt));
  return {
    fresh,
    results: rows.map(mapCachedRow).filter((row): row is AnimeEpisodeSkipTimeDto => row != null),
  };
}

async function persistSkipTimes(input: {
  shikimoriId: number;
  malId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeLength: number;
  results: AnimeEpisodeSkipTimeDto[];
}): Promise<void> {
  const syncedAt = new Date();

  await prisma.$transaction([
    prisma.animeEpisodeSkipTime.deleteMany({
      where: {
        provider: ANISKIP_PROVIDER,
        malId: input.malId,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
        episodeLength: input.episodeLength,
      },
    }),
    ...input.results.map((result) =>
      prisma.animeEpisodeSkipTime.create({
        data: {
          shikimoriId: input.shikimoriId,
          malId: input.malId,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
          episodeLength: input.episodeLength,
          provider: ANISKIP_PROVIDER,
          skipType: result.skipType,
          startTime: result.startTime,
          endTime: result.endTime,
          externalSkipId: result.externalSkipId,
          syncedAt,
        },
      }),
    ),
  ]);
}

export async function getAnimeEpisodeSkipTimes(input: {
  shikimoriId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeLength: number;
  forceRefresh?: boolean;
}): Promise<AnimeEpisodeSkipTimesDto> {
  const shikimoriId = normalizePositiveInt(input.shikimoriId);
  const seasonNumber = normalizePositiveInt(input.seasonNumber) ?? 1;
  const episodeNumber = normalizePositiveInt(input.episodeNumber);
  const episodeLength = normalizeEpisodeLength(input.episodeLength);

  if (!shikimoriId || !episodeNumber || !episodeLength) {
    throw new Error("Invalid skip-times input");
  }

  if (!input.forceRefresh) {
    const cached = await loadCachedSkipTimes({
      shikimoriId,
      seasonNumber,
      episodeNumber,
      episodeLength,
    });
    if (cached.fresh && cached.results.length > 0) {
      const malId = await resolveMalIdForShikimoriId(shikimoriId);
      return {
        found: cached.results.length > 0,
        source: "cache",
        shikimoriId,
        malId,
        seasonNumber,
        episodeNumber,
        episodeLength,
        results: cached.results,
      };
    }
  }

  const malId = await resolveMalIdForShikimoriId(shikimoriId);
  if (!malId) {
    return {
      found: false,
      source: "missing-mal-id",
      shikimoriId,
      malId: null,
      seasonNumber,
      episodeNumber,
      episodeLength,
      results: [],
    };
  }

  const results = await fetchAniSkipTimes({ malId, episodeNumber, episodeLength });
  if (results.length > 0) {
    await persistSkipTimes({
      shikimoriId,
      malId,
      seasonNumber,
      episodeNumber,
      episodeLength,
      results,
    });
  }

  return {
    found: results.length > 0,
    source: "aniskip",
    shikimoriId,
    malId,
    seasonNumber,
    episodeNumber,
    episodeLength,
    results,
  };
}
