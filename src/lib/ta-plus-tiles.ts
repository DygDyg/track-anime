import { taPlusProxiedTileUrl } from "@/lib/ta-plus-tile-proxy";

/** Client-safe storyboard tiles from Kodik /ftor (via /api/.../taplus). */
export type TaPlusTiles = {
  interval: number;
  width: number;
  x: number;
  y: number;
  pattern: string;
};

export type TaPlusTilePreview = {
  url: string;
  col: number;
  row: number;
  cellWidth: number;
  cellHeight: number;
};

/**
 * Kodik `tiles.pattern` placeholder `{index}` is 1-based and always 4 digits
 * (`0001`, `0002`, …) — same as player JS `String(n).padStart(4, "0")`.
 * Callers pass a 0-based sheet index from `floor(frame / (x*y))`.
 */
export function formatTaPlusTileSheetIndex(sheetIndex: number): string {
  const oneBased = Math.max(1, Math.floor(sheetIndex) + 1);
  return String(oneBased).padStart(4, "0");
}

export function taPlusTileSheetUrl(tiles: TaPlusTiles, sheetIndex: number): string {
  return tiles.pattern.replace("{index}", formatTaPlusTileSheetIndex(sheetIndex));
}

export function taPlusTileSheetDisplayUrl(
  tiles: TaPlusTiles,
  sheetIndex: number,
  proxied = true,
): string {
  const absolute = taPlusTileSheetUrl(tiles, sheetIndex);
  return proxied ? taPlusProxiedTileUrl(absolute) : absolute;
}

/** Resolve storyboard cell for a playback position (seconds). */
export function resolveTaPlusTilePreview(
  tiles: TaPlusTiles,
  positionSeconds: number,
  options?: { proxied?: boolean },
): TaPlusTilePreview | null {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return null;
  const interval = Math.max(1, tiles.interval);
  const cols = Math.max(1, tiles.x);
  const rows = Math.max(1, tiles.y);
  const framesPerSheet = cols * rows;
  const frame = Math.floor(positionSeconds / interval);
  const sheetIndex = Math.floor(frame / framesPerSheet);
  const posInSheet = frame % framesPerSheet;
  const col = posInSheet % cols;
  const row = Math.floor(posInSheet / cols);
  const absolute = taPlusTileSheetUrl(tiles, sheetIndex);
  if (!absolute) return null;
  const url = options?.proxied === false ? absolute : taPlusProxiedTileUrl(absolute);
  const cellWidth = Math.max(1, tiles.width);
  const cellHeight = Math.round((cellWidth * 9) / 16);
  return { url, col, row, cellWidth, cellHeight };
}

export function taPlusTilePreviewStyle(preview: TaPlusTilePreview, tiles: TaPlusTiles): {
  width: number;
  height: number;
  backgroundImage: string;
  backgroundRepeat: "no-repeat";
  backgroundSize: string;
  backgroundPosition: string;
} {
  return {
    width: preview.cellWidth,
    height: preview.cellHeight,
    backgroundImage: `url(${preview.url})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${preview.cellWidth * Math.max(1, tiles.x)}px ${preview.cellHeight * Math.max(1, tiles.y)}px`,
    backgroundPosition: `-${preview.col * preview.cellWidth}px -${preview.row * preview.cellHeight}px`,
  };
}

/** Evenly spaced timestamps across an episode (excludes exact 0 / end). */
export function pickTaPlusSlideshowPositions(
  durationSeconds: number,
  count = 5,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 30) return [];
  const n = Math.min(5, Math.max(4, count));
  const positions: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (durationSeconds * (i + 1)) / (n + 1);
    positions.push(Math.max(0, Math.min(durationSeconds - 1, t)));
  }
  return positions;
}

/**
 * Idle slideshow frames: 5 evenly spaced cells from early sheets (no duration probe).
 * Uses proxied sheet URLs so the browser is not blocked by CDN hotlink rules.
 */
/** Soft cap — ~2h @ 5s × 5×5 sheets ≈ 58; blocks runaway duration/pattern bugs. */
const MAX_TA_PLUS_TILE_SHEETS = 96;

/** How many storyboard sheets cover `[0, durationSeconds)`. */
export function countTaPlusTileSheets(
  tiles: TaPlusTiles,
  durationSeconds: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const interval = Math.max(1, tiles.interval);
  const framesPerSheet = Math.max(1, tiles.x) * Math.max(1, tiles.y);
  const lastFrame = Math.floor(Math.max(0, durationSeconds - 0.001) / interval);
  const sheetCount = Math.floor(lastFrame / framesPerSheet) + 1;
  return Math.min(MAX_TA_PLUS_TILE_SHEETS, Math.max(0, sheetCount));
}

/** Proxied sheet URLs for scrub / tap-seek preview (order = sheet index). */
export function listTaPlusTileSheetDisplayUrls(
  tiles: TaPlusTiles,
  durationSeconds: number,
): string[] {
  const n = countTaPlusTileSheets(tiles, durationSeconds);
  const urls: string[] = [];
  for (let i = 0; i < n; i += 1) {
    urls.push(taPlusTileSheetDisplayUrl(tiles, i, true));
  }
  return urls;
}

export function pickTaPlusIdleSlideshowFrames(
  tiles: TaPlusTiles,
  count = 5,
): TaPlusTilePreview[] {
  const n = Math.min(5, Math.max(4, count));
  const cols = Math.max(1, tiles.x);
  const rows = Math.max(1, tiles.y);
  const framesPerSheet = cols * rows;
  const interval = Math.max(1, tiles.interval);
  // Cover ~first 20–25 minutes evenly without knowing total duration.
  const spanSeconds = Math.max(interval * framesPerSheet * 4, 20 * 60);
  const out: TaPlusTilePreview[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (spanSeconds * (i + 1)) / (n + 1);
    const preview = resolveTaPlusTilePreview(tiles, t, { proxied: true });
    if (preview) out.push(preview);
  }
  return out;
}
