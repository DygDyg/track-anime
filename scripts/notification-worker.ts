#!/usr/bin/env tsx
/**
 * Обработка очереди NotificationDelivery (Telegram, Discord).
 * Запуск вручную или из cron: npm run notifications:worker
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { processPendingNotificationDeliveries } from "../src/lib/notifications/worker.js";

const prisma = new PrismaClient();

async function main() {
  const result = await processPendingNotificationDeliveries();
  console.log(
    `[notifications] worker: processed=${result.processed} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
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
