import { NextRequest, NextResponse } from "next/server";
import { getSession, isSecureRequest } from "@/lib/auth/session";
import { analyticsConfig, visitorCookieOptions } from "@/lib/analytics/config";
import { trackAnimePlay } from "@/lib/analytics/track";
import { parseAnalyticsPlayerKind } from "@/lib/analytics/ua";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlayBody = {
  shikimoriId?: unknown;
  player?: unknown;
  isPwa?: unknown;
  isTv?: unknown;
  model?: unknown;
  mobile?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as PlayBody | null;
  const shikimoriId = Number(body?.shikimoriId);
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) {
    return NextResponse.json({ error: "Invalid shikimoriId" }, { status: 400 });
  }

  const session = await getSession();
  const existingKey = request.cookies.get(analyticsConfig.visitorCookie)?.value ?? null;
  const result = await trackAnimePlay({
    visitorKey: existingKey,
    userId: session?.user.id ?? null,
    shikimoriId,
    player: parseAnalyticsPlayerKind(body?.player) ?? "kodik",
    userAgent: request.headers.get("user-agent"),
    clientHints: {
      isPwa: body?.isPwa === true,
      isTv: body?.isTv === true,
      model: typeof body?.model === "string" ? body.model.slice(0, 80) : undefined,
      mobile: body?.mobile === true,
    },
  });

  const response = NextResponse.json({
    ok: true,
    tracked: result.tracked,
    throttled: result.throttled,
  });

  if (!existingKey || existingKey !== result.visitorKey) {
    response.cookies.set(visitorCookieOptions(result.visitorKey, isSecureRequest(request)));
  }

  return response;
}
