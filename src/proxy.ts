import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const LEGACY_HOST = "ta.dygdyg.ru";
const CANONICAL_HOST = "track-anime.dygdyg.ru";

function parseShikimoriId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function redirectLegacyHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.split(":")[0];
  if (host !== LEGACY_HOST) return null;

  const url = request.nextUrl.clone();
  url.hostname = CANONICAL_HOST;
  url.protocol = "https:";
  return NextResponse.redirect(url, 308);
}

export function proxy(request: NextRequest) {
  const legacyRedirect = redirectLegacyHost(request);
  if (legacyRedirect) return legacyRedirect;

  const shikimoriId = parseShikimoriId(request.nextUrl.searchParams.get("shikimori_id"));
  if (!shikimoriId) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/anime/${shikimoriId}`;
  url.searchParams.delete("shikimori_id");

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
