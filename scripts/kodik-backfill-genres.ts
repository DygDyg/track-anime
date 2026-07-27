import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeKodikGenreKey, parseKodikGenres } from "../src/lib/kodik-material-meta.js";

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

async function main() {
  let cursor: string | undefined;
  let processed = 0;
  let written = 0;

  while (true) {
    const materials = await prisma.kodikMaterial.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { kodikId: cursor } } : {}),
      orderBy: { kodikId: "asc" },
      select: { kodikId: true, materialData: true },
    });
    if (materials.length === 0) break;

    const genreRows = materials.flatMap((material) => {
        const data = material.materialData as
          | { anime_genres?: unknown; all_genres?: unknown; genres?: unknown }
          | null;
        return parseKodikGenres(data?.anime_genres ?? data?.all_genres ?? data?.genres).map((genre) => ({
          materialId: material.kodikId,
          genreKey: normalizeKodikGenreKey(genre),
        }));
      });
    await prisma.$transaction([
      ...materials.map((material) =>
        prisma.kodikMaterialGenre.deleteMany({ where: { materialId: material.kodikId } }),
      ),
      prisma.kodikMaterialGenre.createMany({ data: genreRows, skipDuplicates: true }),
    ]);

    processed += materials.length;
    written += genreRows.length;
    cursor = materials.at(-1)?.kodikId;
    console.log(`[genres] materials=${processed}, rows=${written}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
