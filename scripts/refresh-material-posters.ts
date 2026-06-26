#!/usr/bin/env tsx
/**
 * Обновляет materialData и постеры для материалов по shikimoriId через Kodik API.
 *
 *   npx tsx scripts/refresh-material-posters.ts 61126
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { saveKodikMaterial } from "../src/db/save-material";
import { resolveMaterialPosterUrl } from "../src/lib/material-poster";
import { kodikSearch } from "../src/kodik/client";

const prisma = new PrismaClient();

async function refreshShikimoriId(shikimoriId: number): Promise<void> {
  const materials = await prisma.kodikMaterial.findMany({
    where: { shikimoriId },
    select: { kodikId: true },
    orderBy: { kodikUpdatedAt: "desc" },
  });

  if (materials.length === 0) {
    console.log(`[${shikimoriId}] материалов в БД нет`);
    return;
  }

  const kodikIds = [...new Set(materials.map((m) => m.kodikId))];
  console.log(`[${shikimoriId}] обновляю ${kodikIds.length} материал(ов)...`);

  let posterUrl: string | null = null;

  for (const kodikId of kodikIds) {
    const response = await kodikSearch({
      id: kodikId,
      with_material_data: true,
    });
    const material = response.results[0];
    if (!material) {
      console.log(`  ${kodikId}: не найден в Kodik`);
      continue;
    }

    await saveKodikMaterial(prisma, material, {
      loadEpisodes: false,
      trackReleases: false,
    });

    const row = await prisma.kodikMaterial.findUnique({
      where: { kodikId },
      select: { materialData: true },
    });
    const resolved = resolveMaterialPosterUrl(
      row?.materialData as Record<string, unknown> | null,
    );
    posterUrl = posterUrl ?? resolved;
    console.log(`  ${kodikId}: worldart_link=${material.worldart_link ?? "—"}, poster=${resolved ?? "—"}`);
  }

  if (posterUrl) {
    const updated = await prisma.kodikEpisodeRelease.updateMany({
      where: { shikimoriId, OR: [{ posterUrl: null }, { posterUrl: "" }] },
      data: { posterUrl },
    });
    console.log(`[${shikimoriId}] обновлено релизов без постера: ${updated.count}`);
  }
}

async function main() {
  const ids = process.argv.slice(2).map(Number).filter((id) => id > 0);
  if (ids.length === 0) {
    console.error("Укажите shikimoriId: npx tsx scripts/refresh-material-posters.ts 61126");
    process.exitCode = 1;
    return;
  }

  for (const id of ids) {
    await refreshShikimoriId(id);
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
