import { episodeRank, isEpisodeNewer } from "@/lib/history-new-match";
import { prisma } from "@/lib/prisma";
import { isWatchHistoryBookmark } from "@/lib/watch-history";

/** Ключ — String(shikimoriId). Только тайтлы, где max по всем озвучкам новее прогресса. */
export type WatchAheadEntry = {
  latestSeason: number;
  latestEpisode: number;
  /** `+N` при том же сезоне, иначе `↑` */
  label: string;
};

export type WatchAheadMap = Record<string, WatchAheadEntry>;

export function buildWatchAheadLabel(
  watchedSeason: number,
  watchedEpisode: number,
  latestSeason: number,
  latestEpisode: number,
): string | null {
  if (!isEpisodeNewer(watchedSeason, watchedEpisode, latestSeason, latestEpisode)) {
    return null;
  }
  if (watchedSeason === latestSeason) {
    const delta = latestEpisode - watchedEpisode;
    return delta > 0 ? `+${delta}` : null;
  }
  return "↑";
}

/**
 * Личная карта «есть серии впереди» для ленты главной.
 * Сравнивает прогресс с max(lastSeason/lastEpisode) по всем KodikMaterial тайтла.
 * Не для history-new / уведомлений (там по-прежнему одна озвучка).
 */
export async function getWatchAheadMap(userId: string): Promise<WatchAheadMap> {
  const progressRows = await prisma.userWatchProgress.findMany({
    where: { userId },
    select: {
      shikimoriId: true,
      seasonNumber: true,
      episodeNumber: true,
      positionSeconds: true,
    },
  });

  const active = progressRows.filter((row) => !isWatchHistoryBookmark(row));
  if (active.length === 0) return {};

  const shikimoriIds = [...new Set(active.map((row) => row.shikimoriId))];
  const materials = await prisma.kodikMaterial.findMany({
    where: {
      shikimoriId: { in: shikimoriIds },
      lastEpisode: { gt: 0 },
    },
    select: {
      shikimoriId: true,
      lastSeason: true,
      lastEpisode: true,
    },
  });

  const maxByShikimoriId = new Map<number, { season: number; episode: number }>();
  for (const material of materials) {
    if (material.shikimoriId == null || material.lastEpisode == null) continue;
    const season = material.lastSeason ?? 1;
    const episode = material.lastEpisode;
    const prev = maxByShikimoriId.get(material.shikimoriId);
    if (!prev || episodeRank(season, episode) > episodeRank(prev.season, prev.episode)) {
      maxByShikimoriId.set(material.shikimoriId, { season, episode });
    }
  }

  const map: WatchAheadMap = {};
  for (const progress of active) {
    const max = maxByShikimoriId.get(progress.shikimoriId);
    if (!max) continue;
    const label = buildWatchAheadLabel(
      progress.seasonNumber,
      progress.episodeNumber,
      max.season,
      max.episode,
    );
    if (!label) continue;
    map[String(progress.shikimoriId)] = {
      latestSeason: max.season,
      latestEpisode: max.episode,
      label,
    };
  }

  return map;
}
