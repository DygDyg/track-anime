import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildShikimoriAuthorizeUrl,
  revokeShikimoriAccountTokens,
} from "@/lib/auth/shikimori-oauth";
import { saveOAuthState } from "@/lib/auth/oauth-state-store";
import {
  getShikimoriRedirectUri,
  isAuthConfigured,
  isShikimoriAllowedRedirectUri,
  parseOAuthReturnPath,
} from "@/lib/auth/config";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import {
  getSession,
  oauthRedirectCookieOptions,
  oauthReturnCookieOptions,
  oauthStateCookieOptions,
} from "@/lib/auth/session";

function returnPathFromReferer(referer: string | null, origin: string): string | null {
  if (!referer) return null;
  try {
    const ref = new URL(referer);
    const site = new URL(origin);
    if (ref.origin !== site.origin) return null;
    return parseOAuthReturnPath(`${ref.pathname}${ref.search}`);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);

  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login?error=auth_required", origin));
  }

  const account = await prisma.shikimoriAccount.findUnique({
    where: { userId: session.user.id },
  });

  if (account) {
    try {
      await revokeShikimoriAccountTokens(account);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn("[auth] Shikimori reconnect revoke failed:", message);
    }
  }

  const redirectUri = getShikimoriRedirectUri(origin);
  if (!isShikimoriAllowedRedirectUri(redirectUri)) {
    return NextResponse.redirect(new URL("/login?error=redirect_https", origin));
  }

  const returnPath =
    parseOAuthReturnPath(request.nextUrl.searchParams.get("returnTo")) ??
    returnPathFromReferer(request.headers.get("referer"), origin);

  const state = randomUUID();
  await saveOAuthState(state, redirectUri);

  const response = NextResponse.redirect(await buildShikimoriAuthorizeUrl(state, redirectUri));
  response.cookies.set(oauthStateCookieOptions(state));
  response.cookies.set(oauthRedirectCookieOptions(redirectUri));
  if (returnPath) {
    response.cookies.set(oauthReturnCookieOptions(returnPath));
  }

  return response;
}
