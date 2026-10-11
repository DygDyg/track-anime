/**
 * Background preload of TA Plus storyboard sheets (scrub / ±seek preview).
 * Low concurrency so HLS playback stays preferred on the network.
 */

const DEFAULT_CONCURRENCY = 2;

const warmedUrls = new Set<string>();

export function isTaPlusTileSheetWarmed(url: string): boolean {
  return Boolean(url && warmedUrls.has(url));
}

/** Warm browser cache for sheet URLs; safe to call repeatedly (skips warmed). */
export function preloadTaPlusTileSheets(
  urls: string[],
  options?: { concurrency?: number; signal?: AbortSignal },
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const signal = options?.signal;
  const concurrency = Math.max(1, Math.min(6, options?.concurrency ?? DEFAULT_CONCURRENCY));
  const pending = urls.filter((url) => url && !warmedUrls.has(url));
  if (pending.length === 0) return Promise.resolve();

  let index = 0;
  let active = 0;
  let settled = false;

  return new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const onAbort = () => finish();
    if (signal?.aborted) {
      finish();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    const pump = () => {
      if (signal?.aborted) {
        signal.removeEventListener("abort", onAbort);
        finish();
        return;
      }
      while (active < concurrency && index < pending.length) {
        const url = pending[index]!;
        index += 1;
        active += 1;
        const img = new Image();
        img.decoding = "async";
        const done = (ok: boolean) => {
          if (ok) warmedUrls.add(url);
          active -= 1;
          if (index >= pending.length && active === 0) {
            signal?.removeEventListener("abort", onAbort);
            finish();
            return;
          }
          pump();
        };
        img.onload = () => done(true);
        img.onerror = () => done(false);
        img.src = url;
      }
      if (pending.length === 0) {
        signal?.removeEventListener("abort", onAbort);
        finish();
      }
    };

    pump();
  });
}

/** Test helper. */
export function resetTaPlusTileSheetWarmCacheForTests(): void {
  warmedUrls.clear();
}
