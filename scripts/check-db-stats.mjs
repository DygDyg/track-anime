import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const materials = await p.kodikMaterial.count();
const episodes = await p.kodikEpisode.count();
const releaseRows = await p.kodikEpisodeRelease.count();
const distinctShikimori = await p.kodikMaterial.groupBy({
  by: ["shikimoriId"],
  where: { shikimoriId: { not: null } },
});
const episodesLoaded = await p.kodikMaterial.count({ where: { episodesLoaded: true } });
const pending = await p.kodikMaterial.count({ where: { episodesLoaded: false } });
const job = await p.kodikImportJob.findUnique({ where: { id: "full" } });
const titlesOnHomeFeed = await p.$queryRaw`
  WITH titled_materials AS (
    SELECT
      CASE
        WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
        ELSE m."kodikId"
      END AS title_key,
      m."kodikId",
      m."kodikUpdatedAt",
      m."lastEpisode"
    FROM "KodikMaterial" m
    WHERE (
      COALESCE(m."lastEpisode", 0) > 0
      OR m."episodesLoaded" = true
    )
  ),
  best_material AS (
    SELECT DISTINCT ON (tm.title_key) tm.title_key, tm."lastEpisode"
    FROM titled_materials tm
    ORDER BY tm.title_key, tm."kodikUpdatedAt" DESC NULLS LAST, tm."kodikId"
  )
  SELECT COUNT(*)::int AS count
  FROM best_material bm
  WHERE bm."lastEpisode" IS NOT NULL AND bm."lastEpisode" > 0
`;

const prefixes = await p.$queryRaw`
  SELECT split_part("kodikId", ':', 1) AS prefix, COUNT(*)::int AS cnt
  FROM "KodikMaterial"
  GROUP BY 1
  ORDER BY cnt DESC
  LIMIT 10
`;

const distinctTitlesInReleases = await p.$queryRaw`
  SELECT COUNT(DISTINCT COALESCE(m."shikimoriId"::text, r."materialId"))::int AS count
  FROM "KodikEpisodeRelease" r
  LEFT JOIN "KodikMaterial" m ON m."kodikId" = r."materialId"
`;

const materialsWithEpisodes = await p.$queryRaw`
  SELECT COUNT(DISTINCT "materialId")::int AS count FROM "KodikEpisode"
`;

const shikimoriWithEpisodes = await p.$queryRaw`
  SELECT COUNT(DISTINCT m."shikimoriId")::int AS count
  FROM "KodikMaterial" m
  INNER JOIN "KodikEpisode" e ON e."materialId" = m."kodikId"
  WHERE m."shikimoriId" IS NOT NULL
`;

console.log(
  JSON.stringify(
    {
      materials,
      episodes,
      releaseRows,
      distinctShikimori: distinctShikimori.length,
      titlesOnHomeFeed: titlesOnHomeFeed[0]?.count ?? 0,
      distinctTitlesInReleases: distinctTitlesInReleases[0]?.count ?? 0,
      materialsWithEpisodes: materialsWithEpisodes[0]?.count ?? 0,
      shikimoriWithEpisodes: shikimoriWithEpisodes[0]?.count ?? 0,
      episodesLoaded,
      pending,
      kodikIdPrefixes: prefixes,
      importJob: job
        ? {
            phase: job.phase,
            status: job.status,
            processed: job.processed,
            total: job.total,
            nextPageUrl: job.nextPageUrl ? "yes" : null,
          }
        : null,
    },
    null,
    2,
  ),
);

await p.$disconnect();
