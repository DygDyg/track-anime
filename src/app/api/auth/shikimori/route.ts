import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildShikimoriAuthorizeUrl } from "@/lib/auth/shikimori-oauth";
import { saveOAuthState } from "@/lib/auth/oauth-state-store";
import {
  getShikimoriRedirectUri,
  isAuthConfigured,
  isShikimoriAllowedRedirectUri,
} from "@/lib/auth/config";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import {
  oauthRedirectCookieOptions,
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

  const response = NextResponse.redirect(buildShikimoriAuthorizeUrl(state, redirectUri));
  response.cookies.set(oauthStateCookieOptions(state));
  response.cookies.set(oauthRedirectCookieOptions(redirectUri));

  return response;
}
