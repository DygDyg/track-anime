export function parseScreenshotUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && /^https?:\/\//.test(item),
  );
}

/** Ключ одного кадра: original/preview и разные хосты Shikimori → один скрин. */
export function screenshotDedupeKey(url: string): string {
  const normalized = url.trim().replace(/^http:\/\//i, "https://");

  try {
    const { pathname } = new URL(normalized);
    const fileName = pathname.split("/").pop() ?? pathname;
    return fileName.replace(/-(?:original|preview)(?=\.[^.]+$)/i, "").toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function screenshotQuality(url: string): number {
  if (/\/original\//i.test(url)) return 2;
  if (/\/preview\//i.test(url)) return 1;
  return 0;
}

/** Убирает дубликаты кадров, сохраняя порядок и предпочитая original над preview. */
export function uniqueScreenshotUrls(urls: string[]): string[] {
  const order: string[] = [];
  const byKey = new Map<string, string>();

  for (const raw of urls) {
    const url = raw.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const key = screenshotDedupeKey(url);
    const prev = byKey.get(key);

    if (!prev) {
      byKey.set(key, url);
      order.push(key);
      continue;
    }

    if (screenshotQuality(url) > screenshotQuality(prev)) {
      byKey.set(key, url);
    }
  }

  return order.map((key) => byKey.get(key)!);
}

/** Стабильный выбор одного скриншота из нескольких массивов-кандидатов. */
export function pickScreenshotUrl(candidates: unknown[], seed: string): string | null {
  const unique = uniqueScreenshotUrls(candidates.flatMap(parseScreenshotUrls));
  if (!unique.length) return null;

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return unique[hash % unique.length] ?? null;
}
