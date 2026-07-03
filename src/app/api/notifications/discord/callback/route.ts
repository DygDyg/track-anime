import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import {
  addDiscordUserToNotificationGuild,
  exchangeDiscordOAuthCode,
  sendDiscordWelcomeMessage,
} from "@/lib/notifications/discord-oauth";
import { markDiscordDmVerified } from "@/lib/notifications/discord-verify";
import { linkDiscordUser, verifyDiscordOAuthState } from "@/lib/notifications/link";
import { getNotificationRuntimeConfig } from "@/lib/notifications/runtime-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function settingsRedirect(baseUrl: string, params: Record<string, string>) {
  const url = new URL("/", baseUrl);
  url.searchParams.set("settings", "notifications");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const baseUrl = getRequestOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return settingsRedirect(baseUrl, { discord: "error", reason: oauthError });
  }

  if (!code || !state) {
    return settingsRedirect(baseUrl, { discord: "error", reason: "missing_params" });
  }

  const userId = await verifyDiscordOAuthState(state);
  if (!userId) {
    return settingsRedirect(baseUrl, { discord: "error", reason: "invalid_state" });
  }

  const discordUser = await exchangeDiscordOAuthCode(code);
  if (!discordUser) {
    return settingsRedirect(baseUrl, { discord: "error", reason: "token_exchange_failed" });
  }

  try {
    await linkDiscordUser(userId, discordUser.id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "link_failed";
    return settingsRedirect(baseUrl, { discord: "error", reason });
  }

  const config = await getNotificationRuntimeConfig();
  if (config.discordNotificationGuildId) {
    await addDiscordUserToNotificationGuild(discordUser.id, discordUser.accessToken);
  }

  const welcome = await sendDiscordWelcomeMessage(discordUser.id);
  await markDiscordDmVerified(userId, welcome.ok);

  if (welcome.ok) {
    await prisma.userNotificationPreferences.upsert({
      where: { userId },
      create: { userId, discordEnabled: true },
      update: { discordEnabled: true },
    });
    return settingsRedirect(baseUrl, { discord: "linked" });
  }

  return settingsRedirect(baseUrl, { discord: "linked", dm: "pending" });
}
