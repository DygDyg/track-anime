/** Device / window screen brightness for TA player gestures (Vanced-style). */

export const PLAYER_BRIGHTNESS_STORAGE_KEY = "ta:player-screen-brightness";
export const PLAYER_BRIGHTNESS_DEFAULT = 0.85;
export const PLAYER_BRIGHTNESS_MIN = 0.01;
export const PLAYER_BRIGHTNESS_MAX = 1;

export type TrackAnimeAndroidBrightnessBridge = {
  setScreenBrightness?: ((value: number) => void) | unknown;
  getScreenBrightness?: (() => number) | unknown;
  clearScreenBrightness?: (() => void) | unknown;
  hasScreenBrightnessControl?: (() => boolean) | unknown;
};

export type PlayerBrightnessMode = "native" | "overlay";

function bridge(): TrackAnimeAndroidBrightnessBridge | null {
  if (typeof window === "undefined") return null;
  const api = (window as Window & { TrackAnimeAndroid?: TrackAnimeAndroidBrightnessBridge })
    .TrackAnimeAndroid;
  if (!api) return null;
  // Android WebView may expose Java methods without a reliable typeof === "function".
  if (api.setScreenBrightness == null) return null;
  return api;
}

function callSetScreenBrightness(api: TrackAnimeAndroidBrightnessBridge, value: number): boolean {
  const fn = api.setScreenBrightness;
  if (typeof fn !== "function") return false;
  try {
    (fn as (value: number) => void).call(api, value);
    return true;
  } catch {
    return false;
  }
}

export function clampPlayerBrightness(value: number): number {
  if (!Number.isFinite(value)) return PLAYER_BRIGHTNESS_DEFAULT;
  return Math.min(PLAYER_BRIGHTNESS_MAX, Math.max(PLAYER_BRIGHTNESS_MIN, value));
}

export function readStoredPlayerBrightness(): number {
  if (typeof window === "undefined") return PLAYER_BRIGHTNESS_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PLAYER_BRIGHTNESS_STORAGE_KEY);
    if (raw == null) return PLAYER_BRIGHTNESS_DEFAULT;
    return clampPlayerBrightness(Number(raw));
  } catch {
    return PLAYER_BRIGHTNESS_DEFAULT;
  }
}

export function writeStoredPlayerBrightness(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYER_BRIGHTNESS_STORAGE_KEY, String(clampPlayerBrightness(value)));
  } catch {
    /* private mode / quota */
  }
}

export function hasNativePlayerBrightness(): boolean {
  return Boolean(bridge());
}

/**
 * On Android WebView: real window backlight (`LayoutParams.screenBrightness`).
 * In browser/PWA: CSS overlay fallback only (no device API).
 */
export function applyPlayerBrightness(value: number): {
  mode: PlayerBrightnessMode;
  value: number;
  native: boolean;
} {
  const next = clampPlayerBrightness(value);
  writeStoredPlayerBrightness(next);
  const api = bridge();
  if (api && callSetScreenBrightness(api, next)) {
    return { mode: "native", value: next, native: true };
  }
  return { mode: "overlay", value: next, native: false };
}

export function clearNativePlayerBrightness(): void {
  const api = bridge();
  const fn = api?.clearScreenBrightness;
  if (typeof fn !== "function") return;
  try {
    (fn as () => void).call(api);
  } catch {
    /* ignore */
  }
}

/** Black overlay opacity — only for browsers without the Android brightness bridge. */
export function playerBrightnessOverlayOpacity(value: number): number {
  const next = clampPlayerBrightness(value);
  return Math.min(0.92, Math.max(0, 1 - next));
}
