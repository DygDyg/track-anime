import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { removeSiteFriendIncoming } from "@/lib/site-friends";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parseTargetId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const fromShikimoriId = parseTargetId(raw);
  if (!fromShikimoriId) {
    return NextResponse.json({ error: "Некорректный ID пользователя" }, { status: 400 });
  }

  await removeSiteFriendIncoming(session.user.id, fromShikimoriId);
  return NextResponse.json({ ok: true });
}
