import { getNotificationMessageTemplates, isValidTelegramBotToken } from "@/lib/admin/notification-settings";
import { fetchNotificationCoverBuffer } from "@/lib/notifications/cover-fetch";
import { resolveNotificationPosterUrl } from "@/lib/notifications/payload";
import { getNotificationRuntimeConfig } from "@/lib/notifications/runtime-config";
import {
  buildEpisodeLabel,
  buildTelegramWatchPageKeyboard,
  isTelegramInlineButtonUrl,
  prepareTelegramNotificationCaption,
  renderNotificationTemplate,
} from "@/lib/notifications/templates";
import { resolveNotificationTemplatesForUser } from "@/lib/notifications/user-templates";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

export type TelegramSendResult = { ok: true } | { ok: false; error?: string };

type TelegramReplyMarkup = ReturnType<typeof buildTelegramWatchPageKeyboard>;

export async function isTelegramNotificationConfigured(): Promise<boolean> {
  const config = await getNotificationRuntimeConfig();
  return Boolean(config.telegramBotToken && isValidTelegramBotToken(config.telegramBotToken));
}

export async function getTelegramBotUsername(): Promise<string | null> {
  const config = await getNotificationRuntimeConfig();
  return config.telegramBotUsername;
}

export async function formatTelegramNotificationMessage(
  payload: HistoryNewNotificationPayload,
  options?: { userId?: string },
): Promise<string> {
  const templates = options?.userId
    ? await resolveNotificationTemplatesForUser(options.userId)
    : await getNotificationMessageTemplates();
  return renderNotificationTemplate(templates.telegramMessage, payload, { escapeValues: true });
}

async function buildTelegramNotificationDelivery(
  payload: HistoryNewNotificationPayload,
  options?: { userId?: string },
): Promise<{
  caption: string;
  replyMarkup: TelegramReplyMarkup | null;
}> {
  const templates = options?.userId
    ? await resolveNotificationTemplatesForUser(options.userId)
    : await getNotificationMessageTemplates();
  const rendered = renderNotificationTemplate(templates.telegramMessage, payload, { escapeValues: true });
  const { caption, linkButtonLabel } = prepareTelegramNotificationCaption(rendered);

  const replyMarkup = isTelegramInlineButtonUrl(payload.pageUrl)
    ? buildTelegramWatchPageKeyboard(payload.pageUrl, linkButtonLabel)
    : null;

  const captionWithLink =
    replyMarkup == null && payload.pageUrl ? `${caption}\n${payload.pageUrl}` : caption;

  return {
    caption: captionWithLink,
    replyMarkup,
  };
}

function buildPlainTelegramNotificationMessage(payload: HistoryNewNotificationPayload): string {
  const episodeLabel = buildEpisodeLabel(payload.seasonNumber, payload.episodeNumber);
  return `Новая серия: ${payload.animeTitle}\n${episodeLabel} · ${payload.translationName}`;
}

type TelegramApiResponse = { ok?: boolean; description?: string };

async function readTelegramApiResponse(
  response: Response,
  method: string,
): Promise<{ ok: boolean; description?: string }> {
  let data: TelegramApiResponse;
  try {
    data = (await response.json()) as TelegramApiResponse;
  } catch {
    const body = await response.text().catch(() => "");
    console.error(`[notifications] telegram ${method} invalid json`, response.status, body);
    return { ok: false, description: `HTTP ${response.status}` };
  }

  if (!response.ok || !data.ok) {
    console.error(
      `[notifications] telegram ${method} failed`,
      data.description ?? `HTTP ${response.status}`,
    );
    return { ok: false, description: data.description };
  }

  return { ok: true };
}

async function sendTelegramJsonRequest(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramSendResult> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await readTelegramApiResponse(response, method);
  return result.ok ? { ok: true } : { ok: false, error: result.description };
}

function withReplyMarkup(
  body: Record<string, unknown>,
  replyMarkup: TelegramReplyMarkup | null,
): Record<string, unknown> {
  return replyMarkup ? { ...body, reply_markup: replyMarkup } : body;
}

async function sendTelegramPhotoByUrl(
  token: string,
  chatId: string,
  photoUrl: string,
  caption: string,
  replyMarkup: TelegramReplyMarkup | null,
): Promise<TelegramSendResult> {
  return sendTelegramJsonRequest(
    token,
    "sendPhoto",
    withReplyMarkup(
      {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      },
      replyMarkup,
    ),
  );
}

async function sendTelegramPhotoByBuffer(
  token: string,
  chatId: string,
  cover: { buffer: Buffer; contentType: string },
  caption: string,
  replyMarkup: TelegramReplyMarkup | null,
): Promise<TelegramSendResult> {
  const extension = cover.contentType.includes("png")
    ? "png"
    : cover.contentType.includes("webp")
      ? "webp"
      : "jpg";

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("parse_mode", "HTML");
  form.append("caption", caption);
  if (replyMarkup) {
    form.append("reply_markup", JSON.stringify(replyMarkup));
  }
  form.append(
    "photo",
    new Blob([Uint8Array.from(cover.buffer)], { type: cover.contentType }),
    `cover.${extension}`,
  );

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  const result = await readTelegramApiResponse(response, "sendPhoto");
  return result.ok ? { ok: true } : { ok: false, error: result.description };
}

export async function sendTelegramNotification(
  chatId: string,
  payload: HistoryNewNotificationPayload,
  options?: { userId?: string },
): Promise<TelegramSendResult> {
  const config = await getNotificationRuntimeConfig();
  const token = config.telegramBotToken;
  if (!token) return { ok: false, error: "токен бота не настроен" };

  const { caption, replyMarkup } = await buildTelegramNotificationDelivery(payload, options);
  const posterUrl = resolveNotificationPosterUrl(payload);
  let lastError: string | undefined;

  const sentWithPhotoUrl = await sendTelegramPhotoByUrl(
    token,
    chatId,
    posterUrl,
    caption,
    replyMarkup,
  );
  if (sentWithPhotoUrl.ok) return sentWithPhotoUrl;
  lastError = sentWithPhotoUrl.error;

  const cover = await fetchNotificationCoverBuffer(payload);
  if (cover) {
    const sentWithUpload = await sendTelegramPhotoByBuffer(token, chatId, cover, caption, replyMarkup);
    if (sentWithUpload.ok) return sentWithUpload;
    lastError = sentWithUpload.error;
  }

  const sentAsText = await sendTelegramJsonRequest(
    token,
    "sendMessage",
    withReplyMarkup(
      {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      replyMarkup,
    ),
  );
  if (sentAsText.ok) return sentAsText;
  lastError = sentAsText.error;

  const plainText = buildPlainTelegramNotificationMessage(payload);
  const plainCaption =
    replyMarkup == null && payload.pageUrl ? `${plainText}\n${payload.pageUrl}` : plainText;
  const sentPlain = await sendTelegramJsonRequest(
    token,
    "sendMessage",
    withReplyMarkup(
      {
        chat_id: chatId,
        text: plainCaption,
      },
      replyMarkup,
    ),
  );
  if (sentPlain.ok) return sentPlain;

  return { ok: false, error: sentPlain.error ?? lastError };
}

export async function fetchTelegramBotUsername(): Promise<string | null> {
  const cached = await getTelegramBotUsername();
  if (cached) return cached;

  const config = await getNotificationRuntimeConfig();
  const token = config.telegramBotToken;
  if (!token) return null;

  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!response.ok) return null;

  const data = (await response.json()) as { ok?: boolean; result?: { username?: string } };
  return data.ok && data.result?.username ? data.result.username : null;
}
