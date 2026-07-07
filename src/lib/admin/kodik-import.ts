import { prisma } from "@/lib/prisma";
import { saveKodikMaterial } from "@/db/save-material";
import { isShikimoriStubMaterial } from "@/db/save-shikimori-material";
import { normalizeKodikMaterialMetadata } from "@/lib/kodik-material-metadata-normalizer";
import { kodikSearch } from "@/kodik/client";
import {
  finishImportJobSession,
  startImportJobSession,
  updateImportJobProgress,
} from "@/lib/admin/import-job";

const withMaterialData = true;
const BATCH_SIZE = 50;

export type EpisodesImportResult = {
  processed: number;
  skipped: number;
  newEpisodes: number;
  newReleases: number;
  pending: number;
  status: string;
  lastError: string | null;
  stoppedReason: "complete" | "limit" | "timeout" | "batch_stalled" | null;
};

async function countPendingEpisodes(): Promise<number> {
  return prisma.kodikMaterial.count({ where: { episodesLoaded: false } });
}

async function markEpisodesSkipped(kodikId: string): Promise<void> {
  await prisma.kodikMaterial.update({
    where: { kodikId },
    data: { episodesLoaded: true },
  });
}

async function importOneMaterialEpisodes(kodikId: string): Promise<{
  newEpisodes: number;
  newReleases: number;
  shikimoriId: number | null;
  skipped: boolean;
}> {
  if (isShikimoriStubMaterial(kodikId)) {
    await markEpisodesSkipped(kodikId);
    return { newEpisodes: 0, newReleases: 0, shikimoriId: null, skipped: true };
  }

  const response = await kodikSearch({
    id: kodikId,
    with_episodes_data: true,
    with_material_data: withMaterialData,
  });

  const material = response.results[0];
  if (!material) {
    await markEpisodesSkipped(kodikId);
    return { newEpisodes: 0, newReleases: 0, shikimoriId: null, skipped: false };
  }

  const result = await saveKodikMaterial(prisma, material, {
    loadEpisodes: true,
    trackReleases: true,
  });

  await markEpisodesSkipped(kodikId);

  const shikimoriId = material.shikimori_id != null ? Number(material.shikimori_id) : null;
  return {
    newEpisodes: result.newEpisodes,
    newReleases: result.newReleases,
    shikimoriId: shikimoriId != null && Number.isInteger(shikimoriId) && shikimoriId > 0 ? shikimoriId : null,
    skipped: false,
  };
}

export async function runKodikEpisodesImport(options?: {
  maxMaterials?: number;
  maxDurationMs?: number;
}): Promise<EpisodesImportResult> {
  const maxMaterials = options?.maxMaterials ?? Number.POSITIVE_INFINITY;
  const deadline = options?.maxDurationMs ? Date.now() + options.maxDurationMs : Number.POSITIVE_INFINITY;

  const pendingStart = await countPendingEpisodes();
  if (pendingStart === 0) {
    await prisma.kodikImportJob.upsert({
      where: { id: "full" },
      create: { id: "full", phase: "episodes", status: "done" },
      update: { phase: "episodes", status: "done", lastError: null, currentItem: null },
    });
    return {
      processed: 0,
      skipped: 0,
      newEpisodes: 0,
      newReleases: 0,
      pending: 0,
      status: "done",
      lastError: null,
      stoppedReason: "complete",
    };
  }

  const job = await prisma.kodikImportJob.findUnique({ where: { id: "full" } });
  await prisma.kodikMaterial.updateMany({
    where: { episodesLoaded: false, kodikId: { startsWith: "shikimori:" } },
    data: { episodesLoaded: true },
  });

  await startImportJobSession({
    phase: "episodes",
    sessionTotal: job?.total ?? pendingStart + (await prisma.kodikMaterial.count({ where: { episodesLoaded: true } })),
    clearError: true,
  });

  let processed = 0;
  let skipped = 0;
  let newEpisodes = 0;
  let newReleases = 0;
  let lastError: string | null = null;
  let stoppedReason: EpisodesImportResult["stoppedReason"] = null;
  const touchedShikimoriIds = new Set<number>();

  while (processed + skipped < maxMaterials && Date.now() < deadline) {
    const materials = await prisma.kodikMaterial.findMany({
      where: {
        episodesLoaded: false,
        kodikId: { not: { startsWith: "shikimori:" } },
      },
      orderBy: { kodikId: "asc" },
      take: BATCH_SIZE,
      select: { kodikId: true },
    });

    if (materials.length === 0) {
      stoppedReason = "complete";
      break;
    }

    let batchProgress = 0;

    for (const { kodikId } of materials) {
      if (processed + skipped >= maxMaterials || Date.now() >= deadline) {
        stoppedReason = processed + skipped >= maxMaterials ? "limit" : "timeout";
        break;
      }

      await updateImportJobProgress({
        currentItem: kodikId,
        sessionProcessed: processed,
        sessionSkipped: skipped,
      });

      try {
        const result = await importOneMaterialEpisodes(kodikId);
        if (result.skipped) {
          skipped += 1;
        } else {
          processed += 1;
          batchProgress += 1;
          newEpisodes += result.newEpisodes;
          newReleases += result.newReleases;
          if (result.shikimoriId != null) touchedShikimoriIds.add(result.shikimoriId);
        }
        lastError = null;

        await updateImportJobProgress({
          currentItem: kodikId,
          sessionProcessed: processed,
          sessionSkipped: skipped,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = `${kodikId}: ${message}`;

        if (isShikimoriStubMaterial(kodikId) || message.includes("Неправильный формат: id")) {
          await markEpisodesSkipped(kodikId);
        }

        skipped += 1;

        await updateImportJobProgress({
          currentItem: kodikId,
          sessionProcessed: processed,
          sessionSkipped: skipped,
          lastError,
        });
      }
    }

    if (stoppedReason) break;

    if (batchProgress === 0) {
      stoppedReason = "batch_stalled";
      break;
    }
  }

  const pending = await countPendingEpisodes();
  const status =
    pending === 0
      ? "done"
      : stoppedReason === "batch_stalled"
        ? "error"
        : processed > 0 || stoppedReason === "timeout" || stoppedReason === "limit"
          ? "paused"
          : "error";

  await finishImportJobSession({
    phase: "episodes",
    status,
    lastError,
    currentItem: null,
  });

  if (touchedShikimoriIds.size > 0) {
    await normalizeKodikMaterialMetadata(prisma, {
      ids: [...touchedShikimoriIds],
      quiet: true,
    });
  }

  return {
    processed,
    skipped,
    newEpisodes,
    newReleases,
    pending,
    status,
    lastError,
    stoppedReason,
  };
}
