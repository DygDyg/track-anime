/** Native Track Anime Android / Android TV WebView shell. */
export const TRACK_ANIME_ANDROID_UA_MARKER = "TrackAnimeAndroid/";
export const TRACK_ANIME_ANDROID_SETTINGS_URL = "trackanime://settings";

export function isTrackAnimeAndroidApp(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return new RegExp(`\\b${TRACK_ANIME_ANDROID_UA_MARKER}`).test(userAgent);
}
