import { prisma } from "@/lib/prisma";
import { getNotificationSettingsDto } from "@/lib/admin/notification-settings";
import { isWebPushRuntimeConfigured } from "@/lib/notifications/channels/browser";
import {
  fetchTelegramBotUsername,
  isTelegramNotificationConfigured,
} from "@/lib/notifications/channels/telegram";
import {
  isDiscordNotificationConfigured,
  resolveDiscordNotificationInviteUrl,
} from "@/lib/notifications/discord-oauth";
import type { UserNotificationPreferencesDto } from "@/lib/notifications/types";
import {
  buildUserNotificationTemplatePreferencesDto,
  buildUserNotificationTemplateUpdate,
  type UserNotificationTemplateInput,
} from "@/lib/notifications/user-templates";

export type NotificationPreferencesInput = {
  historyNewEnabled?: boolean;
  telegramEnabled?: boolean;
  vkEnabled?: boolean;
  discordEnabled?: boolean;
} & UserNotificationTemplateInput;

const DEFAULT_PREFERENCES = {
  historyNewEnabled: false,
  telegramEnabled: false,
  vkEnabled: false,
  discordEnabled: false,
} as const;

export async function getUserNotificationPreferences(
  userId: string,
): Promise<UserNotificationPreferencesDto> {
  const [prefs, link, telegramBotUsername, adminSettings] = await Promise.all([
    prisma.userNotificationPreferences.findUnique({ where: { userId } }),
    prisma.userNotificationLink.findUnique({
      where: { userId },
      select: { telegramChatId: true, vkUserId: true, discordUserId: true, discordDmVerified: true },
    }),
    isTelegramNotificationConfigured().then((ok) => (ok ? fetchTelegramBotUsername() : null)),
    getNotificationSettingsDto(),
  ]);

  const webPushConfigured = adminSettings.webPushConfigured;
  const discordLinked = Boolean(link?.discordUserId);
  const discordDmVerified = Boolean(link?.discordDmVerified);
  const discordInviteUrl =
    discordLinked && !discordDmVerified && adminSettings.discordConfigured
      ? await resolveDiscordNotificationInviteUrl()
      : null;
  const discordBotInviteUrl =
    discordLinked && !discordDmVerified && adminSettings.discordConfigured
      ? adminSettings.discordNotificationBotInviteUrl
      : null;

  const messageTemplates = await buildUserNotificationTemplatePreferencesDto(
    prefs,
    adminSettings.messageTemplates,
  );

  return {
    historyNewEnabled: prefs?.historyNewEnabled ?? DEFAULT_PREFERENCES.historyNewEnabled,
    telegramEnabled: prefs?.telegramEnabled ?? DEFAULT_PREFERENCES.telegramEnabled,
    vkEnabled: prefs?.vkEnabled ?? DEFAULT_PREFERENCES.vkEnabled,
    discordEnabled: prefs?.discordEnabled ?? DEFAULT_PREFERENCES.discordEnabled,
    telegramLinked: Boolean(link?.telegramChatId),
    vkLinked: Boolean(link?.vkUserId),
    discordLinked,
    discordDmVerified,
    discordInviteUrl,
    discordBotInviteUrl,
    browserPushConfigured: webPushConfigured,
    telegramConfigured: adminSettings.telegramConfigured,
    vkConfigured: adminSettings.vkConfigured,
    discordConfigured: adminSettings.discordConfigured,
    telegramBotUsername,
    messageTemplates,
  };
}

export async function saveUserNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
): Promise<UserNotificationPreferencesDto> {
  const templateUpdate = buildUserNotificationTemplateUpdate(input);

  const enablingHistoryNew = input.historyNewEnabled === true;
  const notifySinceReset = enablingHistoryNew ? new Date() : undefined;

  await prisma.userNotificationPreferences.upsert({
    where: { userId },
    create: {
      userId,
      historyNewEnabled: input.historyNewEnabled ?? false,
      telegramEnabled: input.telegramEnabled ?? false,
      vkEnabled: input.vkEnabled ?? false,
      discordEnabled: input.discordEnabled ?? false,
      ...(notifySinceReset ? { inAppNotifySince: notifySinceReset } : {}),
      ...templateUpdate,
    },
    update: {
      ...(input.historyNewEnabled !== undefined
        ? { historyNewEnabled: input.historyNewEnabled }
        : {}),
      ...(input.telegramEnabled !== undefined ? { telegramEnabled: input.telegramEnabled } : {}),
      ...(input.vkEnabled !== undefined ? { vkEnabled: input.vkEnabled } : {}),
      ...(input.discordEnabled !== undefined ? { discordEnabled: input.discordEnabled } : {}),
      ...(notifySinceReset ? { inAppNotifySince: notifySinceReset } : {}),
      ...templateUpdate,
    },
  });

  return getUserNotificationPreferences(userId);
}

export async function isWebPushConfigured(): Promise<boolean> {
  return isWebPushRuntimeConfigured();
}
