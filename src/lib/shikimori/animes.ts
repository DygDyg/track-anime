import { shikimoriFetch } from "@/lib/shikimori/client";
import {
  loadShikimoriAnimeFromCache,
  loadStaleShikimoriAnimeFromCache,
  persistShikimoriAnimeCache,
} from "@/lib/shikimori/anime-cache";
import type { ShikimoriAnime } from "@/lib/shikimori/types";

const backgroundRefreshInFlight = new Set<number>();

async function fetchShikimoriAnimeFromApi(id: number): Promise<ShikimoriAnime | null> {
  return shikimoriFetch<ShikimoriAnime>(`/animes/${id}`);
}

export function scheduleShikimoriAnimeRefresh(shikimoriId: number): void {
  if (backgroundRefreshInFlight.has(shikimoriId)) return;

  backgroundRefreshInFlight.add(shikimoriId);
  void (async () => {
    try {
      const anime = await fetchShikimoriAnimeFromApi(shikimoriId);
      if (anime) {
        await persistShikimoriAnimeCache(anime);
      }
    } catch (error) {
      console.error("[shikimori/anime-cache] background refresh failed:", shikimoriId, error);
    } finally {
      backgroundRefreshInFlight.delete(shikimoriId);
    }
  })();
}

/** Кэш БД → API. После успешного API сохраняет в stub-материал. */
export async function getShikimoriAnime(id: number): Promise<ShikimoriAnime | null> {
  const cached = await loadShikimoriAnimeFromCache(id);
  if (cached) return cached;

  const anime = await fetchShikimoriAnimeFromApi(id);
  if (anime) {
    await persistShikimoriAnimeCache(anime).catch(() => undefined);
    return anime;
  }

  return loadStaleShikimoriAnimeFromCache(id);
}

/** Только локальный кэш, без сетевых запросов к Shikimori. */
export async function getShikimoriAnimeCachedOnly(id: number): Promise<ShikimoriAnime | null> {
  const fresh = await loadShikimoriAnimeFromCache(id);
  if (fresh) return fresh;
  return loadStaleShikimoriAnimeFromCache(id);
}
