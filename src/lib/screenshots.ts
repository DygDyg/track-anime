export function parseScreenshotUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && /^https?:\/\//.test(item),
  );
}

/** Стабильный выбор одного скриншота из нескольких массивов-кандидатов. */
export function pickScreenshotUrl(candidates: unknown[], seed: string): string | null {
  const unique = [...new Set(candidates.flatMap(parseScreenshotUrls))];
  if (!unique.length) return null;

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return unique[hash % unique.length] ?? null;
}
