import { prisma } from "@/lib/prisma";
import { verifyDiscordBotApplicationId } from "@/lib/notifications/discord-oauth";
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  normalizeNotificationTemplates,
  type NotificationMessageTemplates,
} from "@/lib/notifications/templates";

export const NOTIFICATION_SETTINGS_ID = "default";

export type NotificationSettingsDto = {
  telegramBotTokenSet: boolean;
  telegramBotUsername: string | null;
  vkBotTokenSet: boolean;
  vkGroupId: string | null;
  vkGroupScreenName: string | null;
  vapidPublicKeySet: boolean;
  vapidPublicKeyPreview: string | null;
  vapidPrivateKeySet: boolean;
  vapidSubject: string | null;
  discordNotificationClientId: string | null;
  discordNotificationClientSecretSet: boolean;
  discordNotificationBotTokenSet: boolean;
  discordNotificationGuildId: string | null;
  discordNotificationInviteUrl: string | null;
  discordNotificationBotInviteUrl: string | null;
  discordBotApplicationMatch: boolean | null;
  telegramConfigured: boolean;
  vkConfigured: boolean;
  discordConfigured: boolean;
  webPushConfigured: boolean;
  messageTemplates: NotificationMessageTemplates;
  updatedAt: string;
  envFallback: {
    telegram: boolean;
    vk: boolean;
    discord: boolean;
    vapid: boolean;
  };
};

export type NotificationSettingsSecrets = {
  telegramBotToken: string | null;
  telegramBotUsername: string | null;
  vkBotToken: string | null;
  vkGroupId: string | null;
  vkGroupScreenName: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string | null;
  discordNotificationClientId: string | null;
  discordNotificationClientSecret: string | null;
  discordNotificationBotToken: string | null;
  discordNotificationGuildId: string | null;
  discordNotificationInviteUrl: string | null;
  discordNotificationBotInviteUrl: string | null;
  messageTemplates: NotificationMessageTemplates;
};

let cachedSecrets: { value: NotificationSettingsSecrets; at: number } | null = null;
const CACHE_MS = 30_000;

function hasNotificationSettingsModel(): boolean {
  const delegate = (prisma as { notificationSettings?: { upsert?: unknown } }).notificationSettings;
  return typeof delegate?.upsert === "function";
}

export function invalidateNotificationSettingsCache(): void {
  cachedSecrets = null;
}

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Токен из @BotFather: `123456789:AAH...` */
export function isValidTelegramBotToken(value: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

/** Ключ доступа сообщества VK */
export function isValidVkBotToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 20;
}

function normalizeVkGroupId(value: string): string {
  return value.trim().replace(/^-/, "");
}

export function isValidVkGroupId(value: string): boolean {
  return /^\d{5,}$/.test(normalizeVkGroupId(value));
}

function readEnvSecrets(): NotificationSettingsSecrets {
  return {
    telegramBotToken: trimOrNull(process.env.TELEGRAM_BOT_TOKEN),
    telegramBotUsername: trimOrNull(process.env.TELEGRAM_BOT_USERNAME),
    vkBotToken: trimOrNull(process.env.VK_BOT_TOKEN),
    vkGroupId: trimOrNull(process.env.VK_GROUP_ID),
    vkGroupScreenName: trimOrNull(process.env.VK_GROUP_SCREEN_NAME),
    vapidPublicKey: trimOrNull(process.env.VAPID_PUBLIC_KEY),
    vapidPrivateKey: trimOrNull(process.env.VAPID_PRIVATE_KEY),
    vapidSubject: trimOrNull(process.env.VAPID_SUBJECT),
    discordNotificationClientId: trimOrNull(process.env.DISCORD_NOTIFICATION_CLIENT_ID),
    discordNotificationClientSecret: trimOrNull(process.env.DISCORD_NOTIFICATION_CLIENT_SECRET),
    discordNotificationBotToken: trimOrNull(process.env.DISCORD_NOTIFICATION_BOT_TOKEN),
    discordNotificationGuildId: trimOrNull(process.env.DISCORD_NOTIFICATION_GUILD_ID),
    discordNotificationInviteUrl: trimOrNull(process.env.DISCORD_NOTIFICATION_INVITE_URL),
    discordNotificationBotInviteUrl: trimOrNull(process.env.DISCORD_NOTIFICATION_BOT_INVITE_URL),
    messageTemplates: { ...DEFAULT_NOTIFICATION_TEMPLATES },
  };
}

function mergeSecrets(
  db: NotificationSettingsSecrets | null,
  env: NotificationSettingsSecrets,
): NotificationSettingsSecrets {
  return {
    telegramBotToken: db?.telegramBotToken ?? env.telegramBotToken,
    telegramBotUsername: db?.telegramBotUsername ?? env.telegramBotUsername,
    vkBotToken: db?.vkBotToken ?? env.vkBotToken,
    vkGroupId: db?.vkGroupId ?? env.vkGroupId,
    vkGroupScreenName: db?.vkGroupScreenName ?? env.vkGroupScreenName,
    vapidPublicKey: db?.vapidPublicKey ?? env.vapidPublicKey,
    vapidPrivateKey: db?.vapidPrivateKey ?? env.vapidPrivateKey,
    vapidSubject: db?.vapidSubject ?? env.vapidSubject ?? "mailto:admin@track-anime.local",
    discordNotificationClientId: db?.discordNotificationClientId ?? env.discordNotificationClientId,
    discordNotificationClientSecret:
      db?.discordNotificationClientSecret ?? env.discordNotificationClientSecret,
    discordNotificationBotToken:
      db?.discordNotificationBotToken ?? env.discordNotificationBotToken,
    discordNotificationGuildId: db?.discordNotificationGuildId ?? env.discordNotificationGuildId,
    discordNotificationInviteUrl:
      db?.discordNotificationInviteUrl ?? env.discordNotificationInviteUrl,
    discordNotificationBotInviteUrl:
      db?.discordNotificationBotInviteUrl ?? env.discordNotificationBotInviteUrl,
    messageTemplates: normalizeNotificationTemplates(
      db?.messageTemplates ?? env.messageTemplates,
    ),
  };
}

function previewKey(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return "••••";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export async function ensureNotificationSettings(): Promise<void> {
  if (!hasNotificationSettingsModel()) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await prisma.notificationSettings.upsert({
    where: { id: NOTIFICATION_SETTINGS_ID },
    create: { id: NOTIFICATION_SETTINGS_ID },
    update: {},
  });
}

async function readDbSecrets(): Promise<NotificationSettingsSecrets | null> {
  try {
    await ensureNotificationSettings();
    const row = await prisma.notificationSettings.findUnique({
      where: { id: NOTIFICATION_SETTINGS_ID },
    });
    if (!row) return null;

    return {
      telegramBotToken: row.telegramBotToken,
      telegramBotUsername: row.telegramBotUsername,
      vkBotToken: row.vkBotToken,
      vkGroupId: row.vkGroupId,
      vkGroupScreenName: row.vkGroupScreenName,
      vapidPublicKey: row.vapidPublicKey,
      vapidPrivateKey: row.vapidPrivateKey,
      vapidSubject: row.vapidSubject,
      discordNotificationClientId: row.discordNotificationClientId,
      discordNotificationClientSecret: row.discordNotificationClientSecret,
      discordNotificationBotToken: row.discordNotificationBotToken,
      discordNotificationGuildId: row.discordNotificationGuildId,
      discordNotificationInviteUrl: row.discordNotificationInviteUrl,
      discordNotificationBotInviteUrl: row.discordNotificationBotInviteUrl,
      messageTemplates: normalizeNotificationTemplates({
        discordTitle: row.discordTitleTemplate ?? undefined,
        discordDescription: row.discordDescriptionTemplate ?? undefined,
        telegramMessage: row.telegramMessageTemplate ?? undefined,
        vkMessage: row.vkMessageTemplate ?? undefined,
      }),
    };
  } catch {
    return null;
  }
}

export async function getNotificationSettingsSecrets(): Promise<NotificationSettingsSecrets> {
  if (cachedSecrets && Date.now() - cachedSecrets.at < CACHE_MS) {
    return cachedSecrets.value;
  }

  const env = readEnvSecrets();
  const db = await readDbSecrets();
  const merged = mergeSecrets(db, env);
  cachedSecrets = { value: merged, at: Date.now() };
  return merged;
}

export async function getNotificationMessageTemplates(): Promise<NotificationMessageTemplates> {
  const secrets = await getNotificationSettingsSecrets();
  return secrets.messageTemplates;
}

export { DEFAULT_NOTIFICATION_TEMPLATES };

export async function getNotificationSettingsDto(): Promise<NotificationSettingsDto> {
  const env = readEnvSecrets();
  const db = await readDbSecrets();
  const merged = mergeSecrets(db, env);

  let updatedAt = new Date(0).toISOString();
  try {
    const row = await prisma.notificationSettings.findUnique({
      where: { id: NOTIFICATION_SETTINGS_ID },
      select: { updatedAt: true },
    });
    if (row) updatedAt = row.updatedAt.toISOString();
  } catch {
    /* ignore */
  }

  const botAppCheck = merged.discordNotificationBotToken
    ? await verifyDiscordBotApplicationId()
    : null;

  return {
    telegramBotTokenSet: Boolean(merged.telegramBotToken),
    telegramBotUsername: merged.telegramBotUsername,
    vkBotTokenSet: Boolean(merged.vkBotToken),
    vkGroupId: merged.vkGroupId,
    vkGroupScreenName: merged.vkGroupScreenName,
    vapidPublicKeySet: Boolean(merged.vapidPublicKey),
    vapidPublicKeyPreview: previewKey(merged.vapidPublicKey),
    vapidPrivateKeySet: Boolean(merged.vapidPrivateKey),
    vapidSubject: merged.vapidSubject,
    discordNotificationClientId: merged.discordNotificationClientId,
    discordNotificationClientSecretSet: Boolean(merged.discordNotificationClientSecret),
    discordNotificationBotTokenSet: Boolean(merged.discordNotificationBotToken),
    discordNotificationGuildId: merged.discordNotificationGuildId,
    discordNotificationInviteUrl: merged.discordNotificationInviteUrl,
    discordNotificationBotInviteUrl: merged.discordNotificationBotInviteUrl,
    discordBotApplicationMatch: botAppCheck ? botAppCheck.ok : null,
    telegramConfigured: Boolean(
      merged.telegramBotToken && isValidTelegramBotToken(merged.telegramBotToken),
    ),
    vkConfigured: Boolean(
      merged.vkBotToken &&
        isValidVkBotToken(merged.vkBotToken) &&
        merged.vkGroupId &&
        isValidVkGroupId(merged.vkGroupId),
    ),
    discordConfigured: Boolean(
      merged.discordNotificationClientId &&
        merged.discordNotificationClientSecret &&
        merged.discordNotificationBotToken,
    ),
    webPushConfigured: Boolean(merged.vapidPublicKey && merged.vapidPrivateKey),
    messageTemplates: merged.messageTemplates,
    updatedAt,
    envFallback: {
      telegram: Boolean(!db?.telegramBotToken && env.telegramBotToken),
      vk: Boolean(!db?.vkBotToken && env.vkBotToken),
      discord: Boolean(
        !db?.discordNotificationBotToken &&
          env.discordNotificationBotToken &&
          env.discordNotificationClientId &&
          env.discordNotificationClientSecret,
      ),
      vapid: Boolean(!db?.vapidPrivateKey && env.vapidPrivateKey),
    },
  };
}

type SecretPatch = string | null | undefined;

export async function updateNotificationSettings(input: {
  telegramBotToken?: SecretPatch;
  telegramBotUsername?: SecretPatch;
  vkBotToken?: SecretPatch;
  vkGroupId?: SecretPatch;
  vkGroupScreenName?: SecretPatch;
  vapidPublicKey?: SecretPatch;
  vapidPrivateKey?: SecretPatch;
  vapidSubject?: SecretPatch;
  discordNotificationClientId?: SecretPatch;
  discordNotificationClientSecret?: SecretPatch;
  discordNotificationBotToken?: SecretPatch;
  discordNotificationGuildId?: SecretPatch;
  discordNotificationInviteUrl?: SecretPatch;
  discordNotificationBotInviteUrl?: SecretPatch;
  messageTemplates?: Partial<NotificationMessageTemplates>;
}): Promise<NotificationSettingsDto> {
  await ensureNotificationSettings();

  const data: Record<string, string | null> = {};

  const apply = (key: keyof typeof input, field: string) => {
    if (input[key] === undefined) return;
    data[field] = trimOrNull(input[key]);
  };

  apply("telegramBotToken", "telegramBotToken");
  apply("telegramBotUsername", "telegramBotUsername");
  apply("vkBotToken", "vkBotToken");
  apply("vkGroupId", "vkGroupId");
  apply("vkGroupScreenName", "vkGroupScreenName");
  apply("vapidPublicKey", "vapidPublicKey");
  apply("vapidPrivateKey", "vapidPrivateKey");
  apply("vapidSubject", "vapidSubject");
  apply("discordNotificationClientId", "discordNotificationClientId");
  apply("discordNotificationClientSecret", "discordNotificationClientSecret");
  apply("discordNotificationBotToken", "discordNotificationBotToken");
  apply("discordNotificationGuildId", "discordNotificationGuildId");
  apply("discordNotificationInviteUrl", "discordNotificationInviteUrl");
  apply("discordNotificationBotInviteUrl", "discordNotificationBotInviteUrl");

  if (input.messageTemplates) {
    const templates = normalizeNotificationTemplates(input.messageTemplates);
    data.discordTitleTemplate = templates.discordTitle;
    data.discordDescriptionTemplate = templates.discordDescription;
    data.telegramMessageTemplate = templates.telegramMessage;
    data.vkMessageTemplate = templates.vkMessage;
  }

  if (data.telegramBotToken && !isValidTelegramBotToken(data.telegramBotToken)) {
    throw new Error(
      "Некорректный Telegram Bot Token. Скопируйте токен из @BotFather (формат 123456789:AAH...), не ссылку и не URL.",
    );
  }

  if (data.vkBotToken && !isValidVkBotToken(data.vkBotToken)) {
    throw new Error("Некорректный VK Bot Token. Скопируйте ключ доступа сообщества из настроек VK.");
  }

  if (data.vkGroupId && !isValidVkGroupId(data.vkGroupId)) {
    throw new Error("Некорректный VK Group ID. Укажите числовой ID сообщества без минуса.");
  }

  if (Object.keys(data).length > 0) {
    await prisma.notificationSettings.update({
      where: { id: NOTIFICATION_SETTINGS_ID },
      data,
    });
  }

  invalidateNotificationSettingsCache();
  return getNotificationSettingsDto();
}
