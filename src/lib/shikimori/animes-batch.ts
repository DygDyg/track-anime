import { persistShikimoriAnimeBriefs } from "@/db/save-shikimori-material";
import { prisma } from "@/lib/prisma";
import { shikimoriFetch } from "@/lib/shikimori/client";
import {
  type ShikimoriAnimeBrief,
  animeBriefPosterUrl,
  animeBriefTitle,
} from "@/lib/shikimori/anime-brief";

export type { ShikimoriAnimeBrief } from "@/lib/shikimori/anime-brief";
export { animeBriefPosterUrl, animeBriefTitle } from "@/lib/shikimori/anime-brief";

const BATCH_SIZE = 50;
const ANIME_BRIEF_CACHE_TTL_MS = 10 * 60 * 1000;
const animeBriefCache = new Map<number, { expiresAt: number; brief: ShikimoriAnimeBrief }>();

export async function fetchAnimesByIds(ids: number[]): Promise<Map<number, ShikimoriAnimeBrief>> {
  const unique = [...new Set(ids.filter((id) => id > 0))];
  const map = new Map<number, ShikimoriAnimeBrief>();
  if (unique.length === 0) return map;

  const missing: number[] = [];
  const now = Date.now();
  for (const id of unique) {
    const cached = animeBriefCache.get(id);
    if (cached && cached.expiresAt > now) {
      map.set(id, cached.brief);
    } else {
      missing.push(id);
    }
  }

  const fetchedFromApi: ShikimoriAnimeBrief[] = [];

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    const items = await shikimoriFetch<ShikimoriAnimeBrief[]>(
      `/animes?ids=${chunk.join(",")}&limit=${chunk.length}`,
    );
    for (const item of items ?? []) {
      map.set(item.id, item);
      fetchedFromApi.push(item);
      animeBriefCache.set(item.id, {
        brief: item,
        expiresAt: now + ANIME_BRIEF_CACHE_TTL_MS,
      });
    }
  }

  if (fetchedFromApi.length > 0) {
    persistShikimoriAnimeBriefs(prisma, fetchedFromApi).catch((err) => {
      console.error("[persistShikimoriAnimeBriefs]", err);
    });
  }

  return map;
}
