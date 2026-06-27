import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { authConfig, isAuthConfigured } from "@/lib/auth/config";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import { consumeOAuthState } from "@/lib/auth/oauth-state-store";
import {
  exchangeShikimoriCode,
  fetchShikimoriWhoami,
  tokenExpiresAt,
} from "@/lib/auth/shikimori-oauth";
import {
  clearOAuthRedirectCookieOptions,
  clearOAuthStateCookieOptions,
  createSession,
  sessionCookieOptions,
  upsertShikimoriUser,
} from "@/lib/auth/session";

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(clearOAuthStateCookieOptions());
  response.cookies.set(clearOAuthRedirectCookieOptions());
}

function finishLoginError(baseUrl: string, params: Record<string, string>) {
  const url = new URL("/login", baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

async function resolveOAuthContext(state: string): Promise<{ redirectUri: string } | null> {
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(authConfig.oauthStateCookie)?.value;
  const cookieRedirect = cookieStore.get(authConfig.oauthRedirectCookie)?.value;

  if (cookieState === state && cookieRedirect) {
    return { redirectUri: cookieRedirect };
  }

  return consumeOAuthState(state);
}

export async function GET(request: NextRequest) {
  const baseUrl = getRequestOrigin(request);

  if (!isAuthConfigured()) {
    return finishLoginError(baseUrl, { error: "config" });
  }

  const { searchParams } = request.nextUrl;
  const error = searchParams.get("error");
  if (error) {
    const errorCode =
      error === "access_denied"
        ? "access_denied"
        : error === "invalid_scope"
          ? "invalid_scope"
          : "oauth_failed";
    const response = finishLoginError(baseUrl, {
      error: errorCode,
      ...(searchParams.get("error_description")
        ? { details: searchParams.get("error_description")!.slice(0, 240) }
        : {}),
    });
    clearOAuthCookies(response);
    return response;
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    const response = finishLoginError(baseUrl, { error: "missing_code" });
    clearOAuthCookies(response);
    return response;
  }

  const oauthContext = await resolveOAuthContext(state);
  if (!oauthContext) {
    const response = finishLoginError(baseUrl, { error: "invalid_state" });
    clearOAuthCookies(response);
    return response;
  }

  try {
    const tokens = await exchangeShikimoriCode(code, oauthContext.redirectUri);
    const whoami = await fetchShikimoriWhoami(tokens.access_token);
    const user = await upsertShikimoriUser({
      shikimoriId: whoami.id,
      nickname: whoami.nickname,
      avatar: whoami.avatar ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokenExpiresAt(tokens.expires_in),
      scope: tokens.scope ?? authConfig.defaultScope,
    });

    const sessionToken = await createSession(user.id);

    const response = NextResponse.redirect(new URL("/", baseUrl));
    response.cookies.set(sessionCookieOptions(sessionToken));
    clearOAuthCookies(response);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[auth] Shikimori callback failed:", message);
    const response = finishLoginError(baseUrl, {
      error: "oauth_failed",
      details: message.slice(0, 240),
    });
    clearOAuthCookies(response);
    return response;
  }
}
