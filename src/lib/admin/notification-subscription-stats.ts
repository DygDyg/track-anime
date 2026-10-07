import { prisma } from "@/lib/prisma";

export type NotificationSubscriptionStats = {
  /** Пользователи с включённым типом «Новое в истории» */
  historyNewEnabled: number;
  /** Каналы: реально получают (enabled + привязка / токен) */
  telegram: number;
  vk: number;
  discord: number;
  browser: number;
  fcm: number;
  /** Привязки без требования enabled */
  telegramLinked: number;
  vkLinked: number;
  discordLinked: number;
  discordDmVerified: number;
};

export async function getNotificationSubscriptionStats(): Promise<NotificationSubscriptionStats> {
  const [
    historyNewEnabled,
    telegram,
    vk,
    discord,
    telegramLinked,
    vkLinked,
    discordLinked,
    discordDmVerified,
    browserUsers,
    fcmUsers,
  ] = await Promise.all([
    prisma.userNotificationPreferences.count({ where: { historyNewEnabled: true } }),
    prisma.userNotificationPreferences.count({
      where: {
        historyNewEnabled: true,
        telegramEnabled: true,
        user: { notificationLink: { telegramChatId: { not: null } } },
      },
    }),
    prisma.userNotificationPreferences.count({
      where: {
        historyNewEnabled: true,
        vkEnabled: true,
        user: { notificationLink: { vkUserId: { not: null } } },
      },
    }),
    prisma.userNotificationPreferences.count({
      where: {
        historyNewEnabled: true,
        discordEnabled: true,
        user: { notificationLink: { discordUserId: { not: null } } },
      },
    }),
    prisma.userNotificationLink.count({ where: { telegramChatId: { not: null } } }),
    prisma.userNotificationLink.count({ where: { vkUserId: { not: null } } }),
    prisma.userNotificationLink.count({ where: { discordUserId: { not: null } } }),
    prisma.userNotificationLink.count({
      where: { discordUserId: { not: null }, discordDmVerified: true },
    }),
    prisma.user.count({
      where: {
        notificationPreferences: { historyNewEnabled: true },
        pushSubscriptions: { some: {} },
      },
    }),
    prisma.user.count({
      where: {
        notificationPreferences: { historyNewEnabled: true },
        fcmDeviceTokens: { some: {} },
      },
    }),
  ]);

  return {
    historyNewEnabled,
    telegram,
    vk,
    discord,
    browser: browserUsers,
    fcm: fcmUsers,
    telegramLinked,
    vkLinked,
    discordLinked,
    discordDmVerified,
  };
}
