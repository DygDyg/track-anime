#!/usr/bin/env tsx
/**
 * Синхронизация анонсов Shikimori для вкладки «Анонсы» в календаре.
 *
 * Запуск: npm run shikimori:sync-anons
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runShikimoriAnonsSync } from "../src/lib/admin/shikimori-anons-sync.js";

const prisma = new PrismaClient();

async function main() {
  const result = await runShikimoriAnonsSync();
  console.log(
    `Shikimori anons sync OK: всего ${result.total}, обновлено ${result.upserted}, удалено ${result.removed}.`,
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
