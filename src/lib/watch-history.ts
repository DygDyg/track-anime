import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
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
};

const DEFAULT_EPISODE_SECONDS = 24 * 60;

type ShikimoriHistoryMeta = {
  episodeDurationSeconds: number;
  episodesTotal: number | null;
};

type KodikMaterialMetaRow = {
  shikimoriId: number | null;
  lastEpisode: number | null;
  episodesCount: number | null;
  materialData: unknown;
};

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
): Promise<WatchProgressDto> {
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
  const episodesTotal =
    typeof record.episodes_total === "number"
      ? record.episodes_total
      : typeof record.shikimori_episodes === "number"
        ? record.shikimori_episodes
        : null;

  return {
    ...(durationMinutes != null && durationMinutes > 0
      ? { episodeDurationSeconds: durationMinutes * 60 }
      : {}),
    ...(episodesTotal != null && episodesTotal > 0 ? { episodesTotal } : {}),
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

function buildKodikEpisodeTotals(materials: KodikMaterialMetaRow[]): Map<number, number> {
  const totals = new Map<number, number>();

  for (const material of materials) {
    if (material.shikimoriId == null) continue;

    const candidate = material.lastEpisode ?? material.episodesCount;
    if (candidate == null || candidate <= 0) continue;

    const prev = totals.get(material.shikimoriId);
    if (prev == null || candidate > prev) {
      totals.set(material.shikimoriId, candidate);
    }
  }

  return totals;
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
  materialData: unknown,
  shikimoriAnime: ShikimoriAnime | undefined,
  kodikTotals: Map<number, number>,
): ShikimoriHistoryMeta {
  if (shikimoriAnime) {
    return metaFromShikimoriAnime(shikimoriAnime);
  }

  const fromMaterial = metaFromMaterialData(materialData);
  const episodesTotal = fromMaterial.episodesTotal ?? kodikTotals.get(shikimoriId) ?? null;

  return {
    episodeDurationSeconds:
      fromMaterial.episodeDurationSeconds ?? DEFAULT_EPISODE_SECONDS,
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

  const [materialsByKodikId, materialsByShikimoriId, shikimoriAnimeCache, releasePosters] =
    await Promise.all([
      prisma.kodikMaterial.findMany({
        where: { kodikId: { in: kodikIds } },
        select: {
          kodikId: true,
          title: true,
          translationTitle: true,
          materialData: true,
          shikimoriId: true,
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
    ]);

  const materialById = new Map(materialsByKodikId.map((material) => [material.kodikId, material]));
  const kodikTotals = buildKodikEpisodeTotals(materialsByShikimoriId);
  const posterByShikimori = buildPosterByShikimori(materialsByShikimoriId);

  return rows.map((row) => {
    const material = materialById.get(row.kodikId);
    const posterFromMaterial = material?.materialData
      ? resolveMaterialPosterUrl(material.materialData as MaterialPosterSource)
      : null;
    const shikimoriAnime = shikimoriAnimeCache.get(row.shikimoriId);
    const meta = resolveHistoryMeta(
      row.shikimoriId,
      material?.materialData,
      shikimoriAnime,
      kodikTotals,
    );

    const posterUrl =
      posterFromMaterial ??
      posterByShikimori.get(row.shikimoriId) ??
      releasePosters.get(row.shikimoriId) ??
      null;

    return {
      ...mapRow(row),
      animeTitle: material?.title ?? shikimoriAnime?.russian ?? shikimoriAnime?.name ?? `Аниме #${row.shikimoriId}`,
      translationTitle: material?.translationTitle ?? "Озвучка",
      posterUrl,
      episodeDurationSeconds: meta.episodeDurationSeconds,
      episodesTotal: meta.episodesTotal,
      watchProgressPercent: watchProgressPercent(row.positionSeconds, meta.episodeDurationSeconds),
    };
  });
}
