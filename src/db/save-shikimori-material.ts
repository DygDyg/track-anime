import type { Prisma, PrismaClient } from "@prisma/client";
import {
  animeBriefPosterPath,
  animeBriefTitle,
  type ShikimoriAnimeBrief,
} from "@/lib/shikimori/anime-brief";
import { shikimoriAssetUrl } from "@/lib/shikimori/client";

const STUB_KODIK_PREFIX = "shikimori:";
const STUB_TRANSLATION_ID = 0;
export const SHIKIMORI_CACHE_TRANSLATION_TYPE = "shikimori-cache";

export function shikimoriStubKodikId(shikimoriId: number): string {
  return `${STUB_KODIK_PREFIX}${shikimoriId}`;
}

export function isShikimoriStubMaterial(kodikId: string): boolean {
  return kodikId.startsWith(STUB_KODIK_PREFIX);
}

function buildMaterialData(item: ShikimoriAnimeBrief): Prisma.InputJsonValue {
  const title = animeBriefTitle(item);
  const posterPath = animeBriefPosterPath(item.image);
  const posterUrl = posterPath ? shikimoriAssetUrl(posterPath) : null;

  return {
    source: "shikimori",
    synced_at: new Date().toISOString(),
    anime_title: title,
    anime_poster_url: posterUrl,
    anime_kind: item.kind ?? null,
    anime_status: item.status ?? null,
    shikimori_score: item.score ?? null,
    shikimori_episodes: item.episodes ?? null,
  };
}

async function persistOne(prisma: PrismaClient, item: ShikimoriAnimeBrief): Promise<void> {
  const title = animeBriefTitle(item);

  await prisma.kodikMaterial.upsert({
    where: { kodikId: shikimoriStubKodikId(item.id) },
    create: {
      kodikId: shikimoriStubKodikId(item.id),
      shikimoriId: item.id,
      type: item.kind ?? "anime",
      title,
      titleOrig: item.name,
      translationId: STUB_TRANSLATION_ID,
      translationTitle: "Shikimori",
      translationType: SHIKIMORI_CACHE_TRANSLATION_TYPE,
      kodikUpdatedAt: new Date(),
      materialData: buildMaterialData(item),
    },
    update: {
      title,
      titleOrig: item.name,
      type: item.kind ?? "anime",
      kodikUpdatedAt: new Date(),
      materialData: buildMaterialData(item),
    },
  });
}

export async function persistShikimoriAnimeBriefs(
  prisma: PrismaClient,
  items: ShikimoriAnimeBrief[],
): Promise<void> {
  if (items.length === 0) return;

  const ids = items.map((item) => item.id);
  const existing = await prisma.kodikMaterial.findMany({
    where: { shikimoriId: { in: ids } },
    select: { shikimoriId: true, kodikId: true },
  });

  const hasRealMaterial = new Set<number>();
  for (const row of existing) {
    if (row.shikimoriId != null && !isShikimoriStubMaterial(row.kodikId)) {
      hasRealMaterial.add(row.shikimoriId);
    }
  }

  const toSave = items.filter((item) => !hasRealMaterial.has(item.id));
  await Promise.all(toSave.map((item) => persistOne(prisma, item)));
}
