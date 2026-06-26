import { prisma } from "@/lib/prisma";

export const IMPORT_JOB_ID = "full";

function computeSessionRate(
  done: number,
  startedAt: Date | null,
): number | null {
  if (done <= 0 || !startedAt) return null;
  const elapsed = (Date.now() - startedAt.getTime()) / 1000;
  if (elapsed < 5) return null;
  return done / elapsed;
}

async function captureSessionRate(phase: string): Promise<number | null> {
  const current = await prisma.kodikImportJob.findUnique({ where: { id: IMPORT_JOB_ID } });
  if (!current?.sessionStartedAt) return current?.lastItemsPerSecond ?? null;

  const done =
    phase === "catalog"
      ? Math.max(0, current.processed - current.sessionBaselineProcessed)
      : current.sessionProcessed;

  return computeSessionRate(done, current.sessionStartedAt) ?? current.lastItemsPerSecond ?? null;
}

export async function updateImportJobProgress(data: {
  phase?: string;
  status?: string;
  currentItem?: string | null;
  sessionProcessed?: number;
  sessionSkipped?: number;
  sessionTotal?: number | null;
  lastError?: string | null;
}) {
  await prisma.kodikImportJob.update({
    where: { id: IMPORT_JOB_ID },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
}

export async function startImportJobSession(input: {
  phase: string;
  sessionTotal?: number | null;
  clearError?: boolean;
}) {
  await prisma.kodikImportJob.upsert({
    where: { id: IMPORT_JOB_ID },
    create: {
      id: IMPORT_JOB_ID,
      phase: input.phase,
      status: "running",
      sessionProcessed: 0,
      sessionSkipped: 0,
      sessionTotal: input.sessionTotal ?? null,
      sessionStartedAt: new Date(),
      sessionBaselineProcessed: 0,
      currentItem: null,
      lastError: null,
    },
    update: {
      phase: input.phase,
      status: "running",
      sessionProcessed: 0,
      sessionSkipped: 0,
      sessionTotal: input.sessionTotal ?? null,
      sessionStartedAt: new Date(),
      sessionBaselineProcessed: 0,
      currentItem: null,
      ...(input.clearError ? { lastError: null } : {}),
    },
  });
}

export async function startCatalogImportSession(baselineProcessed: number) {
  await prisma.kodikImportJob.upsert({
    where: { id: IMPORT_JOB_ID },
    create: {
      id: IMPORT_JOB_ID,
      phase: "catalog",
      status: "running",
      sessionStartedAt: new Date(),
      sessionBaselineProcessed: baselineProcessed,
    },
    update: {
      phase: "catalog",
      status: "running",
      lastError: null,
      sessionStartedAt: new Date(),
      sessionBaselineProcessed: baselineProcessed,
    },
  });
}

export async function finishImportJobSession(input: {
  phase: string;
  status: string;
  lastError?: string | null;
  currentItem?: string | null;
}) {
  const lastItemsPerSecond = await captureSessionRate(input.phase);

  await prisma.kodikImportJob.update({
    where: { id: IMPORT_JOB_ID },
    data: {
      phase: input.phase,
      status: input.status,
      lastError: input.lastError ?? null,
      currentItem: input.currentItem ?? null,
      sessionStartedAt: null,
      ...(lastItemsPerSecond != null ? { lastItemsPerSecond } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function finishCatalogImportSession(): Promise<void> {
  const lastItemsPerSecond = await captureSessionRate("catalog");

  await prisma.kodikImportJob.update({
    where: { id: IMPORT_JOB_ID },
    data: {
      sessionStartedAt: null,
      ...(lastItemsPerSecond != null ? { lastItemsPerSecond } : {}),
      updatedAt: new Date(),
    },
  });
}
