import { prisma } from "@/lib/prisma";
import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";
import { refreshShikimoriToken, tokenExpiresAt } from "@/lib/auth/shikimori-oauth";
import { getShikimoriEndpoints } from "@/lib/shikimori/endpoints";
import { shikimoriRateLimit, shikimoriRetryAfterMs } from "@/lib/shikimori/rate-limiter";
const MAX_RETRIES = 5;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const SHIKIMORI_RELOGIN_MESSAGE = "Сессия Shikimori истекла — войдите заново";

export class ShikimoriAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShikimoriAuthError";
  }
}

export async function getUserAccessToken(userId: string, forceRefresh = false): Promise<string> {
  const account = await prisma.shikimoriAccount.findUnique({ where: { userId } });
  if (!account) {
    throw new ShikimoriAuthError("Аккаунт Shikimori не привязан");
  }

  if (!forceRefresh && account.expiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS) {
    return account.accessToken;
  }

  try {
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
  } catch {
    throw new ShikimoriAuthError(SHIKIMORI_RELOGIN_MESSAGE);
  }
}

export async function shikimoriAuthFetch<T>(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
    const token = await getUserAccessToken(userId, authAttempt > 0);
    const { apiBase } = await getShikimoriEndpoints();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await shikimoriRateLimit();

      const res = await fetch(`${apiBase}${path}`, {
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
        if (authAttempt === 0) {
          break;
        }
        throw new ShikimoriAuthError(SHIKIMORI_RELOGIN_MESSAGE);
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
  }

  throw new ShikimoriAuthError(SHIKIMORI_RELOGIN_MESSAGE);
}
