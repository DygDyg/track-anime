import { getTrackAnimeWindowsBridge } from "@/lib/windows-app";

/** Native Track Anime Android / Android TV WebView shell. */
export const TRACK_ANIME_ANDROID_UA_MARKER = "TrackAnimeAndroid/";
export const TRACK_ANIME_ANDROID_SETTINGS_URL = "trackanime://settings";

export type AndroidNativePlayerTranslation = {
  kodikId: string;
  title: string;
  type?: string;
};

export type AndroidNativePlayerPayload = {
  baseUrl: string;
  shikimoriId: number;
  title: string;
  posterUrl?: string;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds?: number;
  autoplay?: boolean;
  autoSkip?: boolean;
  translations: AndroidNativePlayerTranslation[];
};

export type TrackAnimeAndroidBridge = {
  setScreenBrightness?: (value: number) => void;
  getScreenBrightness?: () => number;
  clearScreenBrightness?: () => void;
  hasScreenBrightnessControl?: () => boolean;
  setStreamVolume?: (value: number) => void;
  getStreamVolume?: () => number;
  hasStreamVolumeControl?: () => boolean;
  setKeepScreenOn?: (enabled: boolean) => void;
  hasFcmSupport?: () => boolean;
  areNotificationsEnabled?: () => boolean;
  requestNotificationPermission?: () => void;
  requestFcmToken?: () => void;
  /** Prefs: native Media3 TA Plus player (shell settings). */
  isNativePlayerEnabled?: () => boolean;
  /** Open PlayerActivity with JSON payload. */
  openNativePlayer?: (json: string) => void;
  /** Android TV Watch Next (Continue watching). No-op on phone shell. */
  publishWatchNext?: (json: string) => void;
  removeWatchNext?: (shikimoriId: number) => void;
  clearWatchNext?: () => void;
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

/** Shell setting «Нативный (TA Plus)» — read live from bridge prefs. */
export function isAndroidNativePlayerEnabled(): boolean {
  if (!isTrackAnimeAndroidApp()) return false;
  const bridge = getTrackAnimeAndroidBridge();
  const fn = bridge?.isNativePlayerEnabled;
  if (fn == null) return false;
  try {
    return Boolean((fn as () => boolean).call(bridge));
  } catch {
    return false;
  }
}

export function openAndroidNativePlayer(payload: AndroidNativePlayerPayload): boolean {
  if (!isTrackAnimeAndroidApp()) return false;
  const bridge = getTrackAnimeAndroidBridge();
  const fn = bridge?.openNativePlayer;
  if (fn == null) return false;
  try {
    (fn as (json: string) => void).call(bridge, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
