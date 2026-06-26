const MIN_INTERVAL_MS = 220;

let lastRequestAt = 0;
const minuteTimestamps: number[] = [];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function kodikRateLimit(): Promise<void> {
  const now = Date.now();

  while (minuteTimestamps.length > 0 && now - minuteTimestamps[0]! >= 60000) {
    minuteTimestamps.shift();
  }

  if (minuteTimestamps.length >= 88) {
    const waitMs = 60000 - (now - minuteTimestamps[0]!) + 50;
    await sleep(waitMs);
    return kodikRateLimit();
  }

  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  lastRequestAt = Date.now();
  minuteTimestamps.push(lastRequestAt);
}
