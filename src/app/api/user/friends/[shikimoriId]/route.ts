import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addSiteFriend,
  getLocalFriendStatus,
  removeSiteFriend,
} from "@/lib/site-friends";
import type { ProfileFriendStatus } from "@/lib/profile-friend-status";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parseTargetId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function friendPayload(status: ProfileFriendStatus) {
  return { status };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const targetShikimoriId = parseTargetId(raw);
  if (!targetShikimoriId) {
    return NextResponse.json({ error: "Некорректный ID пользователя" }, { status: 400 });
  }

  const status = await getLocalFriendStatus(
    session.user.id,
    targetShikimoriId,
    session.user.shikimoriId,
  );

  return NextResponse.json(friendPayload(status));
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const targetShikimoriId = parseTargetId(raw);
  if (!targetShikimoriId) {
    return NextResponse.json({ error: "Некорректный ID пользователя" }, { status: 400 });
  }

  if (session.user.shikimoriId === targetShikimoriId) {
    return NextResponse.json({ error: "Нельзя добавить себя в друзья" }, { status: 400 });
  }

  try {
    const result = await addSiteFriend(session.user.id, targetShikimoriId);
    return NextResponse.json(friendPayload(result.status));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось добавить в друзья";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const targetShikimoriId = parseTargetId(raw);
  if (!targetShikimoriId) {
    return NextResponse.json({ error: "Некорректный ID пользователя" }, { status: 400 });
  }

  if (session.user.shikimoriId === targetShikimoriId) {
    return NextResponse.json({ error: "Нельзя удалить себя из друзей" }, { status: 400 });
  }

  const result = await removeSiteFriend(session.user.id, targetShikimoriId);
  return NextResponse.json(friendPayload(result.status));
}
