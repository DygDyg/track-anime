import { prisma } from "@/lib/prisma";
import type { ShikimoriAnime } from "@/lib/shikimori/types";

export type KodikMaterialEpisodesHint = {
  shikimoriId?: number | null;
  lastSeason?: number | null;
  lastEpisode?: number | null;
  episodesCount?: number | null;
  materialData?: unknown;
};

export type ResolveEpisodesTotalInput = {
  materialData?: unknown;
  shikimoriAnime?: ShikimoriAnime | null;
  material?: KodikMaterialEpisodesHint | null;
  kodikShikimoriMax?: number | null;
  kodikSeasonMaxEpisode?: number | null;
};

export type EpisodeSeasonStats = {
  maxEpisodeByMaterialSeason: Map<string, number>;
  maxSeasonByMaterial: Map<string, number>;
};

export function seasonStatsKey(materialId: string, seasonNumber: number): string {
  return `${materialId}:${seasonNumber}`;
}

/** episodes_total / shikimori_episodes из JSON materialData. */
export function readEpisodesTotalFromMaterialData(materialData: unknown): number | null {
  if (!materialData || typeof materialData !== "object") return null;

  const record = materialData as Record<string, unknown>;
  const total =
    typeof record.episodes_total === "number"
      ? record.episodes_total
      : typeof record.shikimori_episodes === "number"
        ? record.shikimori_episodes
        : null;

  return total != null && total > 0 ? total : null;
}

/** Максимум lastEpisode/episodesCount по всем озвучкам одного shikimoriId. */
export function buildKodikEpisodeTotalsByShikimori(
  materials: KodikMaterialEpisodesHint[],
): Map<number, number> {
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

/**
 * Единый резолвер максимального числа серий:
 * Shikimori → materialData → поля материала → агрегат по shikimoriId → MAX в сезоне из KodikEpisode.
 */
export function resolveEpisodesTotal(input: ResolveEpisodesTotalInput): number | null {
  const candidates: number[] = [];
  const materialData = input.materialData ?? input.material?.materialData;

  if (input.shikimoriAnime?.episodes != null && input.shikimoriAnime.episodes > 0) {
    candidates.push(input.shikimoriAnime.episodes);
  }

  const fromMaterialData = readEpisodesTotalFromMaterialData(materialData);
  if (fromMaterialData != null) candidates.push(fromMaterialData);

  if (input.material?.lastEpisode != null && input.material.lastEpisode > 0) {
    candidates.push(input.material.lastEpisode);
  }
  if (input.material?.episodesCount != null && input.material.episodesCount > 0) {
    candidates.push(input.material.episodesCount);
  }
  if (input.kodikShikimoriMax != null && input.kodikShikimoriMax > 0) {
    candidates.push(input.kodikShikimoriMax);
  }
  if (input.kodikSeasonMaxEpisode != null && input.kodikSeasonMaxEpisode > 0) {
    candidates.push(input.kodikSeasonMaxEpisode);
  }

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

/** Максимум серий по всем озвучкам и источникам метаданных одного тайтла. */
export function resolveEpisodesTotalForShikimoriMaterials(
  shikimoriId: number,
  shikimoriAnime: ShikimoriAnime | null | undefined,
  materials: KodikMaterialEpisodesHint[],
): number | null {
  const kodikShikimoriMax = buildKodikEpisodeTotalsByShikimori(
    materials.map((material) => ({ ...material, shikimoriId })),
  ).get(shikimoriId);

  const candidates: number[] = [];
  const fromAnime = resolveEpisodesTotal({ shikimoriAnime, kodikShikimoriMax });
  if (fromAnime != null) candidates.push(fromAnime);

  for (const material of materials) {
    const total = resolveEpisodesTotal({
      materialData: material.materialData,
      material,
      kodikShikimoriMax,
    });
    if (total != null) candidates.push(total);
  }

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

export async function loadEpisodeSeasonStats(materialIds: string[]): Promise<EpisodeSeasonStats> {
  if (materialIds.length === 0) {
    return { maxEpisodeByMaterialSeason: new Map(), maxSeasonByMaterial: new Map() };
  }

  const rows = await prisma.kodikEpisode.groupBy({
    by: ["materialId", "seasonNumber"],
    where: { materialId: { in: materialIds } },
    _max: { episodeNumber: true },
  });

  const maxEpisodeByMaterialSeason = new Map<string, number>();
  const maxSeasonByMaterial = new Map<string, number>();

  for (const row of rows) {
    const maxEpisode = row._max.episodeNumber;
    if (maxEpisode == null || maxEpisode <= 0) continue;

    maxEpisodeByMaterialSeason.set(seasonStatsKey(row.materialId, row.seasonNumber), maxEpisode);

    const prevMaxSeason = maxSeasonByMaterial.get(row.materialId) ?? 0;
    if (row.seasonNumber > prevMaxSeason) {
      maxSeasonByMaterial.set(row.materialId, row.seasonNumber);
    }
  }

  return { maxEpisodeByMaterialSeason, maxSeasonByMaterial };
}

export function resolveSeasonBounds(
  kodikId: string,
  seasonNumber: number,
  material: Pick<KodikMaterialEpisodesHint, "lastSeason"> | undefined,
  episodesTotal: number | null,
  stats: EpisodeSeasonStats,
): { maxSeason: number; seasonMaxEpisode: number } | null {
  const maxSeasonFromDb = stats.maxSeasonByMaterial.get(kodikId);
  const maxSeason = maxSeasonFromDb ?? material?.lastSeason ?? 1;

  if (seasonNumber !== maxSeason) return null;

  const fromDb = stats.maxEpisodeByMaterialSeason.get(seasonStatsKey(kodikId, seasonNumber)) ?? 0;

  if (episodesTotal == null || episodesTotal <= 0) {
    if (fromDb <= 0) return null;
    return { maxSeason, seasonMaxEpisode: fromDb };
  }

  return { maxSeason, seasonMaxEpisode: Math.max(fromDb, episodesTotal) };
}

export function isOnSeasonMaxEpisode(
  seasonNumber: number,
  episodeNumber: number,
  kodikId: string,
  material: Pick<KodikMaterialEpisodesHint, "lastSeason"> | undefined,
  episodesTotal: number | null,
  stats: EpisodeSeasonStats,
): boolean {
  const bounds = resolveSeasonBounds(kodikId, seasonNumber, material, episodesTotal, stats);
  if (!bounds) return false;
  return episodeNumber >= bounds.seasonMaxEpisode;
}
