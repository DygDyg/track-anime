import { prisma } from "@/lib/prisma";

export const COVER_REFRESH_RECENT_DEFAULT_DAYS = 8;
export const COVER_REFRESH_RECENT_MAX_DAYS = 30;

type ShikimoriIdRow = { shikimoriId: number };

function clampDays(days: number | undefined): number {
  if (days == null || !Number.isFinite(days)) return COVER_REFRESH_RECENT_DEFAULT_DAYS;
  const rounded = Math.round(days);
  if (rounded < 1) return 1;
  if (rounded > COVER_REFRESH_RECENT_MAX_DAYS) return COVER_REFRESH_RECENT_MAX_DAYS;
  return rounded;
}

/** Уникальные shikimoriId с релизом серии за последние N дней (лента). */
export async function listRecentReleaseShikimoriIds(daysInput?: number): Promise<number[]> {
  const days = clampDays(daysInput);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<ShikimoriIdRow[]>`
    SELECT DISTINCT "shikimoriId"
    FROM "KodikEpisodeRelease"
    WHERE "shikimoriId" IS NOT NULL
      AND "releasedAt" >= ${since}
    ORDER BY "shikimoriId" ASC
  `;
  return rows
    .map((row) => row.shikimoriId)
    .filter((id) => Number.isInteger(id) && id > 0);
}
