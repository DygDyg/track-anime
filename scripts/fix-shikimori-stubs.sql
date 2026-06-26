UPDATE "KodikMaterial"
SET "episodesLoaded" = true
WHERE "episodesLoaded" = false
  AND "kodikId" LIKE 'shikimori:%';

SELECT COUNT(*) AS pending FROM "KodikMaterial" WHERE "episodesLoaded" = false;

UPDATE "KodikImportJob"
SET status = 'done', "lastError" = NULL, "currentItem" = NULL
WHERE id = 'full';
