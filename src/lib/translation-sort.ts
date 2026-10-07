import { episodeRank } from "@/lib/history-new-match";
import { isPopularTranslationName } from "@/lib/translation-colors";

export type TranslationSortInput = {
  translationTitle: string;
  lastSeason: number | null;
  lastEpisode: number | null;
};

/**
 * Список озвучек на странице аниме:
 * 1) больше вышедших серий (lastSeason/lastEpisode) выше;
 * 2) при равенстве — популярные студии с цветом выше;
 * 3) иначе по названию.
 */
export function compareTranslationsByEpisodesAndPopular(
  a: TranslationSortInput,
  b: TranslationSortInput,
): number {
  const rankA = episodeRank(a.lastSeason ?? 1, a.lastEpisode ?? 0);
  const rankB = episodeRank(b.lastSeason ?? 1, b.lastEpisode ?? 0);
  if (rankB !== rankA) return rankB - rankA;

  const popularA = isPopularTranslationName(a.translationTitle) ? 1 : 0;
  const popularB = isPopularTranslationName(b.translationTitle) ? 1 : 0;
  if (popularB !== popularA) return popularB - popularA;

  return a.translationTitle.localeCompare(b.translationTitle, "ru", { sensitivity: "base" });
}
