import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { unlinkDiscord } from "@/lib/notifications/link";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  await unlinkDiscord(session.user.id);
  return NextResponse.json({ ok: true });
}
