import { prisma } from "@/lib/prisma";
import { ensureSyncSettings, SYNC_SETTINGS_ID } from "@/lib/admin/kodik-sync-settings";

/** Порог «база устарела» для админ-баннера на главной. */
export const KODIK_DB_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export type KodikDbFreshness = {
  /** ISO времени последнего успешного sync (или null, если никогда не было). */
  lastSuccessfulSyncAt: string | null;
  /** true, если старше порога или sync никогда не завершался успешно. */
  stale: boolean;
  staleAfterHours: number;
  ageMs: number | null;
};

export async function getKodikDbFreshness(
  now = Date.now(),
  staleAfterMs = KODIK_DB_STALE_AFTER_MS,
): Promise<KodikDbFreshness> {
  await ensureSyncSettings();

  const [lastDone, settings] = await Promise.all([
    prisma.kodikSyncRun.findFirst({
      where: { status: "done" },
      orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
      select: { finishedAt: true, startedAt: true },
    }),
    prisma.kodikSyncSettings.findUnique({
      where: { id: SYNC_SETTINGS_ID },
      select: { lastAutoRunAt: true },
    }),
  ]);

  const candidates: Date[] = [];
  if (lastDone?.finishedAt) candidates.push(lastDone.finishedAt);
  else if (lastDone?.startedAt) candidates.push(lastDone.startedAt);
  if (settings?.lastAutoRunAt) candidates.push(settings.lastAutoRunAt);

  const lastAt =
    candidates.length > 0
      ? new Date(Math.max(...candidates.map((d) => d.getTime())))
      : null;

  const ageMs = lastAt ? Math.max(0, now - lastAt.getTime()) : null;
  const stale = lastAt == null || ageMs == null || ageMs >= staleAfterMs;

  return {
    lastSuccessfulSyncAt: lastAt?.toISOString() ?? null,
    stale,
    staleAfterHours: Math.round(staleAfterMs / (60 * 60 * 1000)),
    ageMs,
  };
}
