import { buildHistoryNewNotificationPayload } from "@/lib/notifications/payload";
import { sendBrowserPushNotification } from "@/lib/notifications/channels/browser";
import { sendDiscordNotification } from "@/lib/notifications/channels/discord";
import { sendTelegramNotification } from "@/lib/notifications/channels/telegram";
import { sendVkNotification } from "@/lib/notifications/channels/vk";
import { SHIKIMORI_CACHE_TRANSLATION_TYPE } from "@/db/save-shikimori-material";
import { prisma } from "@/lib/prisma";
import type { HistoryNewNotificationPayload, NotificationChannelId } from "@/lib/notifications/types";

export type SendTestNotificationResult = {
  payload: HistoryNewNotificationPayload | null;
  results: Partial<Record<NotificationChannelId, { ok: boolean; detail?: string }>>;
};

export async function buildTestNotificationPayload(input: {
  userId: string;
  shikimoriId: number;
  seasonNumber?: number;
  episodeNumber?: number;
}): Promise<HistoryNewNotificationPayload | null> {
  const progress = await prisma.userWatchProgress.findUnique({
    where: {
      userId_shikimoriId: {
        userId: input.userId,
        shikimoriId: input.shikimoriId,
      },
    },
    select: {
      kodikId: true,
      seasonNumber: true,
      episodeNumber: true,
    },
  });

  const material = progress
    ? await prisma.kodikMaterial.findUnique({
        where: { kodikId: progress.kodikId },
        select: {
          shikimoriId: true,
          kodikId: true,
          title: true,
          lastSeason: true,
          lastEpisode: true,
          episodesCount: true,
          kodikUpdatedAt: true,
          updatedAt: true,
          translationTitle: true,
          playerLink: true,
          materialData: true,
        },
      })
    : await prisma.kodikMaterial.findFirst({
        where: {
          shikimoriId: input.shikimoriId,
          translationType: { not: SHIKIMORI_CACHE_TRANSLATION_TYPE },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          shikimoriId: true,
          kodikId: true,
          title: true,
          lastSeason: true,
          lastEpisode: true,
          episodesCount: true,
          kodikUpdatedAt: true,
          updatedAt: true,
          translationTitle: true,
          playerLink: true,
          materialData: true,
        },
      });

  if (!material) return null;

  const seasonNumber = input.seasonNumber ?? material.lastSeason ?? 1;
  const episodeNumber = input.episodeNumber ?? material.lastEpisode ?? 1;

  return await buildHistoryNewNotificationPayload({
    material,
    seasonNumber,
    episodeNumber,
    watchedSeasonNumber: progress?.seasonNumber ?? Math.max(1, episodeNumber - 1),
    watchedEpisodeNumber: progress?.episodeNumber ?? Math.max(1, episodeNumber - 1),
  });
}

export async function sendTestNotification(input: {
  userId: string;
  shikimoriId: number;
  seasonNumber?: number;
  episodeNumber?: number;
  channels: NotificationChannelId[];
}): Promise<SendTestNotificationResult> {
  const payload = await buildTestNotificationPayload(input);
  const results: SendTestNotificationResult["results"] = {};

  if (!payload) {
    return { payload: null, results };
  }

  for (const channel of input.channels) {
    if (channel === "browser") {
      const push = await sendBrowserPushNotification(input.userId, payload);
      results.browser = {
        ok: push.sent > 0,
        detail: push.sent > 0 ? `push: ${push.sent}` : `нет подписок или push не настроен (failed ${push.failed})`,
      };
      continue;
    }

    if (channel === "telegram") {
      const link = await prisma.userNotificationLink.findUnique({
        where: { userId: input.userId },
        select: { telegramChatId: true },
      });
      if (!link?.telegramChatId) {
        results.telegram = { ok: false, detail: "telegram не привязан" };
        continue;
      }
      const sent = await sendTelegramNotification(link.telegramChatId, payload);
      results.telegram = {
        ok: sent.ok,
        detail: sent.ok ? "отправлено" : (sent.error ?? "ошибка API"),
      };
      continue;
    }

    if (channel === "vk") {
      const link = await prisma.userNotificationLink.findUnique({
        where: { userId: input.userId },
        select: { vkUserId: true },
      });
      if (!link?.vkUserId) {
        results.vk = { ok: false, detail: "vk не привязан" };
        continue;
      }
      const sent = await sendVkNotification(link.vkUserId, payload);
      results.vk = {
        ok: sent.ok,
        detail: sent.ok ? "отправлено" : (sent.error ?? "ошибка API"),
      };
      continue;
    }

    if (channel === "discord") {
      const link = await prisma.userNotificationLink.findUnique({
        where: { userId: input.userId },
        select: { discordUserId: true, discordDmVerified: true },
      });
      if (!link?.discordUserId) {
        results.discord = { ok: false, detail: "discord не привязан" };
        continue;
      }
      if (!link.discordDmVerified) {
        results.discord = {
          ok: false,
          detail: "ЛС не подтверждены — вступите на сервер и нажмите «Проверить» в настройках",
        };
        continue;
      }
      const sent = await sendDiscordNotification(link.discordUserId, payload);
      results.discord = {
        ok: sent.ok,
        detail: sent.ok ? "отправлено" : (sent.error ?? "ошибка DM"),
      };
    }
  }

  return { payload, results };
}
