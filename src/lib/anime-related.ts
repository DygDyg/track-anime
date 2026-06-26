import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import {
  getShikimoriRelatedAnimes,
  type ShikimoriRelatedAnimeBrief,
} from "@/lib/shikimori/related";

export type RelatedAnimeDto = ShikimoriRelatedAnimeBrief;

function posterFromMaterialData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  return resolveMaterialPosterUrl(data as MaterialPosterSource);
}

export async function getRelatedAnimes(shikimoriId: number): Promise<RelatedAnimeDto[]> {
  const related = await getShikimoriRelatedAnimes(shikimoriId);
  if (related.length === 0) return related;

  const ids = related.map((item) => item.shikimoriId);
  const materials = await prisma.kodikMaterial.findMany({
    where: { shikimoriId: { in: ids } },
    orderBy: { kodikUpdatedAt: "desc" },
    select: { shikimoriId: true, materialData: true },
  });

  const posterById = new Map<number, string>();
  for (const material of materials) {
    if (!material.shikimoriId || posterById.has(material.shikimoriId)) continue;
    const poster = posterFromMaterialData(material.materialData);
    if (poster) posterById.set(material.shikimoriId, poster);
  }

  return related.map((item) => ({
    ...item,
    posterUrl: item.posterUrl ?? posterById.get(item.shikimoriId) ?? null,
  }));
}
