#!/usr/bin/env tsx
/**
 * Однократно переносит дату окончания оригинального показа из materialData
 * в KodikMaterial.animeReleasedAt.
 *
 * Запуск: npm run kodik:backfill-anime-release-dates
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillAnimeReleaseDates } from "../src/lib/admin/kodik-sync.js";

const prisma = new PrismaClient();

async function main() {
  const updated = await backfillAnimeReleaseDates();
  console.log(`Backfill OK: обновлено тайтлов — ${updated}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
