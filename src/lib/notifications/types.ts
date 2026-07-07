/** Shikimori ID тайтла для тестовых уведомлений (пользовательские и админские). */
export const DEFAULT_TEST_SHIKIMORI_ID = 50346;

export type NotificationChannelId = "browser" | "telegram" | "vk" | "discord";

export type HistoryNewNotificationPayload = {

  materialId: string;
  shikimoriId: number;
  animeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  translationName: string;
  posterUrl: string | null;
  pageUrl: string;
  watchedSeasonNumber: number;
  watchedEpisodeNumber: number;
  duration: string;
  releaseSeason: string;
  rating: string;
  ageRating: string;
  description: string;
  screenshot1: string;
  screenshot2: string;
  screenshot3: string;
  screenshot4: string;
};

import type { UserNotificationTemplatePreferencesDto } from "@/lib/notifications/user-templates";

export type UserNotificationPreferencesDto = {
  historyNewEnabled: boolean;
  telegramEnabled: boolean;
  vkEnabled: boolean;
  discordEnabled: boolean;
  telegramLinked: boolean;
  vkLinked: boolean;
  discordLinked: boolean;
  discordDmVerified: boolean;
  discordInviteUrl: string | null;
  discordBotInviteUrl: string | null;
  /** Сервер настроил VAPID — push доступен, включение остаётся локальным для каждого браузера. */
  browserPushConfigured: boolean;
  telegramConfigured: boolean;
  vkConfigured: boolean;
  discordConfigured: boolean;
  telegramBotUsername: string | null;
  messageTemplates: UserNotificationTemplatePreferencesDto;
};
