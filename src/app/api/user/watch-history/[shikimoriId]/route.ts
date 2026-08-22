import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteWatchProgress, getWatchProgress, upsertWatchProgress } from "@/lib/watch-history";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ shikimoriId: string }>;
};

function parseShikimoriId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  const progress = await getWatchProgress(session.user.id, shikimoriId);
  return NextResponse.json({ progress });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  let body: {
    kodikId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    positionSeconds?: number;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  if (!body.kodikId?.trim()) {
    return NextResponse.json({ error: "Не указана озвучка" }, { status: 400 });
  }

  const seasonNumber = Number(body.seasonNumber ?? 1);
  const episodeNumber = Number(body.episodeNumber ?? 1);
  const positionSeconds = Number(body.positionSeconds ?? 0);

  if (!Number.isFinite(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json({ error: "Некорректный сезон" }, { status: 400 });
  }
  if (!Number.isFinite(episodeNumber) || episodeNumber < 0) {
    return NextResponse.json({ error: "Некорректная серия" }, { status: 400 });
  }
  if (episodeNumber === 0) {
    if (seasonNumber !== 1 || positionSeconds !== 0) {
      return NextResponse.json({ error: "Некорректная закладка в истории" }, { status: 400 });
    }
  } else if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return NextResponse.json({ error: "Некорректная позиция" }, { status: 400 });
  }

  try {
    const progress = await upsertWatchProgress(session.user.id, {
      shikimoriId,
      kodikId: body.kodikId.trim(),
      seasonNumber: Math.floor(seasonNumber),
      episodeNumber: Math.floor(episodeNumber),
      positionSeconds,
    });

    return NextResponse.json({ progress, cleared: progress === null });
  } catch (error) {
    console.error("[user/watch-history] upsert failed:", error);
    return NextResponse.json({ error: "Не удалось сохранить прогресс" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const { shikimoriId: raw } = await params;
  const shikimoriId = parseShikimoriId(raw);
  if (!shikimoriId) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }

  try {
    const deleted = await deleteWatchProgress(session.user.id, shikimoriId);
    if (!deleted) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[user/watch-history] delete failed:", error);
    return NextResponse.json({ error: "Не удалось удалить запись" }, { status: 500 });
  }
}
