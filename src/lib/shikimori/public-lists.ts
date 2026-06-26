import type { ShikimoriFavouritesResponse } from "@/lib/shikimori/favorites";
import { shikimoriFetch } from "@/lib/shikimori/client";
import type { ShikimoriUserRate } from "@/lib/shikimori/user-rates";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const ratesCache = new Map<number, CacheEntry<ShikimoriUserRate[]>>();
const favouritesCache = new Map<number, CacheEntry<ShikimoriFavouritesResponse>>();

function readCache<T>(map: Map<number, CacheEntry<T>>, key: number): T | null {
  const hit = map.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.value;
}

function writeCache<T>(map: Map<number, CacheEntry<T>>, key: number, value: T): void {
  map.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export async function fetchPublicUserAnimeRates(
  shikimoriUserId: number,
): Promise<ShikimoriUserRate[]> {
  const cached = readCache(ratesCache, shikimoriUserId);
  if (cached) return cached;

  try {
    const data = await shikimoriFetch<ShikimoriUserRate[]>(
      `/v2/user_rates?user_id=${shikimoriUserId}&target_type=Anime&limit=1000&page=1`,
    );
    const rates = data ?? [];
    writeCache(ratesCache, shikimoriUserId, rates);
    return rates;
  } catch (err) {
    console.error("[shikimori-public-lists] rates fetch failed:", err);
    return [];
  }
}

export async function fetchPublicUserFavourites(
  shikimoriUserId: number,
): Promise<ShikimoriFavouritesResponse> {
  const cached = readCache(favouritesCache, shikimoriUserId);
  if (cached) return cached;

  const empty: ShikimoriFavouritesResponse = { animes: [] };

  try {
    const data = await shikimoriFetch<ShikimoriFavouritesResponse>(
      `/users/${shikimoriUserId}/favourites`,
    );
    const favourites = data ?? empty;
    writeCache(favouritesCache, shikimoriUserId, favourites);
    return favourites;
  } catch (err) {
    console.error("[shikimori-public-lists] favourites fetch failed:", err);
    return empty;
  }
}

export function countAnimeBookmarks(favourites: ShikimoriFavouritesResponse): number {
  return favourites.animes?.length ?? 0;
}

export function countMangaBookmarks(favourites: ShikimoriFavouritesResponse): number {
  return (favourites.mangas?.length ?? 0) + (favourites.ranobe?.length ?? 0);
}
