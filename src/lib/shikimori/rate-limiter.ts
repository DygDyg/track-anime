const MIN_INTERVAL_MS = 350;
const MAX_REQUESTS_PER_MINUTE = 60;

let lastRequestAt = 0;
const minuteTimestamps: number[] = [];

export type ShikimoriRateLimitOptions = {
  /** Abort waiting early (non-critical anime Suspense paths). */
  signal?: AbortSignal | null;
  /** If the slot is not free within this many ms, throw instead of blocking the page. */
  maxWaitMs?: number;
};

export class ShikimoriQueueTimeoutError extends Error {
  constructor(waitMs: number) {
    super(`Shikimori rate limiter busy (would wait ${waitMs}ms)`);
    this.name = "ShikimoriQueueTimeoutError";
  }
}

export function isShikimoriQueueTimeoutError(error: unknown): error is ShikimoriQueueTimeoutError {
  return error instanceof ShikimoriQueueTimeoutError;
}

/**
 * Global Shikimori client throttle.
 * Under crawler load, uncapped waits used to block anime HTML streams for 15–60s.
 */
export async function shikimoriRateLimit(options?: ShikimoriRateLimitOptions): Promise<void> {
  const signal = options?.signal ?? null;
  const maxWaitMs = options?.maxWaitMs ?? 15_000;
  const startedAt = Date.now();

  for (;;) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
    }

    const now = Date.now();
    const waitedMs = now - startedAt;

    while (minuteTimestamps.length > 0 && now - minuteTimestamps[0]! >= 60_000) {
      minuteTimestamps.shift();
    }

    let needWaitMs = 0;
    if (minuteTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
      needWaitMs = Math.max(needWaitMs, 60_000 - (now - minuteTimestamps[0]!) + 100);
    }
    const elapsed = now - lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) {
      needWaitMs = Math.max(needWaitMs, MIN_INTERVAL_MS - elapsed);
    }

    if (needWaitMs <= 0) {
      lastRequestAt = Date.now();
      minuteTimestamps.push(lastRequestAt);
      return;
    }

    if (waitedMs + needWaitMs > maxWaitMs) {
      throw new ShikimoriQueueTimeoutError(needWaitMs);
    }

    await sleep(Math.min(needWaitMs, 250), signal);
  }
}

export function shikimoriRetryAfterMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    const dateMs = Date.parse(header);
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"),
    );
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
