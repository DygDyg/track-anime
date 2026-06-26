SELECT 'materials' AS metric, COUNT(*)::text AS value FROM "KodikMaterial"
UNION ALL SELECT 'episodes', COUNT(*)::text FROM "KodikEpisode"
UNION ALL SELECT 'release_rows', COUNT(*)::text FROM "KodikEpisodeRelease"
UNION ALL SELECT 'distinct_shikimori', COUNT(DISTINCT "shikimoriId")::text FROM "KodikMaterial" WHERE "shikimoriId" IS NOT NULL
UNION ALL SELECT 'titles_with_releases', (
  WITH titled AS (
    SELECT DISTINCT CASE WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text ELSE m."kodikId" END AS title_key
    FROM "KodikMaterial" m
    INNER JOIN "KodikEpisodeRelease" r ON r."materialId" = m."kodikId"
  )
  SELECT COUNT(*)::text FROM titled
)
UNION ALL SELECT 'episodes_loaded', COUNT(*)::text FROM "KodikMaterial" WHERE "episodesLoaded" = true
UNION ALL SELECT 'pending_episodes', COUNT(*)::text FROM "KodikMaterial" WHERE "episodesLoaded" = false;

SELECT phase, status, processed, total FROM "KodikImportJob" WHERE id = 'full';
