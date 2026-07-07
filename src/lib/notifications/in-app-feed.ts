import { rebuildNotificationPayloadForDelivery } from "@/lib/notifications/rebuild-payload";
import { prisma } from "@/lib/prisma";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

export type InAppNotificationItem = HistoryNewNotificationPayload & {
  id: string;
  notifiedAt: string;
};

const MAX_ITEMS = 24;

export async function listInAppNotifications(
  userId: string,
  since: Date,
): Promise<InAppNotificationItem[]> {
  const rows = await prisma.historyNewNotification.findMany({
    where: {
      userId,
      notifiedAt: { gt: since },
    },
    orderBy: { notifiedAt: "asc" },
    take: MAX_ITEMS,
  });

  const items: InAppNotificationItem[] = [];

  for (const row of rows) {
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
      notifiedAt: row.notifiedAt.toISOString(),
    });
  }

  return items;
}

export async function isInAppNotificationsEnabled(userId: string): Promise<boolean> {
  const prefs = await prisma.userNotificationPreferences.findUnique({
    where: { userId },
    select: { historyNewEnabled: true },
  });
  return prefs?.historyNewEnabled === true;
}
