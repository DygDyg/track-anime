import { prisma } from "@/lib/prisma";
import { LIST_STATUS_LABELS } from "@/lib/shikimori/user-rates";

export type UserAnimeListInfo = {
  listStatus: string | null;
  isBookmark: boolean;
};

export function shouldShowListBadge(info: UserAnimeListInfo | null | undefined): boolean {
  return Boolean(info && (info.listStatus || info.isBookmark));
}

export function getListBadgeLabel(info: UserAnimeListInfo): string | null {
  if (info.listStatus && LIST_STATUS_LABELS[info.listStatus]) {
    return LIST_STATUS_LABELS[info.listStatus];
  }
  if (info.isBookmark) return LIST_STATUS_LABELS.bookmarks;
  return null;
}

function mergeListInfo(
  map: Map<number, UserAnimeListInfo>,
  shikimoriId: number,
  patch: Partial<UserAnimeListInfo>,
): void {
  const existing = map.get(shikimoriId);
  if (existing) {
    if (patch.listStatus != null) existing.listStatus = patch.listStatus;
    if (patch.isBookmark) existing.isBookmark = true;
    return;
  }
  map.set(shikimoriId, {
    listStatus: patch.listStatus ?? null,
    isBookmark: patch.isBookmark ?? false,
  });
}

export async function getUserAnimeListStatus(
  userId: string,
  shikimoriId: number,
): Promise<UserAnimeListInfo | null> {
  const [entry, bookmark] = await Promise.all([
    prisma.userAnimeListEntry.findUnique({
      where: { userId_shikimoriId: { userId, shikimoriId } },
      select: { listStatus: true },
    }),
    prisma.userAnimeBookmark.findUnique({
      where: { userId_shikimoriId: { userId, shikimoriId } },
      select: { shikimoriId: true },
    }),
  ]);

  if (!entry && !bookmark) return null;

  return {
    listStatus: entry?.listStatus ?? null,
    isBookmark: Boolean(bookmark),
  };
}

export async function getUserAnimeListStatusMap(userId: string): Promise<Map<number, UserAnimeListInfo>> {
  const [entries, bookmarks] = await Promise.all([
    prisma.userAnimeListEntry.findMany({
      where: { userId },
      select: { shikimoriId: true, listStatus: true },
    }),
    prisma.userAnimeBookmark.findMany({
      where: { userId },
      select: { shikimoriId: true },
    }),
  ]);

  const map = new Map<number, UserAnimeListInfo>();

  for (const entry of entries) {
    mergeListInfo(map, entry.shikimoriId, { listStatus: entry.listStatus });
  }
  for (const bookmark of bookmarks) {
    mergeListInfo(map, bookmark.shikimoriId, { isBookmark: true });
  }

  return map;
}

export function serializeUserAnimeListMap(
  map: Map<number, UserAnimeListInfo>,
): Record<string, UserAnimeListInfo> {
  const out: Record<string, UserAnimeListInfo> = {};
  for (const [id, info] of map) {
    out[String(id)] = info;
  }
  return out;
}
