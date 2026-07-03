const DISCORD_API = "https://discord.com/api/v10";

import { getNotificationRuntimeConfig } from "@/lib/notifications/runtime-config";
import { SITE_LOGO_PATH, SITE_NAME, versionedAsset } from "@/lib/site-brand";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/site-url";

export type DiscordApiError = {
  error: string;
  code?: number;
};

export type DiscordDmResult = { ok: true } | ({ ok: false } & DiscordApiError);

export async function isDiscordNotificationConfigured(): Promise<boolean> {
  const config = await getNotificationRuntimeConfig();
  return Boolean(
    config.discordNotificationClientId &&
      config.discordNotificationClientSecret &&
      config.discordNotificationBotToken,
  );
}

function getSiteOrigin(): string {
  return getSiteUrl().replace(/\/$/, "");
}

export function getDiscordNotificationRedirectUri(): string {
  return `${getSiteOrigin()}/api/notifications/discord/callback`;
}

function buildDiscordOAuthScope(guildId: string | null): string {
  return guildId ? "identify guilds.join" : "identify";
}

export async function buildDiscordOAuthUrl(state: string): Promise<string | null> {
  const config = await getNotificationRuntimeConfig();
  if (!config.discordNotificationClientId) return null;

  const params = new URLSearchParams({
    client_id: config.discordNotificationClientId,
    redirect_uri: getDiscordNotificationRedirectUri(),
    response_type: "code",
    scope: buildDiscordOAuthScope(config.discordNotificationGuildId),
    state,
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDiscordOAuthCode(
  code: string,
): Promise<{ id: string; accessToken: string } | null> {
  const config = await getNotificationRuntimeConfig();
  if (!config.discordNotificationClientId || !config.discordNotificationClientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: config.discordNotificationClientId,
    client_secret: config.discordNotificationClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: getDiscordNotificationRedirectUri(),
  });

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) return null;

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) return null;

  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) return null;

  const user = (await userRes.json()) as { id?: string };
  return user.id ? { id: user.id, accessToken: tokenData.access_token } : null;
}

async function discordBotFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = await getNotificationRuntimeConfig();
  if (!config.discordNotificationBotToken) {
    throw new Error("discord_bot_not_configured");
  }

  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${config.discordNotificationBotToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function readDiscordApiError(response: Response): Promise<DiscordApiError> {
  try {
    const data = (await response.json()) as { message?: string; code?: number };
    const code = typeof data.code === "number" ? data.code : undefined;
    const message = data.message?.trim() || `HTTP ${response.status}`;
    return { error: formatDiscordApiError(message, code), code };
  } catch {
    return { error: `HTTP ${response.status}` };
  }
}

export function formatDiscordApiError(message: string, code?: number): string {
  if (code === 50007 || code === 50278) {
    return "нет общего сервера с ботом или закрыты ЛС от участников сервера — перепривяжите Discord в настройках";
  }
  if (code === 50001) {
    return "у бота нет доступа (проверьте, что он на сервере уведомлений)";
  }
  if (code === 50010) {
    return "Bot Token не от этого OAuth-приложения (Client ID и токен бота должны быть из одного приложения)";
  }
  if (code === 50025) {
    return "неверный Bot Token";
  }
  if (code === 401 || code === 0) {
    if (message.toLowerCase().includes("unauthorized") || message === "HTTP 401") {
      return "неверный Bot Token";
    }
  }
  return code ? `${message} (${code})` : message;
}

export async function verifyDiscordBotApplicationId(): Promise<{
  ok: boolean;
  botApplicationId: string | null;
  clientId: string | null;
}> {
  const config = await getNotificationRuntimeConfig();
  const clientId = config.discordNotificationClientId;
  if (!config.discordNotificationBotToken || !clientId) {
    return { ok: false, botApplicationId: null, clientId: clientId ?? null };
  }

  try {
    const res = await discordBotFetch("/oauth2/applications/@me");
    if (!res.ok) {
      return { ok: false, botApplicationId: null, clientId };
    }
    const data = (await res.json()) as { id?: string };
    const botApplicationId = data.id ?? null;
    return { ok: botApplicationId === clientId, botApplicationId, clientId };
  } catch {
    return { ok: false, botApplicationId: null, clientId };
  }
}

export async function addDiscordUserToNotificationGuild(
  discordUserId: string,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await getNotificationRuntimeConfig();
  const guildId = config.discordNotificationGuildId;
  if (!guildId) {
    return { ok: false, error: "не задан Guild ID сервера уведомлений в админке" };
  }

  const res = await discordBotFetch(`/guilds/${guildId}/members/${discordUserId}`, {
    method: "PUT",
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (res.ok) return { ok: true };

  const apiError = await readDiscordApiError(res);
  console.error("[notifications] discord guild join failed", apiError);
  return { ok: false, error: apiError.error };
}

export async function sendDiscordDirectMessage(
  discordUserId: string,
  content: string,
  embed?: {
    title: string;
    description: string;
    url?: string;
    image?: { url: string };
    thumbnail?: { url: string };
  },
): Promise<DiscordDmResult> {
  const channelRes = await discordBotFetch("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    const apiError = await readDiscordApiError(channelRes);
    console.error("[notifications] discord dm channel failed", apiError);
    return { ok: false, ...apiError };
  }

  const channel = (await channelRes.json()) as { id?: string };
  if (!channel.id) {
    return { ok: false, error: "discord не вернул id канала" };
  }

  const messageRes = await discordBotFetch(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: content || undefined,
      embeds: embed ? [embed] : undefined,
    }),
  });

  if (!messageRes.ok) {
    const apiError = await readDiscordApiError(messageRes);
    console.error("[notifications] discord dm send failed", apiError);
    return { ok: false, ...apiError };
  }

  return { ok: true };
}

let cachedInviteUrl: { value: string | null; at: number } | null = null;
const INVITE_CACHE_MS = 5 * 60_000;

export async function sendDiscordWelcomeMessage(discordUserId: string): Promise<DiscordDmResult> {
  const siteUrl = getSiteUrl();
  const logoUrl = toAbsoluteUrl(versionedAsset(SITE_LOGO_PATH));

  return sendDiscordDirectMessage(discordUserId, "", {
    title: SITE_NAME,
    description:
      "Discord привязан. Здесь будут приходить уведомления о новых сериях из вашей истории просмотра.",
    url: siteUrl,
    thumbnail: logoUrl ? { url: logoUrl } : undefined,
  });
}

export async function resolveDiscordNotificationInviteUrl(): Promise<string | null> {
  if (cachedInviteUrl && Date.now() - cachedInviteUrl.at < INVITE_CACHE_MS) {
    return cachedInviteUrl.value;
  }

  const config = await getNotificationRuntimeConfig();
  const configured = config.discordNotificationInviteUrl?.trim();
  if (configured) {
    cachedInviteUrl = { value: configured, at: Date.now() };
    return configured;
  }

  const guildId = config.discordNotificationGuildId;
  if (!guildId) {
    cachedInviteUrl = { value: null, at: Date.now() };
    return null;
  }

  try {
    const invitesRes = await discordBotFetch(`/guilds/${guildId}/invites`);
    if (invitesRes.ok) {
      const invites = (await invitesRes.json()) as { code?: string }[];
      const existing = invites.find((item) => item.code)?.code;
      if (existing) {
        const url = `https://discord.gg/${existing}`;
        cachedInviteUrl = { value: url, at: Date.now() };
        return url;
      }
    }

    const channelsRes = await discordBotFetch(`/guilds/${guildId}/channels`);
    if (!channelsRes.ok) {
      cachedInviteUrl = { value: null, at: Date.now() };
      return null;
    }

    const channels = (await channelsRes.json()) as { id?: string; type?: number }[];
    const textChannel = channels.find((channel) => channel.type === 0 && channel.id);
    if (!textChannel?.id) {
      cachedInviteUrl = { value: null, at: Date.now() };
      return null;
    }

    const inviteRes = await discordBotFetch(`/channels/${textChannel.id}/invites`, {
      method: "POST",
      body: JSON.stringify({ max_age: 0, max_uses: 0 }),
    });

    if (!inviteRes.ok) {
      cachedInviteUrl = { value: null, at: Date.now() };
      return null;
    }

    const invite = (await inviteRes.json()) as { code?: string };
    const url = invite.code ? `https://discord.gg/${invite.code}` : null;
    cachedInviteUrl = { value: url, at: Date.now() };
    return url;
  } catch {
    cachedInviteUrl = { value: null, at: Date.now() };
    return null;
  }
}

export function invalidateDiscordInviteUrlCache(): void {
  cachedInviteUrl = null;
}

export async function getDiscordOAuthStateSecret(): Promise<string> {
  const config = await getNotificationRuntimeConfig();
  return config.discordNotificationClientSecret ?? "dev";
}
