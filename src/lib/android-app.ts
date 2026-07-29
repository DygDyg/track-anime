/** Native Track Anime Android / Android TV WebView shell. */
export const TRACK_ANIME_ANDROID_UA_MARKER = "TrackAnimeAndroid/";
export const TRACK_ANIME_ANDROID_SETTINGS_URL = "trackanime://settings";

export type TrackAnimeAndroidBridge = {
  setScreenBrightness?: (value: number) => void;
  getScreenBrightness?: () => number;
  clearScreenBrightness?: () => void;
};

export function isTrackAnimeAndroidApp(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return new RegExp(`\\b${TRACK_ANIME_ANDROID_UA_MARKER}`).test(userAgent);
}

export function getTrackAnimeAndroidBridge(): TrackAnimeAndroidBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { TrackAnimeAndroid?: TrackAnimeAndroidBridge }).TrackAnimeAndroid;
  return bridge ?? null;
}
