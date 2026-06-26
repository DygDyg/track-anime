import {
  authConfig,
  formatShikimoriScopeForAuthorize,
  getShikimoriClientId,
  getShikimoriClientSecret,
  getShikimoriRedirectUri,
  getShikimoriScope,
} from "@/lib/auth/config";
import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";

export type ShikimoriWhoami = {
  id: number;
  nickname: string;
  avatar?: string | null;
  name?: string | null;
};

export type ShikimoriTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export function buildShikimoriAuthorizeUrl(state: string, redirectUri?: string): string {
  const redirect = redirectUri ?? getShikimoriRedirectUri();
  const params = new URLSearchParams({
    client_id: getShikimoriClientId(),
    redirect_uri: redirect,
    response_type: "code",
    scope: formatShikimoriScopeForAuthorize(getShikimoriScope()),
    state,
  });
  return `${authConfig.shikimoriAuthorizeUrl}?${params.toString()}`;
}

function buildTokenForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
}

async function shikimoriTokenRequest(body: FormData): Promise<ShikimoriTokenResponse> {
  const res = await fetch(authConfig.shikimoriTokenUrl, {
    method: "POST",
    headers: {
      "User-Agent": getShikimoriUserAgent(),
    },
    body,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Shikimori token error ${res.status}: ${text.slice(0, 300)}`);
  }

  let data: ShikimoriTokenResponse;
  try {
    data = JSON.parse(text) as ShikimoriTokenResponse;
  } catch {
    throw new Error(`Shikimori token invalid JSON: ${text.slice(0, 300)}`);
  }

  if (!data.access_token || !data.refresh_token) {
    throw new Error(`Shikimori token missing fields: ${text.slice(0, 300)}`);
  }

  return data;
}

export async function exchangeShikimoriCode(
  code: string,
  redirectUri?: string,
): Promise<ShikimoriTokenResponse> {
  const redirect = redirectUri ?? getShikimoriRedirectUri();
  return shikimoriTokenRequest(
    buildTokenForm({
      grant_type: "authorization_code",
      client_id: getShikimoriClientId(),
      client_secret: getShikimoriClientSecret(),
      code,
      redirect_uri: redirect,
    }),
  );
}

export async function refreshShikimoriToken(refreshToken: string): Promise<ShikimoriTokenResponse> {
  return shikimoriTokenRequest(
    buildTokenForm({
      grant_type: "refresh_token",
      client_id: getShikimoriClientId(),
      client_secret: getShikimoriClientSecret(),
      refresh_token: refreshToken,
    }),
  );
}

export async function fetchShikimoriWhoami(accessToken: string): Promise<ShikimoriWhoami> {
  const res = await fetch(authConfig.shikimoriWhoamiUrl, {
    headers: {
      "User-Agent": getShikimoriUserAgent(),
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Shikimori whoami error ${res.status}: ${text.slice(0, 300)}`);
  }

  return JSON.parse(text) as ShikimoriWhoami;
}

export { shikimoriAvatarUrl } from "@/lib/auth/shikimori-avatar";

export function tokenExpiresAt(expiresInSec: number | undefined): Date {
  const seconds = Number.isFinite(expiresInSec) && expiresInSec! > 0 ? expiresInSec! : 86400;
  return new Date(Date.now() + seconds * 1000);
}
