import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addShikimoriFriend,
  fetchViewerFriendStatus,
  isFriendMutationAuthError,
  isFriendScopeError,
  removeShikimoriFriend,
} from "@/lib/shikimori/friend-mutations";
import {
  normalizeProfileFriendStatus,
  type ProfileFriendStatus,
} from "@/lib/profile-friend-status";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parseTargetId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function friendPayload(status: ProfileFriendStatus, notice?: string | null) {
  return { status, notice: notice ?? null };
}

async function readStatus(
  viewerUserId: string,
  targetShikimoriId: number,
  viewingSelf: boolean,
): Promise<ProfileFriendStatus> {
  if (viewingSelf) return "self";
  const raw = await fetchViewerFriendStatus(viewerUserId, targetShikimoriId);
  return normalizeProfileFriendStatus(raw);
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

  const viewingSelf = session.user.shikimoriId === targetShikimoriId;

  try {
    const status = await readStatus(session.user.id, targetShikimoriId, viewingSelf);
    return NextResponse.json(friendPayload(status));
  } catch (error) {
    if (isFriendMutationAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Не удалось загрузить статус";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const result = await addShikimoriFriend(session.user.id, targetShikimoriId);
    const status = await readStatus(session.user.id, targetShikimoriId, false);
    return NextResponse.json(friendPayload(status, result?.notice));
  } catch (error) {
    if (isFriendMutationAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (isFriendScopeError(error)) {
      return NextResponse.json(
        {
          error:
            "Нет доступа к друзьям Shikimori — выйдите и войдите снова, чтобы обновить разрешения OAuth",
        },
        { status: 403 },
      );
    }
    const message = error instanceof Error ? error.message : "Не удалось добавить в друзья";
    return NextResponse.json({ error: message }, { status: 500 });
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

  try {
    const result = await removeShikimoriFriend(session.user.id, targetShikimoriId);
    const status = await readStatus(session.user.id, targetShikimoriId, false);
    return NextResponse.json(friendPayload(status, result?.notice));
  } catch (error) {
    if (isFriendMutationAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (isFriendScopeError(error)) {
      return NextResponse.json(
        {
          error:
            "Нет доступа к друзьям Shikimori — выйдите и войдите снова, чтобы обновить разрешения OAuth",
        },
        { status: 403 },
      );
    }
    const message = error instanceof Error ? error.message : "Не удалось удалить из друзей";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
