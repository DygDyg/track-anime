import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
} from "@/lib/notifications/preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const preferences = await getUserNotificationPreferences(session.user.id);
  return NextResponse.json({ preferences });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const preferences = await saveUserNotificationPreferences(session.user.id, {
    ...(typeof raw.historyNewEnabled === "boolean"
      ? { historyNewEnabled: raw.historyNewEnabled }
      : {}),
    ...(typeof raw.telegramEnabled === "boolean"
      ? { telegramEnabled: raw.telegramEnabled }
      : {}),
    ...(typeof raw.vkEnabled === "boolean" ? { vkEnabled: raw.vkEnabled } : {}),
    ...(typeof raw.discordEnabled === "boolean" ? { discordEnabled: raw.discordEnabled } : {}),
  });

  return NextResponse.json({ preferences });
}
