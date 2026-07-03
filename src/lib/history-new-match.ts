import { resolveEpisodesTotal } from "@/lib/episode-totals";

export const HISTORY_NEW_EPISODE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type HistoryNewMaterialRow = {
  shikimoriId: number | null;
  kodikId: string;
  title: string;
  lastSeason: number | null;
  lastEpisode: number | null;
  episodesCount: number | null;
  kodikUpdatedAt: Date | null;
  updatedAt: Date;
  translationTitle: string;
  playerLink: string | null;
  materialData: unknown;
};

export type HistoryNewProgressRow = {
  userId: string;
  shikimoriId: number;
  seasonNumber: number;
  episodeNumber: number;
  kodikId: string;
};

export function episodeRank(season: number, episode: number): number {
  return season * 100_000 + episode;
}

export function isEpisodeNewer(
  watchedSeason: number,
  watchedEpisode: number,
  latestSeason: number,
  latestEpisode: number,
): boolean {
  return episodeRank(latestSeason, latestEpisode) > episodeRank(watchedSeason, watchedEpisode);
}

export function historyNewEpisodeKey(
  materialId: string,
  seasonNumber: number,
  episodeNumber: number,
): string {
  return `${materialId}:${seasonNumber}:${episodeNumber}`;
}

function readEpisodesTotal(material: HistoryNewMaterialRow): number | null {
  return resolveEpisodesTotal({
    materialData: material.materialData,
    material,
  });
}

function parseSeriesEndDate(materialData: unknown): Date | null {
  if (!materialData || typeof materialData !== "object") return null;

  const data = materialData as { released_at?: unknown; aired_at?: unknown };
  const raw = data.released_at ?? data.aired_at;
  if (typeof raw !== "string" || !raw.trim()) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readMaterialStatus(materialData: unknown): string | null {
  if (!materialData || typeof materialData !== "object") return null;
  const data = materialData as { anime_status?: unknown; all_status?: unknown };
  if (typeof data.anime_status === "string") return data.anime_status;
  if (typeof data.all_status === "string") return data.all_status;
  return null;
}

function isActiveMaterial(materialData: unknown): boolean {
  const status = readMaterialStatus(materialData);
  return status === "ongoing" || status === "anons";
}

/** Завершённый тайтл, последняя серия вышла давно — это бэклог, а не «новинка». */
export function isCompletedSeriesBacklog(
  material: HistoryNewMaterialRow,
  cutoff: Date,
  latestEpisode: number,
): boolean {
  const materialData = material.materialData;
  const status = readMaterialStatus(materialData);
  if (status === "ongoing" || status === "anons") return false;

  const endDate = parseSeriesEndDate(materialData);
  if (endDate && endDate >= cutoff) return false;
  if (endDate && endDate < cutoff) return true;

  if (status !== "released") return false;

  const episodesTotal = readEpisodesTotal(material);
  const year = (materialData as { year?: unknown }).year;
  if (
    episodesTotal != null &&
    latestEpisode >= episodesTotal &&
    typeof year === "number" &&
    year < cutoff.getFullYear() - 1
  ) {
    return true;
  }

  return false;
}

export function resolveHistoryNewFreshnessDate(
  material: HistoryNewMaterialRow,
  latestEpisode: number,
  releaseAt: Date | undefined,
  firstSeenAt: Date | undefined,
  cutoff: Date,
): Date | null {
  const materialData = material.materialData;
  const trackedAt = releaseAt ?? firstSeenAt ?? null;
  const endDate = parseSeriesEndDate(materialData);
  const episodesTotal = readEpisodesTotal(material);

  if (trackedAt && trackedAt >= cutoff) {
    return trackedAt;
  }

  if (isActiveMaterial(materialData) && material.kodikUpdatedAt && material.kodikUpdatedAt >= cutoff) {
    return material.kodikUpdatedAt;
  }

  if (
    endDate &&
    endDate >= cutoff &&
    episodesTotal != null &&
    latestEpisode >= episodesTotal
  ) {
    return endDate;
  }

  if (
    material.kodikUpdatedAt &&
    material.kodikUpdatedAt >= cutoff &&
    endDate &&
    endDate >= cutoff
  ) {
    return material.kodikUpdatedAt;
  }

  return null;
}

export function historyNewCutoffDate(now = Date.now()): Date {
  return new Date(now - HISTORY_NEW_EPISODE_MAX_AGE_MS);
}

export function isHistoryNewReleaseFresh(
  material: HistoryNewMaterialRow,
  seasonNumber: number,
  episodeNumber: number,
  releaseAt: Date | undefined,
  firstSeenAt: Date | undefined,
  cutoff = historyNewCutoffDate(),
): boolean {
  if (isCompletedSeriesBacklog(material, cutoff, episodeNumber)) {
    return false;
  }

  return (
    resolveHistoryNewFreshnessDate(
      material,
      episodeNumber,
      releaseAt,
      firstSeenAt,
      cutoff,
    ) != null
  );
}
