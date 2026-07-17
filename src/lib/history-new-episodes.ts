import { extractScoreFromMaterialData } from "@/lib/anime-score";
import { toDate } from "@/lib/dates";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import {
  historyNewCutoffDate,
  historyNewEpisodeKey,
  isCompletedSeriesBacklog,
  isEpisodeNewer,
  resolveHistoryNewFreshnessDate,
  type HistoryNewMaterialRow,
} from "@/lib/history-new-match";
import { prisma } from "@/lib/prisma";
import type { ReleaseItem } from "@/lib/releases";
import { pickScreenshotUrl } from "@/lib/screenshots";
import { watchProgressPercent } from "@/lib/watch-history";

export type HistoryNewEpisodeItem = ReleaseItem & {
  watchedSeasonNumber: number;
  watchedEpisodeNumber: number;
  watchedPositionSeconds: number;
  watchedEpisodeDurationSeconds: number;
  watchedProgressPercent: number;
};

const DEFAULT_EPISODE_SECONDS = 24 * 60;

function episodeDurationFromMaterialData(data: unknown): number {
  if (!data || typeof data !== "object") return DEFAULT_EPISODE_SECONDS;
  const duration = (data as Record<string, unknown>).duration;
  return typeof duration === "number" && duration > 0 ? duration * 60 : DEFAULT_EPISODE_SECONDS;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
}

function mapMaterialToReleaseItem(
  material: HistoryNewMaterialRow,
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
    anime_kind?: string;
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
    kind: data?.anime_kind?.trim() || null,
  };
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
      positionSeconds: true,
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
    watchedPositionSeconds: number;
    watchedEpisodeDurationSeconds: number;
    watchedProgressPercent: number;
    latestSeason: number;
    latestEpisode: number;
    displayMaterial: HistoryNewMaterialRow;
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

    const episodeDurationSeconds = episodeDurationFromMaterialData(userMaterial.materialData);
    const progressPercent = watchProgressPercent(progress.positionSeconds, episodeDurationSeconds);

    candidates.push({
      shikimoriId: progress.shikimoriId,
      watchedSeasonNumber: progress.seasonNumber,
      watchedEpisodeNumber: progress.episodeNumber,
      watchedPositionSeconds: progress.positionSeconds,
      watchedEpisodeDurationSeconds: episodeDurationSeconds,
      watchedProgressPercent: progressPercent,
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
      historyNewEpisodeKey(episode.materialId, episode.seasonNumber, episode.episodeNumber),
      episode,
    ]),
  );

  const releaseByKey = new Map(
    releaseRows.map((release) => [
      historyNewEpisodeKey(release.materialId, release.seasonNumber, release.episodeNumber),
      release.releasedAt,
    ]),
  );

  const cutoff = historyNewCutoffDate();

  const freshCandidates = candidates
    .map((candidate) => {
      const key = historyNewEpisodeKey(
        candidate.displayMaterial.kodikId,
        candidate.latestSeason,
        candidate.latestEpisode,
      );
      const episode = episodeByKey.get(key);
      const releasedAt = resolveHistoryNewFreshnessDate(
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
      watchedPositionSeconds: candidate.watchedPositionSeconds,
      watchedEpisodeDurationSeconds: candidate.watchedEpisodeDurationSeconds,
      watchedProgressPercent: candidate.watchedProgressPercent,
    };
  });
}
