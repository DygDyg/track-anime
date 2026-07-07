import { getNotificationMessageTemplates, isValidVkBotToken } from "@/lib/admin/notification-settings";
import { fetchNotificationCoverBuffer } from "@/lib/notifications/cover-fetch";
import { resolveNotificationPosterUrl } from "@/lib/notifications/payload";
import { getNotificationRuntimeConfig } from "@/lib/notifications/runtime-config";
import {
  buildEpisodeLabel,
  isTelegramInlineButtonUrl,
  prepareTelegramNotificationCaption,
  renderNotificationTemplate,
} from "@/lib/notifications/templates";
import { resolveNotificationTemplatesForUser } from "@/lib/notifications/user-templates";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

const VK_API_VERSION = "5.199";

export type VkSendResult = { ok: true } | { ok: false; error?: string };

type VkApiResponse<T = unknown> = {
  response?: T;
  error?: { error_code?: number; error_msg?: string };
};

async function vkApiRequest<T>(
  method: string,
  token: string,
  params: Record<string, string | number | undefined>,
): Promise<{ ok: true; response: T } | { ok: false; error: string }> {
  const url = new URL(`https://api.vk.com/method/${method}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("v", VK_API_VERSION);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let data: VkApiResponse<T>;
  try {
    const response = await fetch(url);
    data = (await response.json()) as VkApiResponse<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  if (data.error) {
    const message = data.error.error_msg ?? `VK error ${data.error.error_code ?? "unknown"}`;
    console.error(`[notifications] vk ${method} failed`, message);
    return { ok: false, error: message };
  }

  return { ok: true, response: data.response as T };
}

export async function isVkNotificationConfigured(): Promise<boolean> {
  const config = await getNotificationRuntimeConfig();
  return Boolean(
    config.vkBotToken &&
      isValidVkBotToken(config.vkBotToken) &&
      config.vkGroupId &&
      config.vkGroupId.trim().length > 0,
  );
}

export function normalizeVkGroupId(groupId: string): string {
  return groupId.trim().replace(/^-/, "");
}

export async function getVkGroupScreenName(): Promise<string | null> {
  const config = await getNotificationRuntimeConfig();
  if (config.vkGroupScreenName) return config.vkGroupScreenName;
  if (!config.vkBotToken || !config.vkGroupId) return null;

  const result = await vkApiRequest<Array<{ screen_name?: string }>>(
    "groups.getById",
    config.vkBotToken,
    { group_id: normalizeVkGroupId(config.vkGroupId) },
  );

  if (!result.ok) return null;
  const screenName = result.response?.[0]?.screen_name?.trim();
  return screenName || null;
}

export async function buildVkDeepLink(token: string): Promise<string | null> {
  const config = await getNotificationRuntimeConfig();
  if (!config.vkGroupId) return null;

  const ref = encodeURIComponent(token);
  const screenName = config.vkGroupScreenName ?? (await getVkGroupScreenName());
  if (screenName) {
    return `https://vk.me/${screenName}?ref=${ref}`;
  }

  return `https://vk.com/write-${normalizeVkGroupId(config.vkGroupId)}?ref=${ref}`;
}

function buildVkWatchPageKeyboard(pageUrl: string, label: string) {
  return JSON.stringify({
    one_time: false,
    inline: true,
    buttons: [
      [
        {
          action: {
            type: "open_link",
            link: pageUrl.slice(0, 2048),
            label: label.slice(0, 40),
          },
        },
      ],
    ],
  });
}

async function buildVkNotificationDelivery(
  payload: HistoryNewNotificationPayload,
  options?: { userId?: string },
): Promise<{
  message: string;
  keyboard: string | null;
}> {
  const templates = options?.userId
    ? await resolveNotificationTemplatesForUser(options.userId)
    : await getNotificationMessageTemplates();
  const rendered = renderNotificationTemplate(templates.vkMessage, payload);
  const { caption, linkButtonLabel } = prepareTelegramNotificationCaption(rendered);

  const keyboard = isTelegramInlineButtonUrl(payload.pageUrl)
    ? buildVkWatchPageKeyboard(payload.pageUrl, linkButtonLabel)
    : null;

  const message =
    keyboard == null && payload.pageUrl ? `${caption}\n${payload.pageUrl}` : caption;

  return { message, keyboard };
}

function buildPlainVkNotificationMessage(payload: HistoryNewNotificationPayload): string {
  const episodeLabel = buildEpisodeLabel(payload.seasonNumber, payload.episodeNumber);
  return `Новая серия: ${payload.animeTitle}\n${episodeLabel} · ${payload.translationName}`;
}

async function uploadVkMessagePhoto(
  token: string,
  peerId: string,
  cover: { buffer: Buffer; contentType: string },
): Promise<string | null> {
  const uploadServer = await vkApiRequest<{ upload_url?: string }>(
    "photos.getMessagesUploadServer",
    token,
    { peer_id: peerId },
  );
  if (!uploadServer.ok || !uploadServer.response.upload_url) {
    if (!uploadServer.ok) {
      console.warn("[notifications] vk photo upload skipped:", uploadServer.error);
    }
    return null;
  }

  const extension = cover.contentType.includes("png")
    ? "png"
    : cover.contentType.includes("webp")
      ? "webp"
      : "jpg";

  const form = new FormData();
  form.append(
    "photo",
    new Blob([Uint8Array.from(cover.buffer)], { type: cover.contentType }),
    `cover.${extension}`,
  );

  let uploadJson: { server?: number; photo?: string; hash?: string };
  try {
    const uploadResponse = await fetch(uploadServer.response.upload_url, {
      method: "POST",
      body: form,
    });
    uploadJson = (await uploadResponse.json()) as typeof uploadJson;
  } catch {
    return null;
  }

  if (!uploadJson.photo || uploadJson.hash == null || uploadJson.server == null) return null;

  const saved = await vkApiRequest<Array<{ owner_id: number; id: number }>>(
    "photos.saveMessagesPhoto",
    token,
    {
      server: uploadJson.server,
      photo: uploadJson.photo,
      hash: uploadJson.hash,
    },
  );

  if (!saved.ok || !saved.response?.[0]) return null;
  const photo = saved.response[0];
  return `photo${photo.owner_id}_${photo.id}`;
}

function appendUrlIfMissing(message: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed || message.includes(trimmed)) return message;
  return `${message}\n${trimmed}`;
}

function isVkChatBotFeatureError(error: string | undefined): boolean {
  return Boolean(error && /chat bot feature|912/.test(error));
}

async function sendVkMessage(input: {
  token: string;
  peerId: string;
  message: string;
  keyboard: string | null;
  attachment?: string | null;
  linkUrl?: string | null;
}): Promise<VkSendResult> {
  const randomId = Math.floor(Math.random() * 2_000_000_000);

  const deliver = async (message: string, keyboard: string | null): Promise<VkSendResult> => {
    const result = await vkApiRequest<{ peer_id?: number }>("messages.send", input.token, {
      peer_id: input.peerId,
      random_id: randomId,
      message,
      attachment: input.attachment ?? undefined,
      keyboard: keyboard ?? undefined,
      dont_parse_links: 0,
    });

    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  const first = await deliver(input.message, input.keyboard);
  if (first.ok || !input.keyboard || !isVkChatBotFeatureError(first.error)) {
    return first;
  }

  const linkUrl = input.linkUrl?.trim();
  const fallbackMessage =
    linkUrl && !input.message.includes(linkUrl) ? `${input.message}\n${linkUrl}` : input.message;

  return deliver(fallbackMessage, null);
}

export async function sendVkNotification(
  vkUserId: string,
  payload: HistoryNewNotificationPayload,
  options?: { userId?: string },
): Promise<VkSendResult> {
  const config = await getNotificationRuntimeConfig();
  const token = config.vkBotToken;
  if (!token) return { ok: false, error: "токен сообщества не настроен" };

  const peerId = vkUserId.trim();
  if (!peerId) return { ok: false, error: "пустой vk user id" };

  const { message, keyboard } = await buildVkNotificationDelivery(payload, options);
  let lastError: string | undefined;

  const cover = await fetchNotificationCoverBuffer(payload);
  if (cover) {
    const attachment = await uploadVkMessagePhoto(token, peerId, cover);
    if (attachment) {
      const sentWithPhoto = await sendVkMessage({
        token,
        peerId,
        message,
        keyboard,
        attachment,
        linkUrl: payload.pageUrl,
      });
      if (sentWithPhoto.ok) return sentWithPhoto;
      lastError = sentWithPhoto.error;
    }
  }

  const posterUrl = resolveNotificationPosterUrl(payload);
  const messageWithPreview = posterUrl.startsWith("http")
    ? appendUrlIfMissing(message, posterUrl)
    : message;

  if (posterUrl.startsWith("http")) {
    const sentWithLink = await sendVkMessage({
      token,
      peerId,
      message: messageWithPreview,
      keyboard,
      linkUrl: payload.pageUrl,
    });
    if (sentWithLink.ok) return sentWithLink;
    lastError = sentWithLink.error;
  }

  const sentAsText = await sendVkMessage({
    token,
    peerId,
    message: messageWithPreview,
    keyboard,
    linkUrl: payload.pageUrl,
  });
  if (sentAsText.ok) return sentAsText;
  lastError = sentAsText.error;

  const plainText = buildPlainVkNotificationMessage(payload);
  const plainMessage =
    keyboard == null && payload.pageUrl ? `${plainText}\n${payload.pageUrl}` : plainText;
  const sentPlain = await sendVkMessage({
    token,
    peerId,
    message: plainMessage,
    keyboard,
    linkUrl: payload.pageUrl,
  });

  return sentPlain.ok ? sentPlain : { ok: false, error: sentPlain.error ?? lastError };
}
