/** CSS-паттерн фоны сайта (без blur, с параллаксом; палитра через CSS light/dark). URL: `pattern:<id>`. */

export const PATTERN_BACKGROUND_PREFIX = "pattern:" as const;

export const PATTERN_BACKGROUND_IDS = [
  "dot-grid",
  "hex-mesh",
  "diagonal-hatch",
  "aurora-noise",
  "circuit-lines",
  "radial-rings",
] as const;

export type PatternBackgroundId = (typeof PATTERN_BACKGROUND_IDS)[number];

export type PatternBackgroundEntry = {
  id: PatternBackgroundId;
  url: string;
  label: string;
};

const PATTERN_LABELS: Record<PatternBackgroundId, string> = {
  "dot-grid": "Точечная сетка",
  "hex-mesh": "Шестиугольники",
  "diagonal-hatch": "Диагональ",
  "aurora-noise": "Аурора",
  "circuit-lines": "Circuit",
  "radial-rings": "Кольца",
};

const PATTERN_ID_SET = new Set<string>(PATTERN_BACKGROUND_IDS);

export function patternBackgroundUrl(id: PatternBackgroundId): string {
  return `${PATTERN_BACKGROUND_PREFIX}${id}`;
}

export function isPatternBackgroundUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(PATTERN_BACKGROUND_PREFIX);
}

export function parsePatternBackgroundId(url: string | null | undefined): PatternBackgroundId | null {
  if (!isPatternBackgroundUrl(url)) return null;
  const id = url!.slice(PATTERN_BACKGROUND_PREFIX.length);
  return PATTERN_ID_SET.has(id) ? (id as PatternBackgroundId) : null;
}

export function listPatternBackgroundEntries(): PatternBackgroundEntry[] {
  return PATTERN_BACKGROUND_IDS.map((id) => ({
    id,
    url: patternBackgroundUrl(id),
    label: PATTERN_LABELS[id],
  }));
}

export function listPatternBackgroundUrls(): string[] {
  return listPatternBackgroundEntries().map((item) => item.url);
}

export function patternBackgroundLabel(url: string): string | null {
  const id = parsePatternBackgroundId(url);
  return id ? PATTERN_LABELS[id] : null;
}
