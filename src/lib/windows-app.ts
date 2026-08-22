/** Native Track Anime Windows WebView2 shell. */
export const TRACK_ANIME_WINDOWS_UA_MARKER = "TrackAnimeWindows/";
export const TRACK_ANIME_WINDOWS_SETTINGS_URL = "trackanime://settings";

export type TrackAnimeWindowsBridge = {
  setScreenBrightness?: (value: number) => void;
  getScreenBrightness?: () => number;
  clearScreenBrightness?: () => void;
  setKeepScreenOn?: (enabled: boolean) => void;
  hasScreenBrightnessControl?: () => boolean;
};

export function isTrackAnimeWindowsApp(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return new RegExp(`\\b${TRACK_ANIME_WINDOWS_UA_MARKER}`).test(userAgent);
}

export function getTrackAnimeWindowsBridge(): TrackAnimeWindowsBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { TrackAnimeWindows?: TrackAnimeWindowsBridge }).TrackAnimeWindows;
  return bridge ?? null;
}

export function isTrackAnimeNativeShell(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  // Lazy import avoided — Android marker is inlined to keep this helper sync and tiny.
  return isTrackAnimeWindowsApp(userAgent) || /\bTrackAnimeAndroid\//.test(userAgent);
}
