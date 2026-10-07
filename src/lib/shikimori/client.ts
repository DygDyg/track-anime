import { getShikimoriUserAgent } from "@/lib/auth/shikimori-user-agent";
import { getShikimoriEndpoints, shikimoriAssetUrl } from "@/lib/shikimori/endpoints";
import {
  isShikimoriQueueTimeoutError,
  shikimoriRateLimit,
  shikimoriRetryAfterMs,
} from "@/lib/shikimori/rate-limiter";

const USER_AGENT = "TrackAnime";
const MAX_RETRIES = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 15_000;
/**
 * Non-critical callers (related/similar Suspense) may wait in the global queue,
 * but must not block streams for long. Must be ≥ MIN_INTERVAL_MS (350) so two
 * sequential non-critical requests in one render can both get a slot; 200ms
 * made the second request (and often similar) always fail with queue timeout.
 */
const NON_CRITICAL_QUEUE_MAX_WAIT_MS = 2_000;

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
    message.includes("socket") ||
    message.includes("abort")
  );
}

export function isShikimoriTransientFetchError(error: unknown): boolean {
  return isShikimoriQueueTimeoutError(error) || isRetryableFetchError(error);
}

function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function envTimeoutMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 1_000 ? Math.floor(raw) : fallback;
}

function timeoutSignal(timeoutMs: number, signal?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

async function shikimoriFetchOnce<T>(path: string, init?: RequestInit): Promise<T | null> {
  const { apiBase } = await getShikimoriEndpoints();
  const requestTimeoutMs = envTimeoutMs("SHIKIMORI_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS);
  const totalTimeoutMs = envTimeoutMs("SHIKIMORI_TOTAL_TIMEOUT_MS", DEFAULT_TOTAL_TIMEOUT_MS);
  const deadlineAt = Date.now() + totalTimeoutMs;
  const callerSignal = init?.signal ?? null;
  // Callers that pass AbortSignal (related/similar) fail fast instead of blocking HTML streams.
  const queueMaxWaitMs = callerSignal ? NON_CRITICAL_QUEUE_MAX_WAIT_MS : totalTimeoutMs;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Shikimori API timeout: ${path}`);
    }
    if (callerSignal?.aborted) {
      throw callerSignal.reason instanceof Error
        ? callerSignal.reason
        : new DOMException("Aborted", "AbortError");
    }

    await shikimoriRateLimit({
      signal: callerSignal,
      maxWaitMs: Math.min(queueMaxWaitMs, remainingMs),
    });

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
        signal: timeoutSignal(Math.min(requestTimeoutMs, remainingMs), callerSignal),
      });
    } catch (error) {
      if (callerSignal?.aborted) throw error;
      const retryMs = retryDelayMs(attempt);
      if (attempt < MAX_RETRIES && isRetryableFetchError(error) && Date.now() + retryMs < deadlineAt) {
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        continue;
      }
      throw error;
    }

    if (res.status === 404) return null;

    if (res.status === 429) {
      if (callerSignal) {
        // Non-critical: never sleep on upstream 429 — drop related/similar for this render.
        throw new ShikimoriRateLimitError(path);
      }
      if (attempt < MAX_RETRIES) {
        const waitMs = shikimoriRetryAfterMs(res, attempt);
        if (Date.now() + waitMs >= deadlineAt) {
          throw new ShikimoriRateLimitError(path);
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw new ShikimoriRateLimitError(path);
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
