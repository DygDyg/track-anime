import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getRecentAnimeOpens,
  recordRecentAnimeOpen,
  syncRecentAnimeOpens,
} from "@/lib/recent-anime-opens-server";
import { isRecentAnimeOpenEntry, type RecentAnimeOpenEntry } from "@/lib/recent-anime-opens";

export const dynamic = "force-dynamic";

function parseItems(raw: unknown): RecentAnimeOpenEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecentAnimeOpenEntry);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  const items = await getRecentAnimeOpens(session.user.id);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let body: { shikimoriId?: number; title?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const shikimoriId = Number(body.shikimoriId);
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) {
    return NextResponse.json({ error: "Некорректный ID аниме" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Не указано название" }, { status: 400 });
  }

  try {
    const item = await recordRecentAnimeOpen(session.user.id, shikimoriId, title);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("[user/recent-anime-opens] record failed:", error);
    return NextResponse.json({ error: "Не удалось сохранить запись" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }

  let body: { items?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const items = parseItems(body.items);

  try {
    const merged = await syncRecentAnimeOpens(session.user.id, items);
    return NextResponse.json({ items: merged });
  } catch (error) {
    console.error("[user/recent-anime-opens] sync failed:", error);
    return NextResponse.json({ error: "Не удалось синхронизировать список" }, { status: 500 });
  }
}
