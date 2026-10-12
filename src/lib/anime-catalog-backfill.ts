import { prisma } from "@/lib/prisma";
import { upsertAnimeCatalogFromMaterial } from "@/lib/anime-catalog";

export const ANIME_CATALOG_BACKFILL_JOB_ID = "default";

export type AnimeCatalogBackfillStatusDto = {
  job: {
    id: string;
    status: string;
    cursorKodikId: string | null;
    processedMaterials: number;
    upsertedCatalog: number;
    upsertedAliases: number;
    upsertedGenres: number;
    skippedNoShikimori: number;
    errorCount: number;
    lastError: string | null;
    lastProgressAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
  };
  totals: {
    materialsWithShikimori: number;
    catalogRows: number;
    aliasRows: number;
    genreRows: number;
    /** Материалы с shikimoriId без строки в AnimeCatalog */
    catalogGaps: number;
  };
  stalledMinutes: number | null;
};

async function ensureJob() {
  return prisma.animeCatalogBackfillJob.upsert({
    where: { id: ANIME_CATALOG_BACKFILL_JOB_ID },
    create: { id: ANIME_CATALOG_BACKFILL_JOB_ID, status: "idle" },
    update: {},
  });
}

export async function getAnimeCatalogBackfillStatus(): Promise<AnimeCatalogBackfillStatusDto> {
  const job = await ensureJob();

  const [materialsWithShikimori, catalogRows, aliasRows, genreRows, catalogGaps] =
    await Promise.all([
      prisma.kodikMaterial.count({ where: { shikimoriId: { not: null } } }),
      prisma.animeCatalog.count(),
      prisma.animeTitleAlias.count(),
      prisma.animeGenre.count(),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT DISTINCT m."shikimoriId"
          FROM "KodikMaterial" m
          WHERE m."shikimoriId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "AnimeCatalog" c WHERE c."shikimoriId" = m."shikimoriId"
            )
        ) gaps
      `.then((rows) => Number(rows[0]?.count ?? 0)),
    ]);

  let stalledMinutes: number | null = null;
  if (job.status === "running" && job.lastProgressAt) {
    stalledMinutes = Math.floor((Date.now() - job.lastProgressAt.getTime()) / 60_000);
  }

  return {
    job: {
      id: job.id,
      status: job.status,
      cursorKodikId: job.cursorKodikId,
      processedMaterials: job.processedMaterials,
      upsertedCatalog: job.upsertedCatalog,
      upsertedAliases: job.upsertedAliases,
      upsertedGenres: job.upsertedGenres,
      skippedNoShikimori: job.skippedNoShikimori,
      errorCount: job.errorCount,
      lastError: job.lastError,
      lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      updatedAt: job.updatedAt.toISOString(),
    },
    totals: {
      materialsWithShikimori,
      catalogRows,
      aliasRows,
      genreRows,
      catalogGaps,
    },
    stalledMinutes,
  };
}

export type RunAnimeCatalogBackfillOptions = {
  batchSize?: number;
  /** Максимум материалов за один запуск (0 = без лимита). */
  limit?: number;
  resume?: boolean;
  onProgress?: (status: Awaited<ReturnType<typeof getAnimeCatalogBackfillStatus>>) => void;
};

export async function runAnimeCatalogBackfill(
  options: RunAnimeCatalogBackfillOptions = {},
): Promise<AnimeCatalogBackfillStatusDto> {
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
  const limit = options.limit && options.limit > 0 ? options.limit : null;
  const resume = options.resume !== false;

  const existing = await ensureJob();
  let cursorKodikId = resume ? existing.cursorKodikId : null;
  let processedMaterials = resume ? existing.processedMaterials : 0;
  let upsertedCatalog = resume ? existing.upsertedCatalog : 0;
  let upsertedAliases = resume ? existing.upsertedAliases : 0;
  let upsertedGenres = resume ? existing.upsertedGenres : 0;
  let skippedNoShikimori = resume ? existing.skippedNoShikimori : 0;
  let errorCount = resume ? existing.errorCount : 0;
  const startedAt = resume && existing.startedAt ? existing.startedAt : new Date();

  await prisma.animeCatalogBackfillJob.update({
    where: { id: ANIME_CATALOG_BACKFILL_JOB_ID },
    data: {
      status: "running",
      cursorKodikId,
      processedMaterials,
      upsertedCatalog,
      upsertedAliases,
      upsertedGenres,
      skippedNoShikimori,
      errorCount,
      lastError: null,
      lastProgressAt: new Date(),
      startedAt,
      finishedAt: null,
    },
  });

  let sessionProcessed = 0;

  try {
    while (true) {
      if (limit != null && sessionProcessed >= limit) break;

      const take = limit != null ? Math.min(batchSize, limit - sessionProcessed) : batchSize;
      const materials = await prisma.kodikMaterial.findMany({
        take,
        ...(cursorKodikId ? { skip: 1, cursor: { kodikId: cursorKodikId } } : {}),
        orderBy: { kodikId: "asc" },
        select: {
          kodikId: true,
          shikimoriId: true,
          title: true,
          titleOrig: true,
          otherTitle: true,
          year: true,
          materialData: true,
        },
      });

      if (materials.length === 0) break;

      for (const material of materials) {
        processedMaterials += 1;
        sessionProcessed += 1;

        if (material.shikimoriId == null) {
          skippedNoShikimori += 1;
          continue;
        }

        try {
          const result = await upsertAnimeCatalogFromMaterial(prisma, material);
          if (result) {
            upsertedCatalog += 1;
            upsertedAliases += result.aliasesWritten;
            upsertedGenres += result.genresWritten;
          }
        } catch (error) {
          errorCount += 1;
          const message = error instanceof Error ? error.message : String(error);
          await prisma.animeCatalogBackfillJob.update({
            where: { id: ANIME_CATALOG_BACKFILL_JOB_ID },
            data: {
              lastError: `${material.kodikId}: ${message}`.slice(0, 2000),
              errorCount,
              lastProgressAt: new Date(),
            },
          });
        }
      }

      cursorKodikId = materials.at(-1)?.kodikId ?? cursorKodikId;

      await prisma.animeCatalogBackfillJob.update({
        where: { id: ANIME_CATALOG_BACKFILL_JOB_ID },
        data: {
          status: "running",
          cursorKodikId,
          processedMaterials,
          upsertedCatalog,
          upsertedAliases,
          upsertedGenres,
          skippedNoShikimori,
          errorCount,
          lastProgressAt: new Date(),
        },
      });

      if (options.onProgress) {
        options.onProgress(await getAnimeCatalogBackfillStatus());
      }
    }

    await prisma.animeCatalogBackfillJob.update({
      where: { id: ANIME_CATALOG_BACKFILL_JOB_ID },
      data: {
        status: "done",
        cursorKodikId,
        processedMaterials,
        upsertedCatalog,
        upsertedAliases,
        upsertedGenres,
        skippedNoShikimori,
        errorCount,
        lastProgressAt: new Date(),
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.animeCatalogBackfillJob.update({
      where: { id: ANIME_CATALOG_BACKFILL_JOB_ID },
      data: {
        status: "failed",
        lastError: message.slice(0, 2000),
        errorCount: errorCount + 1,
        lastProgressAt: new Date(),
        finishedAt: new Date(),
      },
    });
    throw error;
  }

  return getAnimeCatalogBackfillStatus();
}
