import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  buildDiscordOAuthUrl,
  isDiscordNotificationConfigured,
} from "@/lib/notifications/discord-oauth";
import { createDiscordOAuthState } from "@/lib/notifications/link";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  if (!(await isDiscordNotificationConfigured())) {
    return NextResponse.json({ error: "Discord-бот не настроен на сервере" }, { status: 503 });
  }

  const state = await createDiscordOAuthState(session.user.id);
  const url = await buildDiscordOAuthUrl(state);
  if (!url) {
    return NextResponse.json({ error: "Не удалось собрать OAuth URL" }, { status: 500 });
  }

  return NextResponse.json({ url });
}
