#!/usr/bin/env tsx
/**
 * Ручной WebDAV-бекап БД (те же настройки, что в /admin/db).
 *
 * Запуск: npm run db:backup:webdav
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runDbBackup } from "../src/lib/admin/db-backup.js";

const prisma = new PrismaClient();

async function main() {
  const result = await runDbBackup({ trigger: "manual", skipIfRunning: true });
  if (result.skipped) {
    console.log(`[db-backup] пропуск: ${result.reason}`);
    return;
  }
  console.log(
    `[db-backup] OK: таблиц ${result.tablesDone}, файлов ${result.uploadedFiles}, ${result.uploadedBytes} байт → ${result.remoteFolder}`,
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
