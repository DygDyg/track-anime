#!/usr/bin/env tsx
/**
 * Инкрементальное обновление (каждые ~10 мин через cron).
 *
 * Запуск: npm run kodik:sync
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runKodikIncrementalSync } from "../src/lib/admin/kodik-sync.js";

const prisma = new PrismaClient();

async function main() {
  const result = await runKodikIncrementalSync({ trigger: "manual" });
  console.log(
    `Sync OK: проверено ${result.checkedMaterials}, обновлено ${result.updatedMaterials}, новых релизов ${result.newReleases}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
