import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import {
  getNotificationSettingsDto,
  invalidateNotificationSettingsCache,
  updateNotificationSettings,
} from "@/lib/admin/notification-settings";
import { invalidateDiscordInviteUrlCache } from "@/lib/notifications/discord-oauth";
import { resetVapidClientCache } from "@/lib/notifications/channels/browser";

export const dynamic = "force-dynamic";

const SECRET_FIELDS = [
  "telegramBotToken",
  "vkBotToken",
  "vapidPublicKey",
  "vapidPrivateKey",
  "discordNotificationClientSecret",
  "discordNotificationBotToken",
] as const;

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getNotificationSettingsDto();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const patch: Parameters<typeof updateNotificationSettings>[0] = {};

  const stringFields = [
    "telegramBotToken",
    "telegramBotUsername",
    "vkBotToken",
    "vkGroupId",
    "vkGroupScreenName",
    "vapidPublicKey",
    "vapidPrivateKey",
    "vapidSubject",
    "discordNotificationClientId",
    "discordNotificationClientSecret",
    "discordNotificationBotToken",
    "discordNotificationGuildId",
    "discordNotificationInviteUrl",
    "discordNotificationBotInviteUrl",
  ] as const;

  for (const field of stringFields) {
    if (!(field in record)) continue;
    const value = record[field];
    if (value === null) {
      patch[field] = null;
    } else if (typeof value === "string") {
      if (SECRET_FIELDS.includes(field as (typeof SECRET_FIELDS)[number]) && value.trim() === "") {
        continue;
      }
      patch[field] = value;
    }
  }

  if ("messageTemplates" in record && record.messageTemplates && typeof record.messageTemplates === "object") {
    const templates = record.messageTemplates as Record<string, unknown>;
    patch.messageTemplates = {
      discordTitle: typeof templates.discordTitle === "string" ? templates.discordTitle : undefined,
      discordDescription:
        typeof templates.discordDescription === "string" ? templates.discordDescription : undefined,
      telegramMessage:
        typeof templates.telegramMessage === "string" ? templates.telegramMessage : undefined,
      vkMessage: typeof templates.vkMessage === "string" ? templates.vkMessage : undefined,
    };
  }

  try {
    const settings = await updateNotificationSettings(patch);
    invalidateNotificationSettingsCache();
    invalidateDiscordInviteUrlCache();
    resetVapidClientCache();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
