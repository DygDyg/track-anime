#!/usr/bin/env tsx
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveMaterialPosterUrl } from "../src/lib/material-poster";
import { fetchWorldArtPoster } from "../src/lib/world-art-poster";

const shikimoriId = Number(process.argv[2] ?? "61126");
const prisma = new PrismaClient();

async function main() {
  const materials = await prisma.kodikMaterial.findMany({
    where: { shikimoriId },
    orderBy: { kodikUpdatedAt: "desc" },
    take: 5,
    select: { kodikId: true, title: true, materialData: true },
  });

  console.log("Materials:", materials.length);
  for (const material of materials) {
    const data = material.materialData as Record<string, unknown> | null;
    const worldartLink = data?.worldart_link;
    console.log("\n---", material.kodikId, material.title);
    console.log(
      JSON.stringify(
        {
          anime_poster_url: data?.anime_poster_url ?? null,
          poster_url: data?.poster_url ?? null,
          worldart_poster_url: data?.worldart_poster_url ?? null,
          worldart_link: worldartLink ?? null,
          worldart_animation_id: data?.worldart_animation_id ?? null,
          resolved: resolveMaterialPosterUrl(data),
        },
        null,
        2,
      ),
    );

    if (typeof worldartLink === "string" && worldartLink) {
      const fetched = await fetchWorldArtPoster(worldartLink);
      console.log("fetchWorldArtPoster:", fetched);
    }
  }

  const release = await prisma.kodikEpisodeRelease.findFirst({
    where: { shikimoriId },
    orderBy: { releasedAt: "desc" },
    select: { posterUrl: true, animeTitle: true },
  });
  console.log("\nRelease:", release);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
