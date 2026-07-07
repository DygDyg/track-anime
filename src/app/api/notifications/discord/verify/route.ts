import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyDiscordNotificationDm } from "@/lib/notifications/discord-verify";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const result = await verifyDiscordNotificationDm(session.user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
