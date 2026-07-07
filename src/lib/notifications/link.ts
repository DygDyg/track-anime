import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getDiscordOAuthStateSecret } from "@/lib/notifications/discord-oauth";

const LINK_TOKEN_TTL_MS = 30 * 60 * 1000;

export function createLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function issueTelegramLinkToken(userId: string): Promise<string> {
  return issueChannelLinkToken(userId);
}

export async function issueVkLinkToken(userId: string): Promise<string> {
  return issueChannelLinkToken(userId);
}

async function issueChannelLinkToken(userId: string): Promise<string> {
  const token = createLinkToken();
  const linkTokenExpiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);

  await prisma.userNotificationLink.upsert({
    where: { userId },
    create: {
      userId,
      linkToken: token,
      linkTokenExpiresAt,
    },
    update: {
      linkToken: token,
      linkTokenExpiresAt,
    },
  });

  return token;
}

export async function consumeTelegramLinkToken(
  token: string,
  telegramChatId: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, reason: "empty_token" };
  }

  const link = await prisma.userNotificationLink.findFirst({
    where: { linkToken: trimmedToken },
    select: {
      userId: true,
      linkTokenExpiresAt: true,
      telegramChatId: true,
    },
  });

  if (!link) {
    return { ok: false, reason: "invalid_token" };
  }

  if (!link.linkTokenExpiresAt || link.linkTokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired_token" };
  }

  const existingChat = await prisma.userNotificationLink.findUnique({
    where: { telegramChatId },
    select: { userId: true },
  });

  if (existingChat && existingChat.userId !== link.userId) {
    return { ok: false, reason: "chat_already_linked" };
  }

  await prisma.userNotificationLink.update({
    where: { userId: link.userId },
    data: {
      telegramChatId,
      linkToken: null,
      linkTokenExpiresAt: null,
    },
  });

  return { ok: true, userId: link.userId };
}

export async function consumeVkLinkToken(
  token: string,
  vkUserId: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, reason: "empty_token" };
  }

  const link = await prisma.userNotificationLink.findFirst({
    where: { linkToken: trimmedToken },
    select: {
      userId: true,
      linkTokenExpiresAt: true,
      vkUserId: true,
    },
  });

  if (!link) {
    return { ok: false, reason: "invalid_token" };
  }

  if (!link.linkTokenExpiresAt || link.linkTokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired_token" };
  }

  const existingUser = await prisma.userNotificationLink.findUnique({
    where: { vkUserId },
    select: { userId: true },
  });

  if (existingUser && existingUser.userId !== link.userId) {
    return { ok: false, reason: "user_already_linked" };
  }

  await prisma.userNotificationLink.update({
    where: { userId: link.userId },
    data: {
      vkUserId,
      linkToken: null,
      linkTokenExpiresAt: null,
    },
  });

  return { ok: true, userId: link.userId };
}

export async function unlinkVk(userId: string): Promise<void> {
  await prisma.userNotificationLink.upsert({
    where: { userId },
    create: { userId, vkUserId: null },
    update: { vkUserId: null },
  });
  await prisma.userNotificationPreferences.updateMany({
    where: { userId },
    data: { vkEnabled: false },
  });
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await prisma.userNotificationLink.upsert({
    where: { userId },
    create: { userId, telegramChatId: null },
    update: { telegramChatId: null },
  });
  await prisma.userNotificationPreferences.updateMany({
    where: { userId },
    data: { telegramEnabled: false },
  });
}

export async function linkDiscordUser(userId: string, discordUserId: string): Promise<void> {
  const existing = await prisma.userNotificationLink.findUnique({
    where: { discordUserId },
    select: { userId: true },
  });

  if (existing && existing.userId !== userId) {
    throw new Error("discord_already_linked");
  }

  await prisma.userNotificationLink.upsert({
    where: { userId },
    create: { userId, discordUserId, discordDmVerified: false },
    update: { discordUserId, discordDmVerified: false },
  });
}

export async function unlinkDiscord(userId: string): Promise<void> {
  await prisma.userNotificationLink.upsert({
    where: { userId },
    create: { userId, discordUserId: null, discordDmVerified: false },
    update: { discordUserId: null, discordDmVerified: false },
  });
  await prisma.userNotificationPreferences.updateMany({
    where: { userId },
    data: { discordEnabled: false },
  });
}

export async function createDiscordOAuthState(userId: string): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${userId}:${nonce}`;
  const secret = await getDiscordOAuthStateSecret();
  const sig = createHash("sha256").update(`${payload}:${secret}`).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export async function verifyDiscordOAuthState(state: string): Promise<string | null> {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon <= 0) return null;

    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const secret = await getDiscordOAuthStateSecret();
    const expected = createHash("sha256").update(`${payload}:${secret}`).digest("hex").slice(0, 16);

    if (sig !== expected) return null;

    const userId = payload.split(":")[0];
    return userId || null;
  } catch {
    return null;
  }
}
