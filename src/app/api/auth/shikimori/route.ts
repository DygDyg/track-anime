import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildShikimoriAuthorizeUrl } from "@/lib/auth/shikimori-oauth";
import { saveOAuthState } from "@/lib/auth/oauth-state-store";
import {
  getShikimoriRedirectUri,
  isAuthConfigured,
  isShikimoriAllowedRedirectUri,
  parseOAuthReturnPath,
} from "@/lib/auth/config";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import {
  oauthRedirectCookieOptions,
  oauthReturnCookieOptions,
  oauthStateCookieOptions,
} from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);

  if (!isAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  const redirectUri = getShikimoriRedirectUri(origin);
  if (!isShikimoriAllowedRedirectUri(redirectUri)) {
    return NextResponse.redirect(new URL("/login?error=redirect_https", origin));
  }
  const state = randomUUID();
  await saveOAuthState(state, redirectUri);

  const response = NextResponse.redirect(await buildShikimoriAuthorizeUrl(state, redirectUri));
  response.cookies.set(oauthStateCookieOptions(state));
  response.cookies.set(oauthRedirectCookieOptions(redirectUri));
  const returnPath = parseOAuthReturnPath(request.nextUrl.searchParams.get("returnTo"));
  if (returnPath) response.cookies.set(oauthReturnCookieOptions(returnPath));

  return response;
}
