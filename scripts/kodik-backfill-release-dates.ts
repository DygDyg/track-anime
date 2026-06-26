#!/usr/bin/env tsx
/**
 * Проставляет дату заливки на Kodik (kodikUpdatedAt) вместо даты импорта в БД.
 *
 * Запуск: npm run kodik:backfill-dates
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillReleaseDates } from "../src/lib/admin/kodik-sync.js";

const prisma = new PrismaClient();

async function main() {
  const updated = await backfillReleaseDates();
  console.log(`Backfill OK: обновлено релизов — ${updated}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
