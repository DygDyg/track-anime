import { rebuildNotificationPayloadForDelivery } from "@/lib/notifications/rebuild-payload";
import { prisma } from "@/lib/prisma";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

export type InAppNotificationItem = HistoryNewNotificationPayload & {
  id: string;
  notifiedAt: string;
};

export type InAppNotificationListResult = {
  items: InAppNotificationItem[];
  /** Макс. notifiedAt в выборке (включая отфильтрованные), чтобы курсор двигался вперёд. */
  latestAt: string | null;
};

const MAX_ITEMS = 24;

export async function resolveInAppNotifySince(userId: string, clientSince: Date): Promise<Date> {
  const prefs = await prisma.userNotificationPreferences.findUnique({
    where: { userId },
    select: { inAppNotifySince: true },
  });
  const serverSince = prefs?.inAppNotifySince;
  if (!serverSince) return clientSince;
  return serverSince.getTime() > clientSince.getTime() ? serverSince : clientSince;
}

export async function advanceInAppNotifySince(userId: string, iso: string): Promise<void> {
  const next = new Date(iso);
  if (Number.isNaN(next.getTime())) return;

  const existing = await prisma.userNotificationPreferences.findUnique({
    where: { userId },
    select: { inAppNotifySince: true },
  });

  if (existing?.inAppNotifySince && existing.inAppNotifySince.getTime() >= next.getTime()) {
    return;
  }

  await prisma.userNotificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      inAppNotifySince: next,
    },
    update: {
      inAppNotifySince: next,
    },
  });
}

export async function listInAppNotifications(
  userId: string,
  since: Date,
): Promise<InAppNotificationListResult> {
  const rows = await prisma.historyNewNotification.findMany({
    where: {
      userId,
      notifiedAt: { gt: since },
    },
    orderBy: { notifiedAt: "asc" },
    take: MAX_ITEMS,
  });

  let latestAt: string | null = null;
  const items: InAppNotificationItem[] = [];

  for (const row of rows) {
    const notifiedAt = row.notifiedAt.toISOString();
    if (!latestAt || notifiedAt > latestAt) latestAt = notifiedAt;

    const payload = await rebuildNotificationPayloadForDelivery({
      userId,
      materialId: row.materialId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
    });

    if (!payload) continue;

    items.push({
      ...payload,
      id: row.id,
      notifiedAt,
    });
  }

  return { items, latestAt };
}

export async function isInAppNotificationsEnabled(userId: string): Promise<boolean> {
  const prefs = await prisma.userNotificationPreferences.findUnique({
    where: { userId },
    select: { historyNewEnabled: true },
  });
  return prefs?.historyNewEnabled === true;
}
