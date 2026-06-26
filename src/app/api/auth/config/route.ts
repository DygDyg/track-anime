import { NextRequest, NextResponse } from "next/server";
import {
  getShikimoriOAuthHint,
  getShikimoriRedirectUri,
  isAuthConfigured,
  isShikimoriAllowedRedirectUri,
} from "@/lib/auth/config";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const redirectUri = getShikimoriRedirectUri(origin);
  const altRedirectUri = redirectUri.includes("localhost")
    ? getShikimoriRedirectUri("http://127.0.0.1:3000")
    : getShikimoriRedirectUri("http://localhost:3000");

  return NextResponse.json({
    configured: isAuthConfigured(),
    redirectUri,
    altRedirectUri: altRedirectUri !== redirectUri ? altRedirectUri : null,
    shikimoriAllowed: isShikimoriAllowedRedirectUri(redirectUri),
    loginHint: getShikimoriOAuthHint(redirectUri, origin),
    appName: getShikimoriUserAgent(),
  });
}
