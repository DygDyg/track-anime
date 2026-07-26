import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import { findUserByLocalCredential, normalizeLocalLogin } from "@/lib/auth/local-credentials";
import { createSession, isSecureRequest, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { login?: unknown; password?: unknown } | null;
  const login = typeof body?.login === "string" ? normalizeLocalLogin(body.login) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const user = await findUserByLocalCredential(login, password);
  if (!user) return NextResponse.json({ error: "Неверный логин или пароль." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieOptions(await createSession(user.id), isSecureRequest(request)));
  return response;
}
