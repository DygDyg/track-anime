import { NextRequest, NextResponse } from "next/server";
import { getSession, isSecureRequest } from "@/lib/auth/session";
import { analyticsConfig, visitorCookieOptions } from "@/lib/analytics/config";
import { trackPageView } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BeaconBody = {
  path?: unknown;
  isPwa?: unknown;
  isTv?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as BeaconBody | null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 512) : "";
  if (!path.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const session = await getSession();
  const existingKey = request.cookies.get(analyticsConfig.visitorCookie)?.value ?? null;
  const result = await trackPageView({
    visitorKey: existingKey,
    userId: session?.user.id ?? null,
    path,
    userAgent: request.headers.get("user-agent"),
    clientHints: {
      isPwa: body?.isPwa === true,
      isTv: body?.isTv === true,
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
