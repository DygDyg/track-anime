import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

export type NotificationMessageTemplates = {
  discordTitle: string;
  discordDescription: string;
  telegramMessage: string;
  vkMessage: string;
};

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationMessageTemplates = {
  discordTitle: "Новая серия: {animeTitle}",
  discordDescription: "{episodeLabel} · {translationName}",
  telegramMessage: "<b>Новая серия: {animeTitle}</b>\n{episodeLabel} · {translationName}",
  vkMessage: "Новая серия: {animeTitle}\n{episodeLabel} · {translationName}",
};

const TELEGRAM_ANCHOR_TAG_RE = /<a\s+href="[^"]*"\s*>([\s\S]*?)<\/a>/gi;

export function prepareTelegramNotificationCaption(
  renderedHtml: string,
  fallbackLinkLabel = "Смотреть на Track Anime",
): { caption: string; linkButtonLabel: string } {
  let linkButtonLabel = fallbackLinkLabel;

  const caption = renderedHtml
    .replace(TELEGRAM_ANCHOR_TAG_RE, (_match, label: string) => {
      const trimmed = label.trim();
      if (trimmed) linkButtonLabel = trimmed;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { caption, linkButtonLabel };
}

export function isTelegramInlineButtonUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]";
  } catch {
    return false;
  }
}

export function buildTelegramWatchPageKeyboard(pageUrl: string, label: string) {
  return {
    inline_keyboard: [[{ text: label.slice(0, 64), url: pageUrl.slice(0, 2048) }]],
  };
}

export const NOTIFICATION_TEMPLATE_PLACEHOLDERS = [
  { key: "{animeTitle}", description: "Название аниме" },
  { key: "{seasonNumber}", description: "Номер сезона" },
  { key: "{episodeNumber}", description: "Номер серии" },
  { key: "{episodeLabel}", description: "«Серия N»" },
  { key: "{translationName}", description: "Озвучка" },
  { key: "{pageUrl}", description: "Ссылка на страницу тайтла (кнопка под сообщением)" },
  { key: "{duration}", description: "Длительность серии" },
  { key: "{releaseSeason}", description: "Сезон выхода" },
  { key: "{rating}", description: "Рейтинг Shikimori" },
  { key: "{ageRating}", description: "Возрастной рейтинг" },
  { key: "{description}", description: "Описание тайтла" },
  { key: "{screenshot1}", description: "Скриншот 1 (URL)" },
  { key: "{screenshot2}", description: "Скриншот 2 (URL)" },
  { key: "{screenshot3}", description: "Скриншот 3 (URL)" },
  { key: "{screenshot4}", description: "Скриншот 4 (URL)" },
] as const;

export function buildEpisodeLabel(_seasonNumber: number, episodeNumber: number): string {
  return `Серия ${episodeNumber}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeNotificationTemplates(
  input: Partial<NotificationMessageTemplates> | null | undefined,
): NotificationMessageTemplates {
  const trim = (value: string | null | undefined, fallback: string) => {
    const next = value?.trim();
    return next && next.length > 0 ? next : fallback;
  };

  return {
    discordTitle: trim(input?.discordTitle, DEFAULT_NOTIFICATION_TEMPLATES.discordTitle),
    discordDescription: trim(
      input?.discordDescription,
      DEFAULT_NOTIFICATION_TEMPLATES.discordDescription,
    ),
    telegramMessage: trim(input?.telegramMessage, DEFAULT_NOTIFICATION_TEMPLATES.telegramMessage),
    vkMessage: trim(input?.vkMessage, DEFAULT_NOTIFICATION_TEMPLATES.vkMessage),
  };
}

export function renderNotificationTemplate(
  template: string,
  payload: HistoryNewNotificationPayload,
  options?: { escapeValues?: boolean },
): string {
  const episodeLabel = buildEpisodeLabel(payload.seasonNumber, payload.episodeNumber);
  const format = options?.escapeValues ? escapeHtml : (value: string) => value;

  const replacements: Array<[string, string]> = [
    ["{animeTitle}", payload.animeTitle],
    ["{seasonNumber}", String(payload.seasonNumber)],
    ["{episodeNumber}", String(payload.episodeNumber)],
    ["{episodeLabel}", episodeLabel],
    ["{translationName}", payload.translationName],
    ["{pageUrl}", payload.pageUrl],
    ["{duration}", payload.duration],
    ["{releaseSeason}", payload.releaseSeason],
    ["{rating}", payload.rating],
    ["{ageRating}", payload.ageRating],
    ["{description}", payload.description],
    ["{screenshot1}", payload.screenshot1],
    ["{screenshot2}", payload.screenshot2],
    ["{screenshot3}", payload.screenshot3],
    ["{screenshot4}", payload.screenshot4],
  ];

  let rendered = template;
  for (const [key, value] of replacements) {
    rendered = rendered.replaceAll(key, format(value));
  }

  return rendered;
}
