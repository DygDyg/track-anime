/**
 * Backfill AnimeCatalog / AnimeTitleAlias / AnimeGenre из KodikMaterial.
 *
 * Usage:
 *   npx tsx scripts/anime-catalog-backfill.ts --status
 *   npx tsx scripts/anime-catalog-backfill.ts
 *   npx tsx scripts/anime-catalog-backfill.ts --fresh
 *   npx tsx scripts/anime-catalog-backfill.ts --limit 1000 --batch 50
 */
import "dotenv/config";
import {
  getAnimeCatalogBackfillStatus,
  runAnimeCatalogBackfill,
} from "../src/lib/anime-catalog-backfill";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  if (hasFlag("--status")) {
    const status = await getAnimeCatalogBackfillStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  const limitRaw = readArg("--limit");
  const batchRaw = readArg("--batch");
  const fresh = hasFlag("--fresh");

  console.log("[anime-catalog-backfill] start", {
    resume: !fresh,
    limit: limitRaw,
    batch: batchRaw,
  });

  const finalStatus = await runAnimeCatalogBackfill({
    resume: !fresh,
    limit: limitRaw ? Number(limitRaw) : undefined,
    batchSize: batchRaw ? Number(batchRaw) : undefined,
    onProgress: (status) => {
      const j = status.job;
      console.log(
        `[anime-catalog-backfill] processed=${j.processedMaterials} catalog=${j.upsertedCatalog} aliases=+${j.upsertedAliases} genres=+${j.upsertedGenres} gaps=${status.totals.catalogGaps} cursor=${j.cursorKodikId ?? "-"}`,
      );
    },
  });

  console.log("[anime-catalog-backfill] done");
  console.log(JSON.stringify(finalStatus, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
