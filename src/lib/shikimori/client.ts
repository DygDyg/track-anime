import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";
import { getShikimoriEndpoints, shikimoriAssetUrl } from "@/lib/shikimori/endpoints";
import { shikimoriRateLimit, shikimoriRetryAfterMs } from "@/lib/shikimori/rate-limiter";

const USER_AGENT = "TrackAnime";
const MAX_RETRIES = 5;

const inflightRequests = new Map<string, Promise<unknown>>();

export class ShikimoriRateLimitError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Shikimori API 429: ${path}`);
    this.name = "ShikimoriRateLimitError";
    this.path = path;
  }
}

export function isShikimoriRateLimitError(error: unknown): error is ShikimoriRateLimitError {
  return error instanceof ShikimoriRateLimitError;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("socket")
  );
}

function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

async function shikimoriFetchOnce<T>(path: string, init?: RequestInit): Promise<T | null> {
  const { apiBase } = await getShikimoriEndpoints();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await shikimoriRateLimit();

    let res: Response;
    try {
      res = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: {
          "User-Agent": getShikimoriUserAgent() || USER_AGENT,
          Accept: "application/json",
          ...init?.headers,
        },
        next: { revalidate: 3600 },
      });
    } catch (error) {
      if (attempt < MAX_RETRIES && isRetryableFetchError(error)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        continue;
      }
      throw error;
    }

    if (res.status === 404) return null;

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = shikimoriRetryAfterMs(res, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Shikimori API ${res.status}: ${path}`);
    }

    return res.json() as Promise<T>;
  }

  throw new ShikimoriRateLimitError(path);
}

export async function shikimoriFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const key = `${init?.method ?? "GET"} ${path}`;
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T | null>;
  }

  const promise = shikimoriFetchOnce<T>(path, init).finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

export function isShikimoriMissingImage(path: string | null | undefined): boolean {
  if (!path) return true;
  return /\/assets\/globals\/missing_/i.test(path);
}

export { shikimoriAssetUrl };
