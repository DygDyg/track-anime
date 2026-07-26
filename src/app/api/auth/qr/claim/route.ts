import { NextRequest, NextResponse } from "next/server";
import { claimQrLogin } from "@/lib/auth/qr-login";
import { isSecureRequest, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { code?: unknown; requesterSecret?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const requesterSecret = typeof body?.requesterSecret === "string" ? body.requesterSecret : "";
  const sessionToken = await claimQrLogin(code, requesterSecret);
  if (!sessionToken) return NextResponse.json({ error: "QR-вход ещё не подтверждён или уже использован." }, { status: 409 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions(sessionToken, isSecureRequest(request)));
  return response;
}
