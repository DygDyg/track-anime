import { prisma } from "@/lib/prisma";
import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";
import { refreshShikimoriToken, tokenExpiresAt } from "@/lib/auth/shikimori-oauth";
import { shikimoriRateLimit, shikimoriRetryAfterMs } from "@/lib/shikimori/rate-limiter";

const API_BASE = "https://shikimori.one/api";
const MAX_RETRIES = 5;

export class ShikimoriAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShikimoriAuthError";
  }
}

export async function getUserAccessToken(userId: string): Promise<string> {
  const account = await prisma.shikimoriAccount.findUnique({ where: { userId } });
  if (!account) {
    throw new ShikimoriAuthError("Shikimori account not linked");
  }

  const refreshBufferMs = 5 * 60 * 1000;
  if (account.expiresAt.getTime() > Date.now() + refreshBufferMs) {
    return account.accessToken;
  }

  const tokens = await refreshShikimoriToken(account.refreshToken);
  await prisma.shikimoriAccount.update({
    where: { userId },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokenExpiresAt(tokens.expires_in),
    },
  });

  return tokens.access_token;
}

export async function shikimoriAuthFetch<T>(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getUserAccessToken(userId);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await shikimoriRateLimit();

    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "User-Agent": getShikimoriUserAgent(),
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");

    if (res.status === 401) {
      throw new ShikimoriAuthError("Shikimori token expired — sign in again");
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = shikimoriRetryAfterMs(res, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Shikimori API ${res.status}: ${path} — ${text.slice(0, 200)}`);
    }

    if (res.status === 204 || !text.trim()) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  throw new Error(`Shikimori API 429: ${path} — Retry later`);
}
