import { getNotificationMessageTemplates } from "@/lib/admin/notification-settings";
import { resolveNotificationPosterUrl } from "@/lib/notifications/payload";
import {
  isDiscordNotificationConfigured,
  sendDiscordDirectMessage,
} from "@/lib/notifications/discord-oauth";
import { renderNotificationTemplate } from "@/lib/notifications/templates";
import type { HistoryNewNotificationPayload } from "@/lib/notifications/types";

export { isDiscordNotificationConfigured };

export async function sendDiscordNotification(
  discordUserId: string,
  payload: HistoryNewNotificationPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isDiscordNotificationConfigured())) {
    return { ok: false, error: "discord не настроен" };
  }

  const templates = await getNotificationMessageTemplates();
  const title = renderNotificationTemplate(templates.discordTitle, payload);
  const description = renderNotificationTemplate(templates.discordDescription, payload);
  const posterUrl = resolveNotificationPosterUrl(payload);

  const result = await sendDiscordDirectMessage(discordUserId, "", {
    title,
    description,
    url: payload.pageUrl,
    image: { url: posterUrl },
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
