SELECT id, status, phase, "updatedAt", "lastError", "sessionProcessed", "sessionTotal"
FROM "KodikImportJob"
ORDER BY "updatedAt" DESC
LIMIT 5;

SELECT COUNT(*) AS sync_runs
FROM "KodikImportJob"
WHERE phase = 'sync';
