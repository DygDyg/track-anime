#!/usr/bin/env tsx
/**
 * Планировщик автоматической проверки Kodik (cron каждую минуту).
 *
 * Запуск: npm run kodik:sync:scheduled
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { maybeRunScheduledSync } from "../src/lib/admin/kodik-sync-scheduler.js";
import { maybeRunScheduledShikimoriAnonsSync } from "../src/lib/admin/shikimori-anons-sync.js";
import { processPendingNotificationDeliveries } from "../src/lib/notifications/worker.js";

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

  try {
    const anonsResult = await maybeRunScheduledShikimoriAnonsSync();
    switch (anonsResult.action) {
      case "waiting":
        console.log("[shikimori-anons] до следующей синхронизации ещё не прошёл интервал");
        break;
      case "ran":
        console.log(
          `[shikimori-anons] OK: всего ${anonsResult.total}, обновлено ${anonsResult.upserted}, удалено ${anonsResult.removed}`,
        );
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[shikimori-anons] ошибка: ${message}`);
    process.exitCode = 1;
  }

  try {
    const notifyResult = await processPendingNotificationDeliveries();
    if (notifyResult.processed > 0) {
      console.log(
        `[notifications] worker: processed=${notifyResult.processed} sent=${notifyResult.sent} failed=${notifyResult.failed}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[notifications] worker ошибка: ${message}`);
    process.exitCode = 1;
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
