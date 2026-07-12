import { shikimoriFetch, shikimoriAssetUrl } from "@/lib/shikimori/client";
import type { ShikimoriRelatedAnimeBrief } from "@/lib/shikimori/related";

type ShikimoriFranchiseLink = {
  source_id: number;
  target_id: number;
  relation: string;
};

type ShikimoriFranchiseNode = {
  id: number;
  date: number;
  name: string;
  image_url: string;
  year: number | null;
};

export type ShikimoriFranchiseResponse = {
  links: ShikimoriFranchiseLink[];
  nodes: ShikimoriFranchiseNode[];
  current_id: number;
};

const RELATION_RU: Record<string, string> = {
  prequel: "Предыстория",
  sequel: "Продолжение",
  "full story": "Полная история",
  "parent story": "Основная история",
  "side story": "Побочная история",
  summary: "Сводка",
  alternative: "Альтернатива",
  "spin-off": "Спин-офф",
  spin_off: "Спин-офф",
  character: "Персонаж",
  adaptation: "Адаптация",
  other: "Связанное",
};

/** Связи основной линии — без спин-оффов, побочных историй и пр. */
const MAIN_LINE_RELATIONS = new Set([
  "prequel",
  "sequel",
  "full story",
  "parent story",
]);

function relationLabelRu(relation: string): string {
  return RELATION_RU[relation.toLowerCase()] ?? relation;
}

function posterFromFranchiseImage(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || imageUrl.includes("missing")) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return shikimoriAssetUrl(imageUrl);
}

function findDirectFranchiseLink(
  links: ShikimoriFranchiseLink[],
  currentId: number,
  targetId: number,
): ShikimoriFranchiseLink | null {
  if (currentId === targetId) return null;

  return (
    links.find(
      (link) =>
        (link.source_id === currentId && link.target_id === targetId) ||
        (link.source_id === targetId && link.target_id === currentId),
    ) ?? null
  );
}

function inferChronologyRelation(
  node: ShikimoriFranchiseNode,
  current: ShikimoriFranchiseNode | undefined,
): string {
  if (!current || node.id === current.id) return "other";
  if (node.date < current.date) return "prequel";
  if (node.date > current.date) return "sequel";
  return "other";
}

function getMainLineNodeIds(links: ShikimoriFranchiseLink[], currentId: number): Set<number> {
  const ids = new Set<number>([currentId]);
  const queue = [currentId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const link of links) {
      if (!MAIN_LINE_RELATIONS.has(link.relation.toLowerCase())) continue;

      const neighbor =
        link.source_id === id ? link.target_id : link.target_id === id ? link.source_id : null;

      if (neighbor != null && !ids.has(neighbor)) {
        ids.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return ids;
}

export async function fetchShikimoriFranchise(
  shikimoriId: number,
  init?: RequestInit,
): Promise<ShikimoriFranchiseResponse | null> {
  return shikimoriFetch<ShikimoriFranchiseResponse>(`/animes/${shikimoriId}/franchise`, init);
}

function mapFranchiseNodes(
  data: ShikimoriFranchiseResponse,
  mode: "all" | "seasons",
): ShikimoriRelatedAnimeBrief[] {
  const currentNode = data.nodes.find((node) => node.id === data.current_id);
  const mainLineIds = mode === "seasons" ? getMainLineNodeIds(data.links, data.current_id) : null;

  return data.nodes
    .filter((node) => mode === "all" || mainLineIds!.has(node.id))
    .slice()
    .sort((left, right) => left.date - right.date)
    .map((node) => {
      const isCurrent = node.id === data.current_id;
      const link = findDirectFranchiseLink(data.links, data.current_id, node.id);
      const relation = isCurrent ? "other" : (link?.relation ?? inferChronologyRelation(node, currentNode));

      return {
        shikimoriId: node.id,
        title: node.name,
        titleOriginal: null,
        posterUrl: posterFromFranchiseImage(node.image_url),
        screenshotUrl: null,
        relation,
        relationLabel: isCurrent ? "Текущее" : relationLabelRu(relation),
        kind: null,
        status: null,
        score: null,
        airedOn: node.year != null ? `${node.year}-01-01` : null,
        releasedOn: null,
        episodes: null,
      };
    });
}

/** Хронология франшизы — все связанные аниме по порядку выхода. */
export function mapFranchiseChronology(data: ShikimoriFranchiseResponse): ShikimoriRelatedAnimeBrief[] {
  return mapFranchiseNodes(data, "all");
}

/** Сезоны — основная линия (prequel/sequel), без спин-оффов и побочных историй. */
export function mapFranchiseSeasons(data: ShikimoriFranchiseResponse): ShikimoriRelatedAnimeBrief[] {
  return mapFranchiseNodes(data, "seasons");
}

export async function getShikimoriFranchiseAnimes(
  shikimoriId: number,
): Promise<ShikimoriRelatedAnimeBrief[]> {
  const data = await fetchShikimoriFranchise(shikimoriId);
  if (!data?.nodes?.length) return [];
  return mapFranchiseChronology(data);
}

export async function getShikimoriFranchiseSeasonAnimes(
  shikimoriId: number,
): Promise<ShikimoriRelatedAnimeBrief[]> {
  const data = await fetchShikimoriFranchise(shikimoriId);
  if (!data?.nodes?.length) return [];
  return mapFranchiseSeasons(data);
}
