const MIN_INTERVAL_MS = 350;
const MAX_REQUESTS_PER_MINUTE = 60;

let lastRequestAt = 0;
const minuteTimestamps: number[] = [];

export async function shikimoriRateLimit(): Promise<void> {
  const now = Date.now();

  while (minuteTimestamps.length > 0 && now - minuteTimestamps[0]! >= 60_000) {
    minuteTimestamps.shift();
  }

  if (minuteTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const waitMs = 60_000 - (now - minuteTimestamps[0]!) + 100;
    await sleep(waitMs);
    return shikimoriRateLimit();
  }

  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  lastRequestAt = Date.now();
  minuteTimestamps.push(lastRequestAt);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
