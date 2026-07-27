import { prisma } from "@/lib/prisma";
import { saveKodikMaterial } from "@/db/save-material";
import { normalizeKodikMaterialMetadata } from "@/lib/kodik-material-metadata-normalizer";
import { scheduleMalIdRefreshForShikimoriIds } from "@/lib/admin/mal-id-sync";
import { buildListUrl, kodikListByUrl, kodikSearch } from "@/kodik/client";
import {
  finishImportJobSession,
  IMPORT_JOB_ID,
  startImportJobSession,
  updateImportJobProgress,
} from "@/lib/admin/import-job";
import { markAutoSyncFinished } from "@/lib/admin/kodik-sync-settings";

const withMaterialData = true;
const STALE_RUNNING_MS = 5 * 60 * 1000;

export type KodikSyncRunTrigger = "manual" | "auto";

export type KodikSyncOptions = {
  trigger?: KodikSyncRunTrigger;
  skipIfRunning?: boolean;
  syncPages?: number;
};

export type KodikSyncResult = {
  updatedMaterials: number;
  newReleases: number;
  checkedMaterials: number;
  runId?: string;
  skipped?: boolean;
  skipReason?: string;
};

async function isSyncRunning(): Promise<boolean> {
  const job = await prisma.kodikImportJob.findUnique({ where: { id: IMPORT_JOB_ID } });
  if (!job || job.phase !== "sync" || job.status !== "running") return false;
  return Date.now() - job.updatedAt.getTime() <= STALE_RUNNING_MS;
}

export async function runKodikIncrementalSync(
  options: KodikSyncOptions = {},
): Promise<KodikSyncResult> {
  const trigger = options.trigger ?? "manual";
  const pages = options.syncPages ?? Number(process.env.KODIK_SYNC_PAGES ?? 3);

  if (options.skipIfRunning && (await isSyncRunning())) {
    return {
      updatedMaterials: 0,
      newReleases: 0,
      checkedMaterials: 0,
      skipped: true,
      skipReason: "sync_already_running",
    };
  }

  const run = await prisma.kodikSyncRun.create({
    data: {
      trigger,
      status: "running",
    },
  });

  const startedAt = Date.now();

  let url = buildListUrl({
    types: "anime-serial",
    has_field: "shikimori_id",
    limit: 100,
    sort: "updated_at",
    order: "desc",
    with_material_data: withMaterialData,
  });

  await startImportJobSession({
    phase: "sync",
    sessionTotal: pages * 100,
    clearError: true,
  });

  let updatedMaterials = 0;
  let newReleases = 0;
  let checkedMaterials = 0;
  const touchedShikimoriIds = new Set<number>();

  try {
    for (let page = 0; page < pages && url; page += 1) {
      const response = await kodikListByUrl(url);

      for (const material of response.results) {
        checkedMaterials += 1;

        await updateImportJobProgress({
          currentItem: material.id,
          sessionProcessed: checkedMaterials,
        });

        const existing = await prisma.kodikMaterial.findUnique({
          where: { kodikId: material.id },
          select: {
            kodikId: true,
            lastSeason: true,
            lastEpisode: true,
            kodikUpdatedAt: true,
            episodesLoaded: true,
          },
        });

        const kodikUpdatedAt = material.updated_at ? new Date(material.updated_at) : null;
        const changed =
          !existing ||
          existing.lastEpisode !== (material.last_episode ?? null) ||
          existing.lastSeason !== (material.last_season ?? null) ||
          (kodikUpdatedAt &&
            existing.kodikUpdatedAt &&
            kodikUpdatedAt.getTime() > existing.kodikUpdatedAt.getTime());

        if (!changed && existing?.episodesLoaded) {
          continue;
        }

        let toSave = material;

        if (changed || !existing?.episodesLoaded) {
          const detailed = await kodikSearch({
            id: material.id,
            with_episodes_data: true,
            with_material_data: withMaterialData,
          });
          toSave = detailed.results[0] ?? material;
        }

        const result = await saveKodikMaterial(prisma, toSave, {
          loadEpisodes: Boolean(toSave.seasons),
          trackReleases: true,
        });

        await prisma.kodikMaterial.update({
          where: { kodikId: material.id },
          data: { episodesLoaded: Boolean(toSave.seasons) || existing?.episodesLoaded || false },
        });

        updatedMaterials += 1;
        newReleases += result.newReleases;
        if (toSave.shikimori_id != null && toSave.shikimori_id !== "") {
          const shikimoriId = Number(toSave.shikimori_id);
          if (Number.isInteger(shikimoriId) && shikimoriId > 0) {
            touchedShikimoriIds.add(shikimoriId);
          }
        }

        await updateImportJobProgress({
          currentItem: material.id,
          sessionProcessed: checkedMaterials,
        });
      }

      url = response.next_page ?? "";
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt;

    if (touchedShikimoriIds.size > 0) {
      await normalizeKodikMaterialMetadata(prisma, {
        ids: [...touchedShikimoriIds],
        quiet: true,
      });
      scheduleMalIdRefreshForShikimoriIds([...touchedShikimoriIds]);
    }

    await finishImportJobSession({
      phase: "sync",
      status: "done",
      lastError: null,
      currentItem: null,
    });

    await prisma.kodikSyncRun.update({
      where: { id: run.id },
      data: {
        status: "done",
        checkedMaterials,
        updatedMaterials,
        newReleases,
        finishedAt,
        durationMs,
      },
    });

    if (trigger === "auto") {
      await markAutoSyncFinished();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt;

    await finishImportJobSession({
      phase: "sync",
      status: "error",
      lastError: message,
      currentItem: null,
    });

    await prisma.kodikSyncRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        checkedMaterials,
        updatedMaterials,
        newReleases,
        error: message,
        finishedAt,
        durationMs,
      },
    });

    if (trigger === "auto") {
      await markAutoSyncFinished();
    }

    throw error;
  }

  return {
    updatedMaterials,
    newReleases,
    checkedMaterials,
    runId: run.id,
  };
}

export async function backfillReleaseDates(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "KodikEpisodeRelease" r
    SET "releasedAt" = m."kodikUpdatedAt"
    FROM "KodikMaterial" m
    WHERE m."kodikId" = r."materialId"
      AND m."kodikUpdatedAt" IS NOT NULL
  `;
}

/** Однократно извлекает дату финальной оригинальной серии из materialData в индексируемое поле. */
export async function backfillAnimeReleaseDates(): Promise<number> {
  return prisma.$executeRawUnsafe(`
    UPDATE "KodikMaterial"
    SET "animeReleasedAt" = (
      COALESCE(
        NULLIF("materialData"->>'released_at', ''),
        NULLIF("materialData"->'anime_full'->>'released_on', ''),
        NULLIF("materialData"->'anime_full'->>'released_at', '')
      )::date
    )
    WHERE "animeReleasedAt" IS NULL
      AND COALESCE(
        NULLIF("materialData"->>'released_at', ''),
        NULLIF("materialData"->'anime_full'->>'released_on', ''),
        NULLIF("materialData"->'anime_full'->>'released_at', '')
      ) ~ '^\\d{4}-\\d{2}-\\d{2}$'
  `);
}
