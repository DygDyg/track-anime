import { shikimoriAuthFetch } from "@/lib/shikimori/auth-client";
import type { ShikimoriListStatus } from "@/lib/shikimori/user-rates.types";

export type { ShikimoriListStatus, ListStatusTab } from "@/lib/shikimori/user-rates.types";
export { LIST_STATUS_LABELS, LIST_STATUS_LABELS_MOBILE, LIST_STATUS_TABS } from "@/lib/shikimori/user-rates.types";

export type ShikimoriUserRate = {
  id: number;
  user_id: number;
  target_id: number;
  target_type: "Anime" | "Manga" | string;
  score: number;
  status: ShikimoriListStatus | string;
  episodes: number;
  rewatches: number;
  created_at?: string | null;
  updated_at?: string | null;
};

const CACHE_TTL_MS = 2 * 60 * 1000;

type RatesCacheEntry = {
  expiresAt: number;
  rates: ShikimoriUserRate[];
};

const ratesCache = new Map<string, RatesCacheEntry>();

function cacheKey(userId: string, shikimoriUserId: number): string {
  return `${userId}:${shikimoriUserId}`;
}

export async function fetchUserAnimeRates(
  userId: string,
  shikimoriUserId: number,
): Promise<ShikimoriUserRate[]> {
  const key = cacheKey(userId, shikimoriUserId);
  const cached = ratesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rates;
  }

  // Shikimori returns the full list on page 1 when user_id is set (limit is advisory).
  // Do not paginate — page 2+ repeats the same payload and causes an infinite loop.
  const chunk = await shikimoriAuthFetch<ShikimoriUserRate[]>(
    userId,
    `/v2/user_rates?user_id=${shikimoriUserId}&target_type=Anime&limit=1000&page=1`,
  );
  const rates = Array.isArray(chunk) ? chunk : [];

  ratesCache.set(key, { rates, expiresAt: Date.now() + CACHE_TTL_MS });
  return rates;
}

export function invalidateUserAnimeRatesCache(userId: string, shikimoriUserId: number): void {
  ratesCache.delete(cacheKey(userId, shikimoriUserId));
}
