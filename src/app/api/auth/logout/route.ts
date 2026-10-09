import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { getRequestHostname } from "@/lib/auth/request-origin";
import { clearSessionCookieOptionsList, deleteSessionByToken } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(authConfig.sessionCookie)?.value;
  if (token) {
    await deleteSessionByToken(token);
  }

  const response = NextResponse.json({ ok: true });
  for (const opts of clearSessionCookieOptionsList(getRequestHostname(request))) {
    response.cookies.set(opts);
  }
  return response;
}
