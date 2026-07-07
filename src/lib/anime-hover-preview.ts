import type { HoverPanelRelease } from "@/lib/hover-panel-release";
import { coverCacheUrl } from "@/lib/poster";
import { getShikimoriAnime, getShikimoriAnimeCachedOnly } from "@/lib/shikimori/animes";
import { shikimoriAssetUrl } from "@/lib/shikimori/endpoints";

export async function buildAnimeHoverPreview(shikimoriId: number): Promise<HoverPanelRelease | null> {
  const anime =
    (await getShikimoriAnimeCachedOnly(shikimoriId)) ?? (await getShikimoriAnime(shikimoriId));
  if (!anime) return null;

  const screenshot = anime.screenshots?.[0];
  const screenshotUrl = shikimoriAssetUrl(screenshot?.original ?? screenshot?.preview ?? null);

  return {
    animeTitle: anime.russian?.trim() || anime.name,
    posterUrl: coverCacheUrl(anime.id, "thumb"),
    screenshotUrl,
    shikimoriId: anime.id,
    episodeNumber: 0,
    translationName: "",
    playerLink: null,
    description: anime.description,
    genres: anime.genres?.map((genre) => genre.russian?.trim() || genre.name) ?? [],
    status: anime.status,
    score: anime.score,
    catalogEpisodes: anime.episodes,
  };
}
