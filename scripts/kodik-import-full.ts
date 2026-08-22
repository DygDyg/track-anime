#!/usr/bin/env tsx
/**
 * Полный импорт базы Kodik в PostgreSQL.
 *
 * Фаза 1 (catalog): все материалы anime + anime-serial + метаданные (быстро)
 * Фаза 2 (episodes): все серии всех озвучек через /search?id=...
 *
 * Запуск:
 *   npm run kodik:import              # каталог + серии
 *   npm run kodik:import:resume       # продолжить после прерывания
 *   npm run kodik:import -- --catalog-only
 *   npm run kodik:import:episodes     # только недостающие серии
 *   npm run kodik:import -- --reset   # сбросить прогресс
 */
import "dotenv/config";
import { PrismaClient, type KodikImportJob } from "@prisma/client";
import { runKodikEpisodesImport } from "../src/lib/admin/kodik-import.js";
import { finishCatalogImportSession, startCatalogImportSession } from "../src/lib/admin/import-job.js";
import { KODIK_ANIME_LIST_TYPES } from "../src/kodik/anime-types.js";
import { buildListUrl, kodikListByUrl } from "../src/kodik/client.js";
import { saveKodikMaterial } from "../src/db/save-material.js";
import { normalizeKodikMaterialMetadata } from "../src/lib/kodik-material-metadata-normalizer.js";

const prisma = new PrismaClient();
const JOB_ID = "full";

const args = new Set(process.argv.slice(2));
const catalogOnly = args.has("--catalog-only");
const episodesOnly = args.has("--episodes-only");
const reset = args.has("--reset");
const resume = args.has("--resume");
const withMaterialData = !args.has("--no-material-data");

function isCatalogComplete(job: KodikImportJob | null): boolean {
  if (!job) return false;
  if (job.status === "catalog_done" || job.status === "done") return true;
  if (job.phase === "episodes") return true;
  if (!job.nextPageUrl && job.processed > 0) {
    if (job.total != null && job.processed >= job.total) return true;
  }
  return false;
}

async function getImportJob(): Promise<KodikImportJob | null> {
  return prisma.kodikImportJob.findUnique({ where: { id: JOB_ID } });
}

async function countPendingEpisodes(): Promise<number> {
  return prisma.kodikMaterial.count({ where: { episodesLoaded: false } });
}

function printImportStatus(job: KodikImportJob, pendingEpisodes: number): void {
  const catalogDone = isCatalogComplete(job);
  const totalLabel = job.total != null ? `/${job.total}` : "";
  console.log("--- Прогресс импорта ---");
  console.log(`Фаза: ${job.phase} | Статус: ${job.status}`);
  console.log(
    `Catalog: ${catalogDone ? "завершён" : "в процессе"} (${job.processed}${totalLabel} материалов)`,
  );
  console.log(`Episodes: осталось материалов без серий — ${pendingEpisodes}`);
  if (job.lastError) {
    console.log(`Последняя ошибка: ${job.lastError}`);
  }
  console.log("------------------------");
}

async function resumeImport(): Promise<void> {
  const job = await getImportJob();
  if (!job) {
    console.error("Нет сохранённого прогресса. Сначала запустите: npm run kodik:import");
    process.exitCode = 1;
    return;
  }

  const pendingEpisodes = await countPendingEpisodes();
  printImportStatus(job, pendingEpisodes);

  if (isCatalogComplete(job)) {
    console.log("Фаза catalog уже завершена — пропуск.");
  } else {
    await importCatalogPhase();
  }

  if (catalogOnly) {
    return;
  }

  const remaining = await countPendingEpisodes();
  if (remaining === 0) {
    console.log("Фаза episodes уже завершена — нечего догружать.");
    return;
  }

  await importEpisodesPhase();
}

async function main() {
  if (reset) {
    await prisma.kodikImportJob.deleteMany({ where: { id: JOB_ID } });
    console.log("Прогресс импорта сброшен.");
    if (args.size === 1) return;
  }

  if (resume) {
    await resumeImport();
    return;
  }

  if (episodesOnly) {
    await importEpisodesPhase();
    return;
  }

  const job = await getImportJob();
  if (job && isCatalogComplete(job)) {
    console.log("Catalog уже импортирован — продолжаем с фазы episodes.");
  } else {
    await importCatalogPhase();
  }

  if (!catalogOnly) {
    await importEpisodesPhase();
  }
}

async function importCatalogPhase() {
  const existing = await getImportJob();
  if (existing && isCatalogComplete(existing)) {
    console.log("=== Фаза 1: каталог — уже завершён, пропуск ===");
    return;
  }

  let job = existing;
  await startCatalogImportSession(job?.processed ?? 0);

  let nextUrl =
    job?.nextPageUrl ||
    buildListUrl({
      types: KODIK_ANIME_LIST_TYPES,
      has_field: "shikimori_id",
      limit: 100,
      sort: "updated_at",
      order: "desc",
      with_material_data: withMaterialData,
    });

  if (job?.nextPageUrl) {
    console.log("=== Фаза 1: каталог — продолжение с сохранённой страницы ===");
  } else {
    console.log("=== Фаза 1: каталог материалов (без серий) ===");
  }

  while (nextUrl) {
    const page = await kodikListByUrl(nextUrl);
    let pageSaved = 0;
    const touchedShikimoriIds = new Set<number>();

    for (const material of page.results) {
      await saveKodikMaterial(prisma, material, {
        loadEpisodes: false,
        trackReleases: false,
      });
      if (material.shikimori_id != null && material.shikimori_id !== "") {
        const shikimoriId = Number(material.shikimori_id);
        if (Number.isInteger(shikimoriId) && shikimoriId > 0) {
          touchedShikimoriIds.add(shikimoriId);
        }
      }
      pageSaved += 1;
    }

    if (touchedShikimoriIds.size > 0) {
      await normalizeKodikMaterialMetadata(prisma, {
        ids: [...touchedShikimoriIds],
        quiet: true,
      });
    }

    job = await prisma.kodikImportJob.update({
      where: { id: JOB_ID },
      data: {
        phase: "catalog",
        processed: { increment: pageSaved },
        total: page.total,
        nextPageUrl: page.next_page || null,
        status: page.next_page ? "running" : "catalog_done",
      },
    });

    console.log(
      `[catalog] +${pageSaved} | всего ${job.processed}/${page.total} | next: ${page.next_page ? "да" : "нет"}`,
    );

    nextUrl = page.next_page ?? "";
    if (!nextUrl) break;
  }

  await finishCatalogImportSession();
  console.log("Фаза 1 завершена.");
}

async function importEpisodesPhase() {
  const pending = await countPendingEpisodes();
  if (pending === 0) {
    console.log("=== Фаза 2: серии — нечего догружать ===");
    return;
  }

  console.log(`=== Фаза 2: серии всех озвучек (осталось ${pending}) ===`);

  const result = await runKodikEpisodesImport();

  console.log(
    `Фаза 2: обработано ${result.processed}, пропущено ${result.skipped}, новых серий ${result.newEpisodes}, осталось ${result.pending}, статус ${result.status}.`,
  );

  if (result.lastError) {
    console.log(`Последняя ошибка: ${result.lastError}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
