import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function parseShikimoriId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export function middleware(request: NextRequest) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
