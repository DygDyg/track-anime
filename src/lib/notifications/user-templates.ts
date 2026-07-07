import { getNotificationMessageTemplates } from "@/lib/admin/notification-settings";
import { prisma } from "@/lib/prisma";
import {
  normalizeNotificationTemplates,
  type NotificationMessageTemplates,
} from "@/lib/notifications/templates";

export type UserNotificationTemplatePreferencesDto = {
  customDiscordTemplateEnabled: boolean;
  customTelegramTemplateEnabled: boolean;
  customVkTemplateEnabled: boolean;
  discordTitle: string;
  discordDescription: string;
  telegramMessage: string;
  vkMessage: string;
  defaultTemplates: NotificationMessageTemplates;
};

const TEMPLATE_MAX_LENGTH = 4000;

function trimTemplate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, TEMPLATE_MAX_LENGTH);
}

function pickTemplate(
  customEnabled: boolean,
  userValue: string | null | undefined,
  siteValue: string,
): string {
  if (!customEnabled) return siteValue;
  const trimmed = userValue?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : siteValue;
}

export async function resolveNotificationTemplatesForUser(
  userId: string,
): Promise<NotificationMessageTemplates> {
  const [prefs, siteTemplates] = await Promise.all([
    prisma.userNotificationPreferences.findUnique({ where: { userId } }),
    getNotificationMessageTemplates(),
  ]);

  if (!prefs) return siteTemplates;

  return {
    discordTitle: pickTemplate(
      prefs.customDiscordTemplateEnabled,
      prefs.discordTitleTemplate,
      siteTemplates.discordTitle,
    ),
    discordDescription: pickTemplate(
      prefs.customDiscordTemplateEnabled,
      prefs.discordDescriptionTemplate,
      siteTemplates.discordDescription,
    ),
    telegramMessage: pickTemplate(
      prefs.customTelegramTemplateEnabled,
      prefs.telegramMessageTemplate,
      siteTemplates.telegramMessage,
    ),
    vkMessage: pickTemplate(
      prefs.customVkTemplateEnabled,
      prefs.vkMessageTemplate,
      siteTemplates.vkMessage,
    ),
  };
}

export async function buildUserNotificationTemplatePreferencesDto(
  prefs: {
    customDiscordTemplateEnabled: boolean;
    customTelegramTemplateEnabled: boolean;
    customVkTemplateEnabled: boolean;
    discordTitleTemplate: string | null;
    discordDescriptionTemplate: string | null;
    telegramMessageTemplate: string | null;
    vkMessageTemplate: string | null;
  } | null,
  siteTemplates: NotificationMessageTemplates,
): Promise<UserNotificationTemplatePreferencesDto> {
  const defaults = normalizeNotificationTemplates(siteTemplates);

  return {
    customDiscordTemplateEnabled: prefs?.customDiscordTemplateEnabled ?? false,
    customTelegramTemplateEnabled: prefs?.customTelegramTemplateEnabled ?? false,
    customVkTemplateEnabled: prefs?.customVkTemplateEnabled ?? false,
    discordTitle: prefs?.discordTitleTemplate?.trim() || defaults.discordTitle,
    discordDescription: prefs?.discordDescriptionTemplate?.trim() || defaults.discordDescription,
    telegramMessage: prefs?.telegramMessageTemplate?.trim() || defaults.telegramMessage,
    vkMessage: prefs?.vkMessageTemplate?.trim() || defaults.vkMessage,
    defaultTemplates: defaults,
  };
}

export type UserNotificationTemplateInput = {
  customDiscordTemplateEnabled?: boolean;
  customTelegramTemplateEnabled?: boolean;
  customVkTemplateEnabled?: boolean;
  discordTitle?: string | null;
  discordDescription?: string | null;
  telegramMessage?: string | null;
  vkMessage?: string | null;
};

export function buildUserNotificationTemplateUpdate(
  input: UserNotificationTemplateInput,
): Record<string, boolean | string | null> {
  const data: Record<string, boolean | string | null> = {};

  if (input.customDiscordTemplateEnabled !== undefined) {
    data.customDiscordTemplateEnabled = input.customDiscordTemplateEnabled;
  }
  if (input.customTelegramTemplateEnabled !== undefined) {
    data.customTelegramTemplateEnabled = input.customTelegramTemplateEnabled;
  }
  if (input.customVkTemplateEnabled !== undefined) {
    data.customVkTemplateEnabled = input.customVkTemplateEnabled;
  }
  if (input.discordTitle !== undefined) {
    data.discordTitleTemplate = trimTemplate(input.discordTitle);
  }
  if (input.discordDescription !== undefined) {
    data.discordDescriptionTemplate = trimTemplate(input.discordDescription);
  }
  if (input.telegramMessage !== undefined) {
    data.telegramMessageTemplate = trimTemplate(input.telegramMessage);
  }
  if (input.vkMessage !== undefined) {
    data.vkMessageTemplate = trimTemplate(input.vkMessage);
  }

  return data;
}
