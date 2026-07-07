import { shikimoriFetch } from "@/lib/shikimori/client";
import { SHIKIMORI_FULL_ANIME_KINDS_QUERY } from "@/lib/shikimori/full-anime-kinds";
import type { ShikimoriAnimeBrief } from "@/lib/shikimori/types";

const PAGE_LIMIT = 50;

export async function fetchShikimoriAnonsPage(page: number): Promise<ShikimoriAnimeBrief[]> {
  const params = new URLSearchParams({
    status: "anons",
    kind: SHIKIMORI_FULL_ANIME_KINDS_QUERY,
    limit: String(PAGE_LIMIT),
    order: "aired_on",
    censored: "false",
    page: String(page),
  });

  const result = await shikimoriFetch<ShikimoriAnimeBrief[]>(`/animes?${params.toString()}`);
  return result ?? [];
}

export async function fetchAllShikimoriAnons(): Promise<ShikimoriAnimeBrief[]> {
  const all: ShikimoriAnimeBrief[] = [];

  for (let page = 1; page <= 200; page += 1) {
    const batch = await fetchShikimoriAnonsPage(page);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
  }

  return all;
}
