export function parseAnimeScore(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.min(10, Math.max(0, parsed));
}

export function formatAnimeScore(score: number): string {
  const rounded = Math.round(score * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function normalizeAnimeScore(value: string | number | null | undefined): string | null {
  const parsed = parseAnimeScore(value);
  return parsed == null ? null : formatAnimeScore(parsed);
}

export function extractScoreFromMaterialData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  return normalizeAnimeScore(
    (record.shikimori_rating ?? record.shikimori_score) as string | number | null | undefined,
  );
}

type Rgb = { r: number; g: number; b: number };

/** Высокий → низкий: зелёный → жёлтый → красный → белый → серый */
const SCORE_COLOR_STOPS: Array<{ at: number; rgb: Rgb }> = [
  { at: 0, rgb: { r: 107, g: 114, b: 128 } },
  { at: 1.2, rgb: { r: 209, g: 213, b: 219 } },
  { at: 2.2, rgb: { r: 248, g: 250, b: 252 } },
  { at: 3, rgb: { r: 239, g: 68, b: 68 } },
  { at: 4.2, rgb: { r: 249, g: 115, b: 22 } },
  { at: 5.2, rgb: { r: 251, g: 191, b: 36 } },
  { at: 6.2, rgb: { r: 250, g: 204, b: 21 } },
  { at: 7.2, rgb: { r: 190, g: 242, b: 100 } },
  { at: 8.2, rgb: { r: 74, g: 222, b: 128 } },
  { at: 9.2, rgb: { r: 34, g: 197, b: 94 } },
  { at: 10, rgb: { r: 22, g: 163, b: 74 } },
];

function clampScore(score: number): number {
  return Math.min(10, Math.max(0, score));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: Math.round(lerp(from.r, to.r, t)),
    g: Math.round(lerp(from.g, to.g, t)),
    b: Math.round(lerp(from.b, to.b, t)),
  };
}

function rgbToCss(color: Rgb): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function scoreToRgb(score: number): Rgb {
  const value = clampScore(score);

  for (let index = 0; index < SCORE_COLOR_STOPS.length - 1; index += 1) {
    const left = SCORE_COLOR_STOPS[index]!;
    const right = SCORE_COLOR_STOPS[index + 1]!;

    if (value <= right.at) {
      const span = right.at - left.at;
      const t = span <= 0 ? 0 : (value - left.at) / span;
      return lerpRgb(left.rgb, right.rgb, Math.max(0, Math.min(1, t)));
    }
  }

  return SCORE_COLOR_STOPS[SCORE_COLOR_STOPS.length - 1]!.rgb;
}

function shiftRgb(color: Rgb, factor: number): Rgb {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r * factor))),
    g: Math.max(0, Math.min(255, Math.round(color.g * factor))),
    b: Math.max(0, Math.min(255, Math.round(color.b * factor))),
  };
}

function textColorForRgb(color: Rgb): string {
  const luminance = (color.r * 0.299 + color.g * 0.587 + color.b * 0.114) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export function animeScoreBadgeStyle(score: number): {
  background: string;
  color: string;
} {
  const base = scoreToRgb(score);
  const light = shiftRgb(base, 1.14);
  const dark = shiftRgb(base, 0.72);

  return {
    background: `linear-gradient(135deg, ${rgbToCss(light)} 0%, ${rgbToCss(base)} 48%, ${rgbToCss(dark)} 100%)`,
    color: textColorForRgb(base),
  };
}
