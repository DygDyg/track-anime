import { shikimoriFetch, shikimoriAssetUrl } from "@/lib/shikimori/client";
import type { ShikimoriRelatedEntry } from "@/lib/shikimori/types";

const RELATION_ORDER: Record<string, number> = {
  prequel: 1,
  sequel: 2,
  "full story": 3,
  "parent story": 4,
  "side story": 5,
  summary: 6,
  alternative: 7,
  "spin-off": 8,
  spin_off: 8,
  other: 9,
  character: 10,
  adaptation: 11,
};

export type ShikimoriRelatedAnimeBrief = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  posterUrl: string | null;
  screenshotUrl: string | null;
  relation: string;
  relationLabel: string;
  kind: string | null;
  status: string | null;
  score: string | null;
  airedOn: string | null;
  releasedOn: string | null;
  episodes: number | null;
};

function relationRank(relation: string): number {
  return RELATION_ORDER[relation.toLowerCase()] ?? 50;
}

export async function getShikimoriRelatedAnimes(
  shikimoriId: number,
  init?: RequestInit,
): Promise<ShikimoriRelatedAnimeBrief[]> {
  const entries = await shikimoriFetch<ShikimoriRelatedEntry[]>(`/animes/${shikimoriId}/related`, init);
  if (!entries?.length) return [];

  const byId = new Map<number, ShikimoriRelatedAnimeBrief>();

  for (const entry of entries) {
    const item = entry.anime;
    if (!item || item.id === shikimoriId) continue;

    const mapped: ShikimoriRelatedAnimeBrief = {
      shikimoriId: item.id,
      title: item.russian || item.name,
      titleOriginal: item.name,
      posterUrl:
        shikimoriAssetUrl(item.image?.preview) ??
        shikimoriAssetUrl(item.image?.x96) ??
        shikimoriAssetUrl(item.image?.original),
      screenshotUrl: null,
      relation: entry.relation,
      relationLabel: entry.relation_russian,
      kind: item.kind,
      status: item.status,
      score: item.score,
      airedOn: item.aired_on,
      releasedOn: item.released_on,
      episodes: item.episodes && item.episodes > 0 ? item.episodes : null,
    };

    const existing = byId.get(item.id);
    if (!existing || relationRank(entry.relation) < relationRank(existing.relation)) {
      byId.set(item.id, mapped);
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      const byRelation = relationRank(a.relation) - relationRank(b.relation);
      if (byRelation !== 0) return byRelation;
      const aTime = a.airedOn ? Date.parse(a.airedOn) : 0;
      const bTime = b.airedOn ? Date.parse(b.airedOn) : 0;
      return aTime - bTime;
    })
    .slice(0, 24);
}
