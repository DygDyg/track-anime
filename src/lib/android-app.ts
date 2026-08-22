import { getTrackAnimeWindowsBridge } from "@/lib/windows-app";

/** Native Track Anime Android / Android TV WebView shell. */
export const TRACK_ANIME_ANDROID_UA_MARKER = "TrackAnimeAndroid/";
export const TRACK_ANIME_ANDROID_SETTINGS_URL = "trackanime://settings";

export type TrackAnimeAndroidBridge = {
  setScreenBrightness?: (value: number) => void;
  getScreenBrightness?: () => number;
  clearScreenBrightness?: () => void;
  setKeepScreenOn?: (enabled: boolean) => void;
};

export function isTrackAnimeAndroidApp(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return new RegExp(`\\b${TRACK_ANIME_ANDROID_UA_MARKER}`).test(userAgent);
}

export function getTrackAnimeAndroidBridge(): TrackAnimeAndroidBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { TrackAnimeAndroid?: TrackAnimeAndroidBridge }).TrackAnimeAndroid;
  return bridge ?? null;
}

/** Keep device screen awake while video plays inside a native WebView shell. */
export function setAndroidKeepScreenOn(enabled: boolean): void {
  const bridge = getTrackAnimeAndroidBridge() ?? getTrackAnimeWindowsBridge();
  const fn = bridge?.setKeepScreenOn;
  // Native WebView may expose methods without typeof === "function".
  if (fn == null) return;
  try {
    (fn as (enabled: boolean) => void).call(bridge, enabled);
  } catch {
    /* ignore */
  }
}
