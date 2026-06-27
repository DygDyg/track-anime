import { prisma } from "@/lib/prisma";
import { extractScoreFromMaterialData, normalizeAnimeScore } from "@/lib/anime-score";
import {
  buildKodikEpisodeTotalsByShikimori,
  isOnSeasonMaxEpisode,
  loadEpisodeSeasonStats,
  resolveEpisodesTotal,
  resolveSeasonBounds,
  seasonStatsKey,
  type EpisodeSeasonStats,
  type KodikMaterialEpisodesHint,
} from "@/lib/episode-totals";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { getWatchHistoryCompleteThresholdRatio } from "@/lib/admin/watch-history-settings";
import { loadShikimoriAnimeCacheBatch } from "@/lib/shikimori/anime-cache";
import type { ShikimoriAnime } from "@/lib/shikimori/types";

export type WatchProgressDto = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type WatchHistoryItemDto = WatchProgressDto & {
  animeTitle: string;
  posterUrl: string | null;
  translationTitle: string;
  episodeDurationSeconds: number;
  watchProgressPercent: number;
  episodesTotal: number | null;
  score: string | null;
};

const DEFAULT_EPISODE_SECONDS = 24 * 60;

type SeasonCompleteContext = {
  episodesTotal: number;
  seasonMaxEpisode: number;
  maxSeason: number;
  episodeDurationSeconds: number;
};

function resolveEpisodeDurationSeconds(
  materialData: unknown,
  shikimoriAnime: ShikimoriAnime | undefined,
): number {
  if (shikimoriAnime) {
    return metaFromShikimoriAnime(shikimoriAnime).episodeDurationSeconds;
  }

  const fromMaterial = metaFromMaterialData(materialData);
  return fromMaterial.episodeDurationSeconds ?? DEFAULT_EPISODE_SECONDS;
}

function isPastCompleteEpisodeThreshold(
  positionSeconds: number,
  episodeDurationSeconds: number,
  thresholdRatio: number,
): boolean {
  if (episodeDurationSeconds <= 0) return false;
  return positionSeconds > episodeDurationSeconds * thresholdRatio;
}

function resolveEpisodesTotalForRow(
  material: KodikMaterialEpisodesHint | undefined,
  shikimoriAnime: ShikimoriAnime | undefined,
  shikimoriId: number,
  kodikTotals: Map<number, number>,
  episodeStats: EpisodeSeasonStats,
  kodikId: string,
  seasonNumber: number,
): number | null {
  const kodikSeasonMaxEpisode =
    episodeStats.maxEpisodeByMaterialSeason.get(seasonStatsKey(kodikId, seasonNumber)) ?? null;

  return resolveEpisodesTotal({
    materialData: material?.materialData,
    shikimoriAnime,
    material,
    kodikShikimoriMax: kodikTotals.get(shikimoriId),
    kodikSeasonMaxEpisode,
  });
}

function isWatchProgressCompleteFromSeasonMeta(
  seasonNumber: number,
  episodeNumber: number,
  positionSeconds: number,
  kodikId: string,
  material: KodikMaterialEpisodesHint | undefined,
  episodesTotal: number | null,
  episodeDurationSeconds: number,
  stats: EpisodeSeasonStats,
  thresholdRatio: number,
): boolean {
  if (episodesTotal == null) return false;
  if (!isOnSeasonMaxEpisode(seasonNumber, episodeNumber, kodikId, material, episodesTotal, stats)) {
    return false;
  }
  return isPastCompleteEpisodeThreshold(positionSeconds, episodeDurationSeconds, thresholdRatio);
}

async function resolveSeasonCompleteContext(
  shikimoriId: number,
  kodikId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<SeasonCompleteContext | null> {
  const [material, shikimoriAnime, stats, kodikTotals] = await Promise.all([
    prisma.kodikMaterial.findUnique({
      where: { kodikId },
      select: {
        materialData: true,
        lastSeason: true,
        lastEpisode: true,
        episodesCount: true,
      },
    }),
    loadShikimoriAnimeCacheBatch([shikimoriId], { allowStale: true }).then(
      (map) => map.get(shikimoriId),
    ),
    loadEpisodeSeasonStats([kodikId]),
    prisma.kodikMaterial
      .findMany({
        where: { shikimoriId },
        select: { shikimoriId: true, lastEpisode: true, episodesCount: true, materialData: true },
      })
      .then(buildKodikEpisodeTotalsByShikimori),
  ]);

  const kodikSeasonMaxEpisode =
    stats.maxEpisodeByMaterialSeason.get(seasonStatsKey(kodikId, seasonNumber)) ?? null;
  const episodesTotal = resolveEpisodesTotal({
    materialData: material?.materialData,
    shikimoriAnime,
    material: material ?? undefined,
    kodikShikimoriMax: kodikTotals.get(shikimoriId),
    kodikSeasonMaxEpisode,
  });
  if (episodesTotal == null) return null;

  const bounds = resolveSeasonBounds(
    kodikId,
    seasonNumber,
    material ?? undefined,
    episodesTotal,
    stats,
  );
  if (!bounds || episodeNumber < bounds.seasonMaxEpisode) return null;

  return {
    episodesTotal,
    seasonMaxEpisode: bounds.seasonMaxEpisode,
    maxSeason: bounds.maxSeason,
    episodeDurationSeconds: resolveEpisodeDurationSeconds(material?.materialData, shikimoriAnime),
  };
}

async function clearCompletedWatchProgress(
  userId: string,
  shikimoriId: number,
  input: {
    kodikId: string;
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  },
): Promise<boolean> {
  const context = await resolveSeasonCompleteContext(
    shikimoriId,
    input.kodikId,
    input.seasonNumber,
    input.episodeNumber,
  );
  if (!context) return false;

  const thresholdRatio = await getWatchHistoryCompleteThresholdRatio();
  if (!isPastCompleteEpisodeThreshold(input.positionSeconds, context.episodeDurationSeconds, thresholdRatio)) {
    return false;
  }

  await deleteWatchProgress(userId, shikimoriId);
  return true;
}

type ShikimoriHistoryMeta = {
  episodeDurationSeconds: number;
  episodesTotal: number | null;
};

type KodikMaterialMetaRow = KodikMaterialEpisodesHint;

function mapRow(row: {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}): WatchProgressDto {
  return {
    shikimoriId: row.shikimoriId,
    kodikId: row.kodikId,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    positionSeconds: row.positionSeconds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function formatWatchPosition(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatEpisodeOfTotal(episodeNumber: number, episodesTotal: number | null): string {
  if (episodesTotal != null && episodesTotal > 0) {
    return `серия ${episodeNumber} из ${episodesTotal}`;
  }
  return `серия ${episodeNumber}`;
}

export async function getWatchProgress(
  userId: string,
  shikimoriId: number,
): Promise<WatchProgressDto | null> {
  const row = await prisma.userWatchProgress.findUnique({
    where: { userId_shikimoriId: { userId, shikimoriId } },
  });
  return row ? mapRow(row) : null;
}

export async function upsertWatchProgress(
  userId: string,
  input: {
    shikimoriId: number;
    kodikId: string;
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
  },
): Promise<WatchProgressDto | null> {
  if (await clearCompletedWatchProgress(userId, input.shikimoriId, input)) {
    return null;
  }

  const row = await prisma.userWatchProgress.upsert({
    where: {
      userId_shikimoriId: {
        userId,
        shikimoriId: input.shikimoriId,
      },
    },
    create: {
      userId,
      shikimoriId: input.shikimoriId,
      kodikId: input.kodikId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      positionSeconds: input.positionSeconds,
    },
    update: {
      kodikId: input.kodikId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      positionSeconds: input.positionSeconds,
    },
  });

  return mapRow(row);
}

export async function deleteWatchProgress(userId: string, shikimoriId: number): Promise<boolean> {
  const result = await prisma.userWatchProgress.deleteMany({
    where: { userId, shikimoriId },
  });
  return result.count > 0;
}

function metaFromMaterialData(data: unknown): Partial<ShikimoriHistoryMeta> {
  if (!data || typeof data !== "object") return {};

  const record = data as Record<string, unknown>;
  const durationMinutes = typeof record.duration === "number" ? record.duration : null;

  return {
    ...(durationMinutes != null && durationMinutes > 0
      ? { episodeDurationSeconds: durationMinutes * 60 }
      : {}),
  };
}

function metaFromShikimoriAnime(anime: ShikimoriAnime): ShikimoriHistoryMeta {
  return {
    episodeDurationSeconds:
      anime.duration != null && anime.duration > 0
        ? anime.duration * 60
        : DEFAULT_EPISODE_SECONDS,
    episodesTotal: anime.episodes,
  };
}

function buildPosterByShikimori(materials: KodikMaterialMetaRow[]): Map<number, string> {
  const posters = new Map<number, string>();

  for (const material of materials) {
    if (material.shikimoriId == null) continue;
    if (posters.has(material.shikimoriId)) continue;

    const poster = resolveMaterialPosterUrl(material.materialData as MaterialPosterSource);
    if (poster) {
      posters.set(material.shikimoriId, poster);
    }
  }

  return posters;
}

function resolveHistoryMeta(
  shikimoriId: number,
  material: KodikMaterialEpisodesHint | undefined,
  shikimoriAnime: ShikimoriAnime | undefined,
  kodikTotals: Map<number, number>,
  episodeStats: EpisodeSeasonStats,
  kodikId: string,
  seasonNumber: number,
): ShikimoriHistoryMeta {
  const fromMaterial = metaFromMaterialData(material?.materialData);
  const episodesTotal = resolveEpisodesTotalForRow(
    material,
    shikimoriAnime,
    shikimoriId,
    kodikTotals,
    episodeStats,
    kodikId,
    seasonNumber,
  );

  return {
    episodeDurationSeconds: shikimoriAnime
      ? metaFromShikimoriAnime(shikimoriAnime).episodeDurationSeconds
      : (fromMaterial.episodeDurationSeconds ?? DEFAULT_EPISODE_SECONDS),
    episodesTotal,
  };
}

async function resolveReleasePosterMap(shikimoriIds: number[]): Promise<Map<number, string>> {
  if (shikimoriIds.length === 0) return new Map();

  const releases = await prisma.kodikEpisodeRelease.findMany({
    where: {
      shikimoriId: { in: shikimoriIds },
      NOT: { posterUrl: null },
    },
    orderBy: { releasedAt: "desc" },
    distinct: ["shikimoriId"],
    select: { shikimoriId: true, posterUrl: true },
  });

  const posters = new Map<number, string>();
  for (const release of releases) {
    if (release.shikimoriId == null || !release.posterUrl) continue;
    posters.set(release.shikimoriId, release.posterUrl);
  }
  return posters;
}

function watchProgressPercent(positionSeconds: number, episodeDurationSeconds: number): number {
  if (episodeDurationSeconds <= 0) return 0;
  return Math.min(100, Math.round((positionSeconds / episodeDurationSeconds) * 100));
}

export async function getWatchHistory(userId: string, limit = 100): Promise<WatchHistoryItemDto[]> {
  const rows = await prisma.userWatchProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  if (rows.length === 0) return [];

  const shikimoriIds = [...new Set(rows.map((row) => row.shikimoriId))];
  const kodikIds = [...new Set(rows.map((row) => row.kodikId))];

  const [materialsByKodikId, materialsByShikimoriId, shikimoriAnimeCache, releasePosters, episodeStats] =
    await Promise.all([
      prisma.kodikMaterial.findMany({
        where: { kodikId: { in: kodikIds } },
        select: {
          kodikId: true,
          title: true,
          translationTitle: true,
          materialData: true,
          shikimoriId: true,
          lastSeason: true,
          lastEpisode: true,
          episodesCount: true,
        },
      }),
      prisma.kodikMaterial.findMany({
        where: { shikimoriId: { in: shikimoriIds } },
        select: {
          shikimoriId: true,
          lastEpisode: true,
          episodesCount: true,
          materialData: true,
        },
      }),
      loadShikimoriAnimeCacheBatch(shikimoriIds, { allowStale: true }),
      resolveReleasePosterMap(shikimoriIds),
      loadEpisodeSeasonStats(kodikIds),
    ]);

  const materialById = new Map(materialsByKodikId.map((material) => [material.kodikId, material]));
  const kodikTotals = buildKodikEpisodeTotalsByShikimori(materialsByShikimoriId);
  const posterByShikimori = buildPosterByShikimori(materialsByShikimoriId);
  const completeThresholdRatio = await getWatchHistoryCompleteThresholdRatio();

  const items: WatchHistoryItemDto[] = [];

  for (const row of rows) {
    const material = materialById.get(row.kodikId);
    const shikimoriAnime = shikimoriAnimeCache.get(row.shikimoriId);
    const meta = resolveHistoryMeta(
      row.shikimoriId,
      material,
      shikimoriAnime,
      kodikTotals,
      episodeStats,
      row.kodikId,
      row.seasonNumber,
    );

    const episodesTotal = meta.episodesTotal;
    const episodeDurationSeconds = meta.episodeDurationSeconds;

    if (
      isWatchProgressCompleteFromSeasonMeta(
        row.seasonNumber,
        row.episodeNumber,
        row.positionSeconds,
        row.kodikId,
        material,
        episodesTotal,
        episodeDurationSeconds,
        episodeStats,
        completeThresholdRatio,
      )
    ) {
      await deleteWatchProgress(userId, row.shikimoriId);
      continue;
    }

    const posterFromMaterial = material?.materialData
      ? resolveMaterialPosterUrl(material.materialData as MaterialPosterSource)
      : null;

    const posterUrl =
      posterFromMaterial ??
      posterByShikimori.get(row.shikimoriId) ??
      releasePosters.get(row.shikimoriId) ??
      null;

    items.push({
      ...mapRow(row),
      animeTitle: material?.title ?? shikimoriAnime?.russian ?? shikimoriAnime?.name ?? `Аниме #${row.shikimoriId}`,
      translationTitle: material?.translationTitle ?? "Озвучка",
      posterUrl,
      episodeDurationSeconds: meta.episodeDurationSeconds,
      episodesTotal: meta.episodesTotal,
      watchProgressPercent: watchProgressPercent(row.positionSeconds, meta.episodeDurationSeconds),
      score:
        normalizeAnimeScore(shikimoriAnime?.score) ??
        extractScoreFromMaterialData(material?.materialData),
    });
  }

  return items;
}
