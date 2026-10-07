import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseAnimeWatchPlayerParam } from "@/lib/anime-watch-share";
import { recordAnimeWatchShareEvent } from "@/lib/analytics/watch-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShareBody = {
  shikimoriId?: unknown;
  animeTitle?: unknown;
  player?: unknown;
  seasonNumber?: unknown;
  episodeNumber?: unknown;
  translationId?: unknown;
  translationTitle?: unknown;
  positionSeconds?: unknown;
  nosave?: unknown;
  shareUrl?: unknown;
};

function asPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function asNonNegNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ShareBody | null;
  const shikimoriId = asPositiveInt(body?.shikimoriId);
  if (shikimoriId == null) {
    return NextResponse.json({ error: "Invalid shikimoriId" }, { status: 400 });
  }

  const seasonNumber = Number(body?.seasonNumber);
  const episodeNumber = Number(body?.episodeNumber);
  if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
    return NextResponse.json({ error: "Invalid season/episode" }, { status: 400 });
  }

  const session = await getSession();
  const player = parseAnimeWatchPlayerParam(
    typeof body?.player === "string" ? body.player : null,
  ) ?? "kodik";

  const translationIdRaw = body?.translationId;
  const translationId =
    translationIdRaw == null || translationIdRaw === ""
      ? null
      : asPositiveInt(translationIdRaw);

  const result = await recordAnimeWatchShareEvent({
    userId: session?.user.id ?? null,
    nickname: session?.user.nickname?.trim() || "Гость",
    avatar: session?.user.avatar ?? null,
    shikimoriId,
    animeTitle: typeof body?.animeTitle === "string" ? body.animeTitle : `Shikimori ${shikimoriId}`,
    player,
    seasonNumber,
    episodeNumber,
    translationId,
    translationTitle:
      typeof body?.translationTitle === "string" ? body.translationTitle : null,
    positionSeconds: asNonNegNumber(body?.positionSeconds),
    nosave: body?.nosave !== false,
    shareUrl: typeof body?.shareUrl === "string" ? body.shareUrl : null,
  });

  return NextResponse.json({ ok: true, id: result.id });
}
