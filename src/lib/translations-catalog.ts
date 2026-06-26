import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

async function queryDistinctTranslationNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT DISTINCT r."translationName" AS name
    FROM "KodikEpisodeRelease" r
    WHERE NULLIF(TRIM(r."translationName"), '') IS NOT NULL
    ORDER BY name ASC
  `;

  return rows.map((row) => row.name.trim()).filter(Boolean);
}

export async function getDistinctTranslationNames(): Promise<string[]> {
  return unstable_cache(
    queryDistinctTranslationNames,
    ["distinct-translation-names"],
    { revalidate: 3600, tags: ["translations"] },
  )();
}
