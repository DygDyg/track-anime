import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeKodikMaterialMetadata } from "../src/lib/kodik-material-metadata-normalizer";

const prisma = new PrismaClient();

function parseIds(value: string | undefined): number[] | null {
  if (!value) return null;
  const ids = value
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? ids : null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--write");
  const quiet = args.includes("--quiet");
  const idsArg = args.find((arg) => arg.startsWith("--ids="));
  const limitArg = args.find((arg) => arg.startsWith("--limit="));

  const result = await normalizeKodikMaterialMetadata(prisma, {
    dryRun,
    quiet,
    ids: parseIds(idsArg?.slice("--ids=".length)),
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) || null : null,
  });

  console.log(
    `${dryRun ? "dry-run" : "done"}: titles=${result.touchedTitles}, rows=${result.touchedRows}`,
  );
  if (dryRun) {
    console.log("Run with --write to apply changes.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
