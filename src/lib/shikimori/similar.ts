import { shikimoriFetch, shikimoriAssetUrl } from "@/lib/shikimori/client";
import type { ShikimoriRelatedAnimeBrief } from "@/lib/shikimori/related";
import type { ShikimoriAnimeBrief } from "@/lib/shikimori/types";

const SIMILAR_LIMIT = 24;

export function mapShikimoriSimilarAnimes(
  items: ShikimoriAnimeBrief[] | null | undefined,
  shikimoriId: number,
): ShikimoriRelatedAnimeBrief[] {
  if (!items?.length) return [];

  return items
    .filter((item) => item.id !== shikimoriId)
    .slice(0, SIMILAR_LIMIT)
    .map((item) => ({
      shikimoriId: item.id,
      title: item.russian || item.name,
      titleOriginal: item.name,
      posterUrl:
        shikimoriAssetUrl(item.image?.preview) ??
        shikimoriAssetUrl(item.image?.x96) ??
        shikimoriAssetUrl(item.image?.original),
      screenshotUrl: null,
      relation: "similar",
      relationLabel: "",
      kind: item.kind,
      status: item.status,
      score: item.score,
      airedOn: item.aired_on,
      releasedOn: item.released_on,
      episodes: item.episodes && item.episodes > 0 ? item.episodes : null,
    }));
}

export async function fetchShikimoriSimilarAnimes(
  shikimoriId: number,
  init?: RequestInit,
): Promise<ShikimoriAnimeBrief[] | null> {
  return shikimoriFetch<ShikimoriAnimeBrief[]>(`/animes/${shikimoriId}/similar`, init);
}

export async function getShikimoriSimilarAnimes(
  shikimoriId: number,
  init?: RequestInit,
): Promise<ShikimoriRelatedAnimeBrief[]> {
  const items = await fetchShikimoriSimilarAnimes(shikimoriId, init);
  return mapShikimoriSimilarAnimes(items, shikimoriId);
}
