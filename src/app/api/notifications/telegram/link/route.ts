import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { issueTelegramLinkToken, unlinkTelegram } from "@/lib/notifications/link";
import { fetchTelegramBotUsername, isTelegramNotificationConfigured } from "@/lib/notifications/channels/telegram";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  if (!(await isTelegramNotificationConfigured())) {
    return NextResponse.json({ error: "Telegram-бот не настроен на сервере" }, { status: 503 });
  }

  const token = await issueTelegramLinkToken(session.user.id);
  const username = (await fetchTelegramBotUsername()) ?? "bot";
  const deepLink = `https://t.me/${username}?start=${encodeURIComponent(token)}`;

  return NextResponse.json({
    token,
    botUsername: username,
    deepLink,
    expiresInSec: 30 * 60,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  await unlinkTelegram(session.user.id);
  return NextResponse.json({ ok: true });
}
