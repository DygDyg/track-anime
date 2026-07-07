import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { DEFAULT_TEST_SHIKIMORI_ID, sendTestNotification } from "@/lib/notifications/send-test";
import type { NotificationChannelId } from "@/lib/notifications/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TEST_CHANNELS: NotificationChannelId[] = ["browser", "telegram", "vk", "discord"];

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const record = body && typeof body === "object" ? (body as { channels?: unknown }) : null;

  const prefs = await prisma.userNotificationPreferences.findUnique({
    where: { userId: session.user.id },
    select: {
      telegramEnabled: true,
      vkEnabled: true,
      discordEnabled: true,
    },
  });

  const enabledChannels = TEST_CHANNELS.filter((channel) => {
    if (channel === "browser") return true;
    if (channel === "telegram") return prefs?.telegramEnabled;
    if (channel === "vk") return prefs?.vkEnabled;
    if (channel === "discord") return prefs?.discordEnabled;
    return false;
  });

  const requestedChannels = Array.isArray(record?.channels)
    ? record.channels.filter(
        (item): item is NotificationChannelId =>
          typeof item === "string" && TEST_CHANNELS.includes(item as NotificationChannelId),
      )
    : enabledChannels;

  const channels = requestedChannels.filter((channel) => enabledChannels.includes(channel));

  if (channels.length === 0) {
    return NextResponse.json(
      { error: "Выберите хотя бы один включённый канал: браузер, Telegram, VK или Discord" },
      { status: 400 },
    );
  }

  const result = await sendTestNotification({
    userId: session.user.id,
    shikimoriId: DEFAULT_TEST_SHIKIMORI_ID,
    channels,
  });

  if (!result.payload) {
    return NextResponse.json(
      { error: "Не найден материал Kodik для тестового уведомления", results: result.results },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    payload: {
      animeTitle: result.payload.animeTitle,
      seasonNumber: result.payload.seasonNumber,
      episodeNumber: result.payload.episodeNumber,
      translationName: result.payload.translationName,
    },
    results: result.results,
  });
}
