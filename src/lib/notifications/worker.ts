import { sendDiscordNotification } from "@/lib/notifications/channels/discord";
import { sendTelegramNotification } from "@/lib/notifications/channels/telegram";
import { sendVkNotification } from "@/lib/notifications/channels/vk";
import { rebuildNotificationPayloadForDelivery } from "@/lib/notifications/rebuild-payload";
import { prisma } from "@/lib/prisma";
import type { NotificationChannelId } from "@/lib/notifications/types";

const MAX_ATTEMPTS = 5;

async function sendToChannel(
  channel: NotificationChannelId,
  userId: string,
  payload: NonNullable<Awaited<ReturnType<typeof rebuildNotificationPayloadForDelivery>>>,
): Promise<boolean> {
  if (channel === "telegram") {
    const link = await prisma.userNotificationLink.findUnique({
      where: { userId },
      select: { telegramChatId: true },
    });
    if (!link?.telegramChatId) return false;
    const sent = await sendTelegramNotification(link.telegramChatId, payload, { userId });
    return sent.ok;
  }

  if (channel === "vk") {
    const link = await prisma.userNotificationLink.findUnique({
      where: { userId },
      select: { vkUserId: true },
    });
    if (!link?.vkUserId) return false;
    const sent = await sendVkNotification(link.vkUserId, payload, { userId });
    return sent.ok;
  }

  if (channel === "discord") {
    const link = await prisma.userNotificationLink.findUnique({
      where: { userId },
      select: { discordUserId: true, discordDmVerified: true },
    });
    if (!link?.discordUserId) return false;
    if (!link.discordDmVerified) return false;
    const sent = await sendDiscordNotification(link.discordUserId, payload, { userId });
    return sent.ok;
  }

  return false;
}

export type ProcessDeliveriesResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function processPendingNotificationDeliveries(
  limit = 50,
): Promise<ProcessDeliveriesResult> {
  const pending = await prisma.notificationDelivery.findMany({
    where: {
      status: "pending",
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const result: ProcessDeliveriesResult = {
    processed: pending.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of pending) {
    const channel = row.channel as NotificationChannelId;
    if (channel !== "telegram" && channel !== "vk" && channel !== "discord") {
      result.skipped += 1;
      continue;
    }

    const payload = await rebuildNotificationPayloadForDelivery({
      userId: row.userId,
      materialId: row.materialId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
    });

    if (!payload) {
      await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: {
          status: "failed",
          attempts: { increment: 1 },
          lastError: "payload_not_found",
        },
      });
      result.failed += 1;
      continue;
    }

    try {
      const ok = await sendToChannel(channel, row.userId, payload);

      if (ok) {
        await prisma.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
          },
        });
        result.sent += 1;
      } else {
        const attempts = row.attempts + 1;
        await prisma.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            attempts: { increment: 1 },
            lastError: "delivery_failed",
          },
        });
        result.failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = row.attempts + 1;
      await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts: { increment: 1 },
          lastError: message,
        },
      });
      result.failed += 1;
    }
  }

  return result;
}
