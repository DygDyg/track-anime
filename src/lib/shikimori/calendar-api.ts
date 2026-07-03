import { shikimoriFetch } from "@/lib/shikimori/client";
import type { ShikimoriCalendarEntry } from "@/lib/shikimori/types";

export async function fetchShikimoriCalendar(): Promise<ShikimoriCalendarEntry[]> {
  const result = await shikimoriFetch<ShikimoriCalendarEntry[]>("/calendar?censored=false");
  return result ?? [];
}

export function buildShikimoriCalendarAnonsMap(
  entries: ShikimoriCalendarEntry[],
): Map<number, { scheduleAt: Date; nextEpisode: number }> {
  const map = new Map<number, { scheduleAt: Date; nextEpisode: number }>();

  for (const entry of entries) {
    if (entry.anime.status !== "anons") continue;
    if (!entry.next_episode_at) continue;

    const scheduleAt = new Date(entry.next_episode_at);
    if (Number.isNaN(scheduleAt.getTime())) continue;

    map.set(entry.anime.id, {
      scheduleAt,
      nextEpisode: entry.next_episode,
    });
  }

  return map;
}
