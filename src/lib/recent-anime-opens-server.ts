import { prisma } from "@/lib/prisma";
import {
  RECENT_ANIME_OPENS_MAX,
  type RecentAnimeOpenEntry,
} from "@/lib/recent-anime-opens";

export type { RecentAnimeOpenEntry };

function mapRow(row: {
  shikimoriId: number;
  title: string;
  openedAt: Date;
}): RecentAnimeOpenEntry {
  return {
    shikimoriId: row.shikimoriId,
    title: row.title,
    openedAt: row.openedAt.toISOString(),
  };
}

function sortByOpenedAtDesc(items: RecentAnimeOpenEntry[]): RecentAnimeOpenEntry[] {
  return [...items].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  );
}

function mergeRecentAnimeOpens(
  serverItems: RecentAnimeOpenEntry[],
  localItems: RecentAnimeOpenEntry[],
): RecentAnimeOpenEntry[] {
  const byId = new Map<number, RecentAnimeOpenEntry>();

  for (const item of serverItems) {
    byId.set(item.shikimoriId, item);
  }

  for (const item of localItems) {
    const existing = byId.get(item.shikimoriId);
    if (!existing || new Date(item.openedAt).getTime() > new Date(existing.openedAt).getTime()) {
      byId.set(item.shikimoriId, item);
    }
  }

  return sortByOpenedAtDesc([...byId.values()]).slice(0, RECENT_ANIME_OPENS_MAX);
}

export async function getRecentAnimeOpens(userId: string): Promise<RecentAnimeOpenEntry[]> {
  const rows = await prisma.userRecentAnimeOpen.findMany({
    where: { userId },
    orderBy: { openedAt: "desc" },
    take: RECENT_ANIME_OPENS_MAX,
    select: { shikimoriId: true, title: true, openedAt: true },
  });

  return rows.map(mapRow);
}

export async function recordRecentAnimeOpen(
  userId: string,
  shikimoriId: number,
  title: string,
): Promise<RecentAnimeOpenEntry> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Пустое название аниме");
  }

  const now = new Date();
  const row = await prisma.userRecentAnimeOpen.upsert({
    where: {
      userId_shikimoriId: { userId, shikimoriId },
    },
    create: {
      userId,
      shikimoriId,
      title: trimmedTitle,
      openedAt: now,
    },
    update: {
      title: trimmedTitle,
      openedAt: now,
    },
    select: { shikimoriId: true, title: true, openedAt: true },
  });

  const overflow = await prisma.userRecentAnimeOpen.findMany({
    where: { userId },
    orderBy: { openedAt: "desc" },
    skip: RECENT_ANIME_OPENS_MAX,
    select: { id: true },
  });

  if (overflow.length > 0) {
    await prisma.userRecentAnimeOpen.deleteMany({
      where: { id: { in: overflow.map((item) => item.id) } },
    });
  }

  return mapRow(row);
}

export async function syncRecentAnimeOpens(
  userId: string,
  localItems: RecentAnimeOpenEntry[],
): Promise<RecentAnimeOpenEntry[]> {
  const serverItems = await getRecentAnimeOpens(userId);
  const merged = mergeRecentAnimeOpens(serverItems, localItems);

  if (merged.length === 0) {
    await prisma.userRecentAnimeOpen.deleteMany({ where: { userId } });
    return [];
  }

  await prisma.$transaction([
    prisma.userRecentAnimeOpen.deleteMany({ where: { userId } }),
    prisma.userRecentAnimeOpen.createMany({
      data: merged.map((item) => ({
        userId,
        shikimoriId: item.shikimoriId,
        title: item.title,
        openedAt: new Date(item.openedAt),
      })),
    }),
  ]);

  return merged;
}
