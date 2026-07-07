import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { buildVkDeepLink, isVkNotificationConfigured } from "@/lib/notifications/channels/vk";
import { issueVkLinkToken, unlinkVk } from "@/lib/notifications/link";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  if (!(await isVkNotificationConfigured())) {
    return NextResponse.json({ error: "VK-бот не настроен на сервере" }, { status: 503 });
  }

  const token = await issueVkLinkToken(session.user.id);
  const deepLink = await buildVkDeepLink(token);

  if (!deepLink) {
    return NextResponse.json({ error: "Не удалось построить ссылку VK" }, { status: 503 });
  }

  return NextResponse.json({
    token,
    deepLink,
    expiresInSec: 30 * 60,
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  await unlinkVk(session.user.id);
  return NextResponse.json({ ok: true });
}
