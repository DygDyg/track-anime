#!/usr/bin/env tsx
/**
 * Статистика и дозаполнение Shikimori -> MAL ID mapping.
 *
 * Запуск:
 *   npm run shikimori:malid-stats
 *   npm run shikimori:malid-stats -- --refresh --limit=100
 *   npm run shikimori:malid-stats -- --refresh --force --limit=100
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import {
  getMalIdSyncStatus,
  refreshMalIdMappings,
  type MalIdSyncStatusDto,
} from "../src/lib/admin/mal-id-sync.js";

type Args = {
  refresh: boolean;
  force: boolean;
  limit: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;

  return {
    refresh: args.includes("--refresh"),
    force: args.includes("--force"),
    limit: Number.isInteger(limit) && limit > 0 ? limit : 0,
  };
}

function printStats(label: string, stats: MalIdSyncStatusDto): void {
  console.log(label);
  console.log(`  Всего unique shikimoriId в KodikMaterial: ${stats.allTitles}`);
  console.log(`  Playable unique titles: ${stats.playableTitles}`);
  console.log(`  С MAL ID среди всех: ${stats.mappedAllTitles} (${stats.coverageAllPct.toFixed(2)}%)`);
  console.log(
    `  С MAL ID среди playable: ${stats.mappedPlayableTitles} (${stats.coveragePlayablePct.toFixed(2)}%)`,
  );
  console.log(`  Проверены, но MAL ID не найден: ${stats.cachedNullAllTitles}`);
  console.log(`  Устаревший mapping старше 30 дней: ${stats.staleCachedTitles}`);
}

async function main() {
  const args = parseArgs();

  printStats("До refresh:", await getMalIdSyncStatus());

  if (args.refresh) {
    const result = await refreshMalIdMappings({
      force: args.force,
      limit: args.limit || undefined,
    });

    console.log(
      `Refresh candidates: ${result.candidates}${args.limit > 0 ? ` из limit=${args.limit}` : ""}`,
    );
    console.log(
      `Fetched: ${result.fetched}; с MAL ID: ${result.withMalId}; без MAL ID: ${result.withoutMalId}`,
    );
    printStats("После refresh:", result.status);
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
