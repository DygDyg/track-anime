import {
  getMoscowDayOfWeek,
  getMoscowDayStart,
  getOngoingCalendar,
} from "@/lib/calendar";
import { prisma } from "@/lib/prisma";

/** Unique history titles with an ongoing next episode scheduled for today (Moscow). */
export async function countTodayOngoingFromHistory(userId: string): Promise<number> {
  const historyRows = await prisma.userWatchProgress.findMany({
    where: { userId },
    select: { shikimoriId: true },
  });
  const historyIds = new Set(historyRows.map((row) => row.shikimoriId));
  if (historyIds.size === 0) return 0;

  const days = await getOngoingCalendar();
  const todayDow = getMoscowDayOfWeek();
  const dayStart = getMoscowDayStart().getTime();
  const dayEnd = dayStart + 86_400_000;
  const today = days.find((day) => day.dayOfWeek === todayDow);
  if (!today || today.items.length === 0) return 0;

  const matched = new Set<number>();
  for (const item of today.items) {
    if (!historyIds.has(item.shikimoriId)) continue;
    const at = new Date(item.scheduleAt).getTime();
    if (Number.isNaN(at) || at < dayStart || at >= dayEnd) continue;
    matched.add(item.shikimoriId);
  }

  return matched.size;
}
