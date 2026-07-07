import type { RelatedAnimeDto } from "@/lib/anime-related";
import type { FavoriteAnimeItem } from "@/lib/favorites-page";
import type { ReleaseItem, ReleaseItemDto } from "@/lib/releases";
import type { SearchResultDto } from "@/lib/search-shared";

/** Минимальные данные для hover-панели на любой карточке аниме */
export type HoverPanelRelease = {
  animeTitle: string;
  posterUrl: string | null;
  screenshotUrl: string | null;
  shikimoriId: number | null;
  episodeNumber: number;
  translationName: string;
  playerLink: string | null;
  description: string | null;
  genres: string[];
  status: string | null;
  score: string | null;
  /** Для каталожных карточек без номера серии */
  catalogEpisodes?: number | null;
};

export type HoverPanelReleaseInput = HoverPanelRelease | ReleaseItem | ReleaseItemDto;

function catalogHoverRelease(input: {
  shikimoriId: number;
  animeTitle: string;
  posterUrl: string | null;
  screenshotUrl?: string | null;
  status?: string | null;
  score?: string | null;
  catalogEpisodes?: number | null;
}): HoverPanelRelease {
  return {
    animeTitle: input.animeTitle,
    posterUrl: input.posterUrl,
    screenshotUrl: input.screenshotUrl ?? null,
    episodeNumber: 0,
    translationName: "",
    playerLink: null,
    shikimoriId: input.shikimoriId,
    description: null,
    genres: [],
    status: input.status ?? null,
    score: input.score ?? null,
    catalogEpisodes: input.catalogEpisodes ?? null,
  };
}

export function searchResultToHoverRelease(item: SearchResultDto): HoverPanelRelease {
  return catalogHoverRelease({
    shikimoriId: item.shikimoriId,
    animeTitle: item.title,
    posterUrl: item.posterUrl,
    screenshotUrl: item.screenshotUrl,
    status: item.status,
    score: item.score,
    catalogEpisodes: item.episodes,
  });
}

export function favoriteToHoverRelease(item: FavoriteAnimeItem): HoverPanelRelease {
  return catalogHoverRelease({
    shikimoriId: item.shikimoriId,
    animeTitle: item.title,
    posterUrl: item.posterUrl,
    status: item.status,
    score: item.userScore?.toString() ?? item.score,
    catalogEpisodes: item.episodes,
  });
}

export function relatedToHoverRelease(item: RelatedAnimeDto): HoverPanelRelease {
  return catalogHoverRelease({
    shikimoriId: item.shikimoriId,
    animeTitle: item.title,
    posterUrl: item.posterUrl,
    screenshotUrl: item.screenshotUrl,
    status: item.status,
    score: item.score,
    catalogEpisodes: item.episodes,
  });
}
