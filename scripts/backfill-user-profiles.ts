#!/usr/bin/env tsx
/**
 * Подтягивает nickname и avatar с Shikimori для пользователей с placeholder `user_{id}`.
 *
 *   npx tsx scripts/backfill-user-profiles.ts
 *   npx tsx scripts/backfill-user-profiles.ts --dry-run
 *   npx tsx scripts/backfill-user-profiles.ts --limit=20
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  backfillPlaceholderUserProfiles,
  listPlaceholderUsers,
} from "../src/lib/shikimori/user-profile-backfill";

const prisma = new PrismaClient();

function readLimit(args: string[]): number | undefined {
  const raw = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limit = readLimit(args);

  const placeholders = await listPlaceholderUsers(limit);
  console.log(`Placeholder users (user_{id}): ${placeholders.length}${dryRun ? " [dry-run]" : ""}`);

  if (placeholders.length === 0) {
    return;
  }

  const results = await backfillPlaceholderUserProfiles({ dryRun, limit });

  const summary = {
    updated: 0,
    not_found: 0,
    unchanged: 0,
    error: 0,
  };

  for (const result of results) {
    summary[result.status] += 1;
    if (result.status === "updated") {
      console.log(`  ✓ ${result.shikimoriId} → ${result.nickname}`);
    } else if (result.status === "not_found") {
      console.log(`  ? ${result.shikimoriId} — не найден на Shikimori`);
    } else if (result.status === "error") {
      console.log(`  ✗ ${result.shikimoriId} — ${result.error}`);
    }
  }

  console.log("\nSummary:", summary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
