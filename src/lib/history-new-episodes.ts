import { extractScoreFromMaterialData } from "@/lib/anime-score";
import { toDate } from "@/lib/dates";
import { resolveEpisodesTotal } from "@/lib/episode-totals";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { prisma } from "@/lib/prisma";
import type { ReleaseItem } from "@/lib/releases";
import { pickScreenshotUrl } from "@/lib/screenshots";

export type HistoryNewEpisodeItem = ReleaseItem & {
  watchedSeasonNumber: number;
  watchedEpisodeNumber: number;
};

const HISTORY_NEW_EPISODE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

type MaterialRow = {
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

function readEpisodesTotal(material: MaterialRow): number | null {
  return resolveEpisodesTotal({
    materialData: material.materialData,
    material,
  });
}

function episodeRank(season: number, episode: number): number {
  return season * 100_000 + episode;
}

function isEpisodeNewer(
  watchedSeason: number,
  watchedEpisode: number,
  latestSeason: number,
  latestEpisode: number,
): boolean {
  return episodeRank(latestSeason, latestEpisode) > episodeRank(watchedSeason, watchedEpisode);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
}

function mapMaterialToReleaseItem(
  material: MaterialRow,
  seasonNumber: number,
  episodeNumber: number,
  playerLink: string | null,
  episodeScreenshots: unknown,
  releasedAt: Date,
): ReleaseItem {
  const data = material.materialData as MaterialPosterSource & {
    anime_title?: string;
    anime_description?: string;
    description?: string;
    anime_genres?: unknown;
    all_genres?: unknown;
    genres?: unknown;
    anime_status?: string;
    screenshots?: unknown;
  };

  return {
    id: String(material.shikimoriId),
    animeTitle: data?.anime_title?.trim() || material.title,
    posterUrl: resolveMaterialPosterUrl({
      anime_poster_url: data?.anime_poster_url ?? data?.poster_url ?? data?.worldart_poster_url,
      worldart_link: data?.worldart_link,
    }),
    screenshotUrl: pickScreenshotUrl([data?.screenshots, episodeScreenshots], String(material.shikimoriId)),
    seasonNumber,
    episodeNumber,
    translationName: material.translationTitle,
    playerLink,
    shikimoriId: material.shikimoriId,
    releasedAt,
    description: data?.anime_description || data?.description ? stripHtml(data.anime_description ?? data.description ?? "") : null,
    genres: parseGenres(data?.anime_genres ?? data?.all_genres ?? data?.genres),
    status: data?.anime_status?.trim() || null,
    score: extractScoreFromMaterialData(material.materialData),
  };
}

function episodeKey(materialId: string, seasonNumber: number, episodeNumber: number): string {
  return `${materialId}:${seasonNumber}:${episodeNumber}`;
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
function isCompletedSeriesBacklog(
  material: MaterialRow,
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

function resolveFreshnessDate(
  material: MaterialRow,
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

/** Тайтлы из истории: та же озвучка, новая серия не старше 3 месяцев. */
export async function getHistoryNewEpisodes(userId: string, limit = 48): Promise<HistoryNewEpisodeItem[]> {
  const progressRows = await prisma.userWatchProgress.findMany({
    where: { userId },
    select: {
      shikimoriId: true,
      seasonNumber: true,
      episodeNumber: true,
      kodikId: true,
    },
  });

  if (progressRows.length === 0) return [];

  const kodikIds = [...new Set(progressRows.map((row) => row.kodikId))];
  const materials = await prisma.kodikMaterial.findMany({
    where: {
      kodikId: { in: kodikIds },
      lastEpisode: { gt: 0 },
    },
    select: {
      shikimoriId: true,
      kodikId: true,
      title: true,
      lastSeason: true,
      lastEpisode: true,
      episodesCount: true,
      kodikUpdatedAt: true,
      updatedAt: true,
      translationTitle: true,
      playerLink: true,
      materialData: true,
    },
  });

  const materialByKodikId = new Map(materials.map((material) => [material.kodikId, material]));

  type Candidate = {
    shikimoriId: number;
    watchedSeasonNumber: number;
    watchedEpisodeNumber: number;
    latestSeason: number;
    latestEpisode: number;
    displayMaterial: MaterialRow;
  };

  const candidates: Candidate[] = [];

  for (const progress of progressRows) {
    const userMaterial = materialByKodikId.get(progress.kodikId);
    if (!userMaterial?.lastEpisode) continue;

    const latestSeason = userMaterial.lastSeason ?? 1;
    const latestEpisode = userMaterial.lastEpisode;

    if (
      !isEpisodeNewer(
        progress.seasonNumber,
        progress.episodeNumber,
        latestSeason,
        latestEpisode,
      )
    ) {
      continue;
    }

    candidates.push({
      shikimoriId: progress.shikimoriId,
      watchedSeasonNumber: progress.seasonNumber,
      watchedEpisodeNumber: progress.episodeNumber,
      latestSeason,
      latestEpisode,
      displayMaterial: userMaterial,
    });
  }

  if (candidates.length === 0) return [];

  const [episodes, releaseRows] = await Promise.all([
    prisma.kodikEpisode.findMany({
      where: {
        OR: candidates.map((candidate) => ({
          materialId: candidate.displayMaterial.kodikId,
          seasonNumber: candidate.latestSeason,
          episodeNumber: candidate.latestEpisode,
        })),
      },
      select: {
        materialId: true,
        seasonNumber: true,
        episodeNumber: true,
        playerLink: true,
        screenshots: true,
        firstSeenAt: true,
      },
    }),
    prisma.kodikEpisodeRelease.findMany({
      where: {
        OR: candidates.map((candidate) => ({
          materialId: candidate.displayMaterial.kodikId,
          seasonNumber: candidate.latestSeason,
          episodeNumber: candidate.latestEpisode,
        })),
      },
      select: {
        materialId: true,
        seasonNumber: true,
        episodeNumber: true,
        releasedAt: true,
      },
    }),
  ]);

  const episodeByKey = new Map(
    episodes.map((episode) => [
      episodeKey(episode.materialId, episode.seasonNumber, episode.episodeNumber),
      episode,
    ]),
  );

  const releaseByKey = new Map(
    releaseRows.map((release) => [
      episodeKey(release.materialId, release.seasonNumber, release.episodeNumber),
      release.releasedAt,
    ]),
  );

  const cutoff = new Date(Date.now() - HISTORY_NEW_EPISODE_MAX_AGE_MS);

  const freshCandidates = candidates
    .map((candidate) => {
      const key = episodeKey(
        candidate.displayMaterial.kodikId,
        candidate.latestSeason,
        candidate.latestEpisode,
      );
      const episode = episodeByKey.get(key);
      const releasedAt = resolveFreshnessDate(
        candidate.displayMaterial,
        candidate.latestEpisode,
        releaseByKey.get(key),
        episode?.firstSeenAt,
        cutoff,
      );

      return { candidate, episode, releasedAt };
    })
    .filter((entry): entry is typeof entry & { releasedAt: Date } => {
      const { candidate, releasedAt } = entry;
      if (
        isCompletedSeriesBacklog(
          candidate.displayMaterial,
          cutoff,
          candidate.latestEpisode,
        )
      ) {
        return false;
      }
      return releasedAt != null;
    })
    .sort((left, right) => {
      const byDate = right.releasedAt.getTime() - left.releasedAt.getTime();
      if (byDate !== 0) return byDate;
      return left.candidate.shikimoriId - right.candidate.shikimoriId;
    })
    .slice(0, limit);

  return freshCandidates.map(({ candidate, episode, releasedAt }) => {
    const release = mapMaterialToReleaseItem(
      candidate.displayMaterial,
      candidate.latestSeason,
      candidate.latestEpisode,
      episode?.playerLink ?? candidate.displayMaterial.playerLink,
      episode?.screenshots,
      releasedAt ?? new Date(0),
    );

    return {
      ...release,
      releasedAt: toDate(release.releasedAt),
      watchedSeasonNumber: candidate.watchedSeasonNumber,
      watchedEpisodeNumber: candidate.watchedEpisodeNumber,
    };
  });
}
