SELECT enabled, "intervalMinutes", "syncPages", "lastAutoRunAt" FROM "KodikSyncSettings";
SELECT COUNT(*) AS runs FROM "KodikSyncRun";
SELECT trigger, status, "checkedMaterials", "updatedMaterials", "newReleases", "startedAt"
FROM "KodikSyncRun"
ORDER BY "startedAt" DESC
LIMIT 3;
