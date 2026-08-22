import { extractScoreFromMaterialData } from "@/lib/anime-score";
import { toIsoString } from "@/lib/dates";
import { resolveAnnouncedEpisodesTotal } from "@/lib/episode-totals";
import { historyNewEpisodeKey } from "@/lib/history-new-match";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { prisma } from "@/lib/prisma";
import type { ReleaseItemDto } from "@/lib/releases";
import { pickScreenshotUrl } from "@/lib/screenshots";
import { watchProgressPercent, isWatchHistoryBookmark } from "@/lib/watch-history";

/** Окно «скоро выйдут» на странице истории. */
export const HISTORY_UPCOMING_SOON_HOURS = 12;

/** Типичный цикл выхода следующей серии в той же озвучке. */
export const HISTORY_UPCOMING_CYCLE_DAYS = 7;

const DEFAULT_EPISODE_SECONDS = 24 * 60;

export type HistoryUpcomingSoonItemDto = ReleaseItemDto & {
  scheduleAt: string;
  watchedSeasonNumber: number;
  watchedEpisodeNumber: number;
  watchedPositionSeconds: number;
  watchedEpisodeDurationSeconds: number;
  watchedProgressPercent: number;
};

type MaterialRow = {
  shikimoriId: number | null;
  kodikId: string;
  title: string;
  lastSeason: number | null;
  lastEpisode: number | null;
  episodesCount: number | null;
  kodikUpdatedAt: Date | null;
  translationTitle: string;
  playerLink: string | null;
  materialData: unknown;
};

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
}

function readMaterialStatus(materialData: unknown): string | null {
  if (!materialData || typeof materialData !== "object") return null;
  const data = materialData as { anime_status?: unknown; all_status?: unknown };
  if (typeof data.anime_status === "string") return data.anime_status;
  if (typeof data.all_status === "string") return data.all_status;
  return null;
}

/** Сериал уже дошёл до анонсированного финала в этой озвучке — ждать нечего. */
function isSeriesFinishedForMaterial(material: MaterialRow): boolean {
  if (!material.lastEpisode) return true;

  const status = readMaterialStatus(material.materialData);
  const episodesTotal = resolveAnnouncedEpisodesTotal({
    materialData: material.materialData,
    material,
  });

  if (episodesTotal != null && material.lastEpisode >= episodesTotal) {
    if (status === "ongoing" || status === "anons") return false;
    return true;
  }

  return status === "released" && episodesTotal != null && material.lastEpisode >= episodesTotal;
}

function resolveLastEpisodeAt(
  releaseAt: Date | undefined,
  firstSeenAt: Date | undefined,
  material: MaterialRow,
): Date | null {
  if (releaseAt) return releaseAt;
  if (firstSeenAt) return firstSeenAt;
  if (material.kodikUpdatedAt) return material.kodikUpdatedAt;
  return null;
}

function episodeDurationFromMaterialData(data: unknown): number {
  if (!data || typeof data !== "object") return DEFAULT_EPISODE_SECONDS;
  const duration = (data as Record<string, unknown>).duration;
  return typeof duration === "number" && duration > 0 ? duration * 60 : DEFAULT_EPISODE_SECONDS;
}

function mapSoonItem(
  material: MaterialRow,
  seasonNumber: number,
  nextEpisode: number,
  expectedAt: Date,
  episodeScreenshots: unknown,
  progress: {
    watchedSeasonNumber: number;
    watchedEpisodeNumber: number;
    watchedPositionSeconds: number;
  },
): HistoryUpcomingSoonItemDto {
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

  const scheduleAt = toIsoString(expectedAt);
  const shikimoriId = material.shikimoriId;
  const watchedEpisodeDurationSeconds = episodeDurationFromMaterialData(material.materialData);
  const watchedProgressPercent = watchProgressPercent(
    progress.watchedPositionSeconds,
    watchedEpisodeDurationSeconds,
  );

  return {
    id: `soon-${shikimoriId ?? material.kodikId}`,
    materialId: material.kodikId,
    animeTitle: data?.anime_title?.trim() || material.title,
    posterUrl: resolveMaterialPosterUrl({
      anime_poster_url: data?.anime_poster_url ?? data?.poster_url ?? data?.worldart_poster_url,
      worldart_link: data?.worldart_link,
    }),
    screenshotUrl: pickScreenshotUrl(
      [data?.screenshots, episodeScreenshots],
      String(shikimoriId ?? material.kodikId),
    ),
    seasonNumber,
    episodeNumber: nextEpisode,
    translationName: material.translationTitle,
    playerLink: null,
    shikimoriId,
    releasedAt: scheduleAt,
    scheduleAt,
    description: data?.anime_description || data?.description
      ? stripHtml(data.anime_description ?? data.description ?? "")
      : null,
    genres: parseGenres(data?.anime_genres ?? data?.all_genres ?? data?.genres),
    status: data?.anime_status?.trim() || null,
    score: extractScoreFromMaterialData(material.materialData),
    kind: data?.anime_kind?.trim() || null,
    watchedSeasonNumber: progress.watchedSeasonNumber,
    watchedEpisodeNumber: progress.watchedEpisodeNumber,
    watchedPositionSeconds: progress.watchedPositionSeconds,
    watchedEpisodeDurationSeconds,
    watchedProgressPercent,
  };
}

/**
 * Тайтлы из watch history: в озвучке из прогресса ожидаем следующую серию
 * примерно через 7 дней после последней вышедшей; показываем, если ETA
 * попадает в ближайшие `hours` часов.
 */
export async function getHistoryUpcomingSoon(
  userId: string,
  hours = HISTORY_UPCOMING_SOON_HOURS,
): Promise<HistoryUpcomingSoonItemDto[]> {
  const progressRows = await prisma.userWatchProgress.findMany({
    where: { userId },
    select: {
      shikimoriId: true,
      kodikId: true,
      seasonNumber: true,
      episodeNumber: true,
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
      translationTitle: true,
      playerLink: true,
      materialData: true,
    },
  });

  const materialByKodikId = new Map(materials.map((material) => [material.kodikId, material]));

  type Candidate = {
    shikimoriId: number;
    material: MaterialRow;
    seasonNumber: number;
    lastEpisode: number;
    nextEpisode: number;
    watchedSeasonNumber: number;
    watchedEpisodeNumber: number;
    watchedPositionSeconds: number;
  };

  const candidates: Candidate[] = [];
  const seenShikimori = new Set<number>();

  for (const progress of progressRows) {
    if (seenShikimori.has(progress.shikimoriId)) continue;
    if (isWatchHistoryBookmark(progress)) continue;

    const material = materialByKodikId.get(progress.kodikId);
    if (!material?.lastEpisode || material.shikimoriId == null) continue;
    if (isSeriesFinishedForMaterial(material)) continue;

    const seasonNumber = material.lastSeason ?? 1;
    const lastEpisode = material.lastEpisode;
    candidates.push({
      shikimoriId: progress.shikimoriId,
      material,
      seasonNumber,
      lastEpisode,
      nextEpisode: lastEpisode + 1,
      watchedSeasonNumber: progress.seasonNumber,
      watchedEpisodeNumber: progress.episodeNumber,
      watchedPositionSeconds: progress.positionSeconds,
    });
    seenShikimori.add(progress.shikimoriId);
  }

  if (candidates.length === 0) return [];

  const [releaseRows, episodeRows] = await Promise.all([
    prisma.kodikEpisodeRelease.findMany({
      where: {
        OR: candidates.map((candidate) => ({
          materialId: candidate.material.kodikId,
          seasonNumber: candidate.seasonNumber,
          episodeNumber: candidate.lastEpisode,
        })),
      },
      select: {
        materialId: true,
        seasonNumber: true,
        episodeNumber: true,
        releasedAt: true,
      },
    }),
    prisma.kodikEpisode.findMany({
      where: {
        OR: candidates.map((candidate) => ({
          materialId: candidate.material.kodikId,
          seasonNumber: candidate.seasonNumber,
          episodeNumber: candidate.lastEpisode,
        })),
      },
      select: {
        materialId: true,
        seasonNumber: true,
        episodeNumber: true,
        firstSeenAt: true,
        screenshots: true,
      },
    }),
  ]);

  const releaseByKey = new Map(
    releaseRows.map((row) => [
      historyNewEpisodeKey(row.materialId, row.seasonNumber, row.episodeNumber),
      row.releasedAt,
    ]),
  );
  const episodeByKey = new Map(
    episodeRows.map((row) => [
      historyNewEpisodeKey(row.materialId, row.seasonNumber, row.episodeNumber),
      row,
    ]),
  );

  const now = Date.now();
  const windowEnd = now + hours * 60 * 60 * 1000;
  const cycleMs = HISTORY_UPCOMING_CYCLE_DAYS * 24 * 60 * 60 * 1000;

  const soon: HistoryUpcomingSoonItemDto[] = [];

  for (const candidate of candidates) {
    const key = historyNewEpisodeKey(
      candidate.material.kodikId,
      candidate.seasonNumber,
      candidate.lastEpisode,
    );
    const episode = episodeByKey.get(key);
    const lastAt = resolveLastEpisodeAt(releaseByKey.get(key), episode?.firstSeenAt, candidate.material);
    if (!lastAt) continue;

    const expectedAt = new Date(lastAt.getTime() + cycleMs);
    const at = expectedAt.getTime();
    if (at < now || at > windowEnd) continue;

    soon.push(
      mapSoonItem(
        candidate.material,
        candidate.seasonNumber,
        candidate.nextEpisode,
        expectedAt,
        episode?.screenshots,
        {
          watchedSeasonNumber: candidate.watchedSeasonNumber,
          watchedEpisodeNumber: candidate.watchedEpisodeNumber,
          watchedPositionSeconds: candidate.watchedPositionSeconds,
        },
      ),
    );
  }

  soon.sort(
    (a, b) =>
      new Date(a.scheduleAt).getTime() - new Date(b.scheduleAt).getTime() ||
      a.animeTitle.localeCompare(b.animeTitle, "ru"),
  );

  return soon;
}
