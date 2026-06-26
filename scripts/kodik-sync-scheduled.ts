#!/usr/bin/env tsx
/**
 * Планировщик автоматической проверки Kodik (cron каждую минуту).
 *
 * Запуск: npm run kodik:sync:scheduled
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { maybeRunScheduledSync } from "../src/lib/admin/kodik-sync-scheduler.js";

const prisma = new PrismaClient();

async function main() {
  const result = await maybeRunScheduledSync();

  switch (result.action) {
    case "disabled":
      console.log("[kodik-sync] автопроверка отключена");
      break;
    case "waiting":
      console.log(`[kodik-sync] до следующей проверки ~${result.minutesLeft} мин`);
      break;
    case "skipped":
      console.log(`[kodik-sync] пропуск: ${result.reason}`);
      break;
    case "ran":
      console.log(
        `[kodik-sync] OK: проверено ${result.checkedMaterials}, обновлено ${result.updatedMaterials}, новых релизов ${result.newReleases}`,
      );
      break;
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
