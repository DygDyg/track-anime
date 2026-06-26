import { prisma } from "@/lib/prisma";

export const SYNC_SETTINGS_ID = "default";

export const SYNC_INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120] as const;

export type KodikSyncSettingsDto = {
  enabled: boolean;
  intervalMinutes: number;
  syncPages: number;
  lastAutoRunAt: string | null;
  nextAutoRunAt: string | null;
  updatedAt: string;
};

function computeNextAutoRunAt(
  lastAutoRunAt: Date | null,
  intervalMinutes: number,
  enabled: boolean,
): Date | null {
  if (!enabled) return null;
  if (!lastAutoRunAt) return new Date();
  return new Date(lastAutoRunAt.getTime() + intervalMinutes * 60 * 1000);
}

export async function ensureSyncSettings() {
  const defaultPages = Number(process.env.KODIK_SYNC_PAGES ?? 3);

  await prisma.kodikSyncSettings.upsert({
    where: { id: SYNC_SETTINGS_ID },
    create: {
      id: SYNC_SETTINGS_ID,
      enabled: true,
      intervalMinutes: 10,
      syncPages: Number.isFinite(defaultPages) && defaultPages > 0 ? defaultPages : 3,
    },
    update: {},
  });
}

export async function getSyncSettings(): Promise<KodikSyncSettingsDto> {
  await ensureSyncSettings();
  const row = await prisma.kodikSyncSettings.findUniqueOrThrow({
    where: { id: SYNC_SETTINGS_ID },
  });

  const nextAutoRunAt = computeNextAutoRunAt(
    row.lastAutoRunAt,
    row.intervalMinutes,
    row.enabled,
  );

  return {
    enabled: row.enabled,
    intervalMinutes: row.intervalMinutes,
    syncPages: row.syncPages,
    lastAutoRunAt: row.lastAutoRunAt?.toISOString() ?? null,
    nextAutoRunAt: nextAutoRunAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateSyncSettings(input: {
  enabled?: boolean;
  intervalMinutes?: number;
  syncPages?: number;
}): Promise<KodikSyncSettingsDto> {
  await ensureSyncSettings();

  const data: {
    enabled?: boolean;
    intervalMinutes?: number;
    syncPages?: number;
  } = {};

  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.intervalMinutes !== undefined) data.intervalMinutes = input.intervalMinutes;
  if (input.syncPages !== undefined) data.syncPages = input.syncPages;

  await prisma.kodikSyncSettings.update({
    where: { id: SYNC_SETTINGS_ID },
    data,
  });

  return getSyncSettings();
}

export type KodikSyncRunDto = {
  id: string;
  trigger: string;
  status: string;
  checkedMaterials: number;
  updatedMaterials: number;
  newReleases: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type KodikSyncHistoryDto = {
  runs: KodikSyncRunDto[];
  stats24h: {
    totalRuns: number;
    successRuns: number;
    errorRuns: number;
    updatedMaterials: number;
    newReleases: number;
  };
};

function mapSyncRun(row: {
  id: string;
  trigger: string;
  status: string;
  checkedMaterials: number;
  updatedMaterials: number;
  newReleases: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}): KodikSyncRunDto {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    checkedMaterials: row.checkedMaterials,
    updatedMaterials: row.updatedMaterials,
    newReleases: row.newReleases,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
  };
}

export async function healStaleSyncRuns(staleMs = 10 * 60 * 1000) {
  const cutoff = new Date(Date.now() - staleMs);
  await prisma.kodikSyncRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "error",
      error: "Прервано (таймаут или перезапуск сервера)",
      finishedAt: new Date(),
    },
  });
}

export async function getSyncHistory(limit = 30): Promise<KodikSyncHistoryDto> {
  await healStaleSyncRuns();

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [runs, recentRuns] = await Promise.all([
    prisma.kodikSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    }),
    prisma.kodikSyncRun.findMany({
      where: { startedAt: { gte: dayAgo } },
      select: {
        status: true,
        updatedMaterials: true,
        newReleases: true,
      },
    }),
  ]);

  const stats24h = recentRuns.reduce(
    (acc, run) => {
      acc.totalRuns += 1;
      if (run.status === "done") acc.successRuns += 1;
      if (run.status === "error") acc.errorRuns += 1;
      acc.updatedMaterials += run.updatedMaterials;
      acc.newReleases += run.newReleases;
      return acc;
    },
    {
      totalRuns: 0,
      successRuns: 0,
      errorRuns: 0,
      updatedMaterials: 0,
      newReleases: 0,
    },
  );

  return {
    runs: runs.map(mapSyncRun),
    stats24h,
  };
}

export async function markAutoSyncFinished() {
  await ensureSyncSettings();
  await prisma.kodikSyncSettings.update({
    where: { id: SYNC_SETTINGS_ID },
    data: { lastAutoRunAt: new Date() },
  });
}
