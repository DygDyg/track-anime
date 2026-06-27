const SESSION_COOKIE = "ta.session";
const OAUTH_STATE_COOKIE = "ta.oauth_state";
const OAUTH_REDIRECT_COOKIE = "ta.oauth_redirect";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days
const OAUTH_STATE_MAX_AGE_SEC = 600; // 10 minutes

export const authConfig = {
  sessionCookie: SESSION_COOKIE,
  oauthStateCookie: OAUTH_STATE_COOKIE,
  oauthRedirectCookie: OAUTH_REDIRECT_COOKIE,
  sessionMaxAgeSec: SESSION_MAX_AGE_SEC,
  oauthStateMaxAgeSec: OAUTH_STATE_MAX_AGE_SEC,
  /** Только scope, включённые в OAuth-приложении Shikimori. Друзья — через SHIKIMORI_OAUTH_SCOPE. */
  defaultScope: "user_rates",
} as const;

export function getAuthBaseUrl(): string {
  const url = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return url.replace(/\/$/, "");
}

function parseOriginHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.host;
  } catch {
    return null;
  }
}

function getAllowedOriginHosts(): Set<string> {
  const hosts = new Set<string>();

  const configuredHost = parseOriginHost(getAuthBaseUrl());
  if (configuredHost) hosts.add(configuredHost);

  const extra = process.env.AUTH_ALLOWED_ORIGINS?.trim();
  if (!extra) return hosts;

  for (const part of extra.split(/[,;\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const host = parseOriginHost(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    if (host) hosts.add(host);
  }

  return hosts;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Shikimori: HTTP только для localhost/127.0.0.1, остальные URI — только HTTPS. */
export function isShikimoriAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (isLocalHost(url.hostname)) {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getLocalhostShikimoriRedirectUri(): string {
  return "http://localhost:3000/api/auth/callback/shikimori";
}

export function getShikimoriOAuthHint(redirectUri: string, siteOrigin: string): string | null {
  if (!isShikimoriAllowedRedirectUri(redirectUri)) {
    return (
      "Shikimori не принимает HTTP для доменов (только localhost). " +
      "Откройте http://localhost:3000 для dev или https://ta.dygdyg.ru для прода."
    );
  }

  try {
    const redirectHost = new URL(redirectUri).host;
    const siteHost = new URL(siteOrigin).host;
    if (redirectHost !== siteHost) {
      return (
        `Redirect URI для Shikimori: ${redirectHost}. После входа откроется этот адрес ` +
        `(не ${siteHost}). Для dev добавьте в Shikimori: ${redirectUri}`
      );
    }
  } catch {
    return null;
  }

  return null;
}

/** Базовый URL для редиректов OAuth: предпочитаем origin текущего запроса. */
export function resolveAuthOrigin(origin?: string | null): string {
  const configuredBase = getAuthBaseUrl();

  try {
    const configured = new URL(configuredBase);
    if (!isLocalHost(configured.hostname)) {
      if (!origin) return configuredBase;
      const request = new URL(origin);
      if (isLocalHost(request.hostname)) return configuredBase;
    }
  } catch {
    /* ignore invalid AUTH_URL / origin */
  }

  if (!origin) return configuredBase;

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return getAuthBaseUrl();
    }

    const requestHost = url.host;
    const allowed = getAllowedOriginHosts();
    const configured = new URL(configuredBase);

    if (allowed.has(requestHost)) {
      return `${url.protocol}//${url.host}`;
    }

    // За nginx proxy_pass Next.js часто видит localhost — не подменяем публичный AUTH_URL
    if (isLocalHost(url.hostname) && isLocalHost(configured.hostname)) {
      return `${url.protocol}//${url.host}`;
    }

    // AUTH_URL ещё localhost, а сайт открыт по домену/LAN (dygdyg.ru:3000 и т.п.)
    if (isLocalHost(configured.hostname)) {
      return `${url.protocol}//${url.host}`;
    }
  } catch {
    /* ignore invalid origin */
  }

  return configuredBase;
}

export function getShikimoriRedirectUri(origin?: string | null): string {
  const explicit = process.env.SHIKIMORI_REDIRECT_URI?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const configuredBase = getAuthBaseUrl();
  try {
    const configured = new URL(configuredBase);
    // Production за reverse proxy: OAuth всегда на публичный AUTH_URL
    if (!isLocalHost(configured.hostname)) {
      const prodUri = `${configuredBase}/api/auth/callback/shikimori`;
      if (isShikimoriAllowedRedirectUri(prodUri)) {
        return prodUri;
      }
    }
  } catch {
    /* ignore invalid AUTH_URL */
  }

  const resolved = `${resolveAuthOrigin(origin)}/api/auth/callback/shikimori`;
  if (isShikimoriAllowedRedirectUri(resolved)) {
    return resolved;
  }

  // Dev: http://dygdyg.ru:3000 Shikimori не примет — fallback на localhost
  const localhostUri = getLocalhostShikimoriRedirectUri();
  if (isShikimoriAllowedRedirectUri(localhostUri)) {
    return localhostUri;
  }

  return resolved;
}

export function getShikimoriClientId(): string {
  const id = process.env.SHIKIMORI_CLIENT_ID?.trim();
  if (!id) throw new Error("SHIKIMORI_CLIENT_ID is not configured");
  return id;
}

export function getShikimoriClientSecret(): string {
  const secret = process.env.SHIKIMORI_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("SHIKIMORI_CLIENT_SECRET is not configured");
  return secret;
}

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.SHIKIMORI_CLIENT_ID?.trim() && process.env.SHIKIMORI_CLIENT_SECRET?.trim(),
  );
}

export function getShikimoriScope(): string {
  return process.env.SHIKIMORI_OAUTH_SCOPE?.trim() || authConfig.defaultScope;
}

/** Shikimori ID администраторов (через запятую). При входе выдаётся isAdmin. */
export function getAdminShikimoriIds(): Set<number> {
  const raw = process.env.ADMIN_SHIKIMORI_IDS?.trim();
  if (!raw) return new Set();

  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
}

export function isBootstrapAdmin(shikimoriId: number): boolean {
  return getAdminShikimoriIds().has(shikimoriId);
}

/** Shikimori ждёт scope через «+» в URL; URLSearchParams кодирует «+» в %2B — передаём пробелы. */
export function formatShikimoriScopeForAuthorize(scope: string): string {
  return scope
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

