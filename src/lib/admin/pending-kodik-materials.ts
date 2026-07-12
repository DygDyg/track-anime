import { prisma } from "@/lib/prisma";

export type PendingKodikMaterialDto = {
  kodikId: string;
  shikimoriId: number | null;
  title: string;
  titleOrig: string | null;
  translationTitle: string;
  translationType: string;
  lastSeason: number | null;
  lastEpisode: number | null;
  episodesCount: number | null;
  kodikUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isShikimoriStub: boolean;
};

export type PendingKodikMaterialsDto = {
  items: PendingKodikMaterialDto[];
  total: number;
  nextCursor: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT)));
}

export async function getPendingKodikMaterials(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<PendingKodikMaterialsDto> {
  const limit = normalizeLimit(options?.limit);
  const cursor = options?.cursor?.trim() || null;
  const where = {
    episodesLoaded: false,
    ...(cursor ? { kodikId: { gt: cursor } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.kodikMaterial.count({ where: { episodesLoaded: false } }),
    prisma.kodikMaterial.findMany({
      where,
      orderBy: { kodikId: "asc" },
      take: limit + 1,
      select: {
        kodikId: true,
        shikimoriId: true,
        title: true,
        titleOrig: true,
        translationTitle: true,
        translationType: true,
        lastSeason: true,
        lastEpisode: true,
        episodesCount: true,
        kodikUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const pageRows = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? pageRows.at(-1)?.kodikId ?? null : null;

  return {
    total,
    nextCursor,
    items: pageRows.map((row) => ({
      kodikId: row.kodikId,
      shikimoriId: row.shikimoriId,
      title: row.title,
      titleOrig: row.titleOrig,
      translationTitle: row.translationTitle,
      translationType: row.translationType,
      lastSeason: row.lastSeason,
      lastEpisode: row.lastEpisode,
      episodesCount: row.episodesCount,
      kodikUpdatedAt: row.kodikUpdatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isShikimoriStub: row.kodikId.startsWith("shikimori:"),
    })),
  };
}
