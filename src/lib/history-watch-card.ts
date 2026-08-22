import type { ReleaseItemDto } from "@/lib/releases";
import type { WatchHistoryItemDto } from "@/lib/watch-history";

/** Единая подпись прогресса для карточек истории (главная и /history). */
export function formatHistoryWatchHint(episode: number, isBookmark = false): string {
  if (isBookmark || episode <= 0) return "Ещё не смотрели";
  return `Вы остановились на серии ${episode}`;
}

/** Минимальный ReleaseItemDto для карточки истории и hover-панели. */
export function watchHistoryItemToReleaseDto(item: WatchHistoryItemDto): ReleaseItemDto {
  return {
    id: String(item.shikimoriId),
    animeTitle: item.animeTitle,
    posterUrl: item.posterUrl,
    screenshotUrl: item.screenshotUrl,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    translationName: item.translationTitle,
    playerLink: null,
    shikimoriId: item.shikimoriId,
    releasedAt: item.updatedAt,
    description: null,
    genres: [],
    status: item.status,
    score: item.score,
    kind: item.kind,
  };
}

export type HistoryWatchCardProgress = {
  watchedEpisodeNumber: number;
  watchProgressPercent: number;
  watchPositionSeconds: number;
  watchDurationSeconds: number;
};
