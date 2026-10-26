import { getTrackAnimeWindowsBridge } from "@/lib/windows-app";
import {
  resolveTranslationColors,
  resolveTranslationStudioId,
} from "@/lib/translation-colors";

/** Native Track Anime Android / Android TV WebView shell. */
export const TRACK_ANIME_ANDROID_UA_MARKER = "TrackAnimeAndroid/";
export const TRACK_ANIME_ANDROID_SETTINGS_URL = "trackanime://settings";

/** Convert CSS rgb/rgba to #AARRGGBB for Android Color.parseColor. */
export function cssColorToArgbHex(css: string): string | undefined {
  const m = css.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!m) return undefined;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] != null ? Math.round(Math.max(0, Math.min(1, Number(m[4]))) * 255) : 255;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(a)}${hex(r)}${hex(g)}${hex(b)}`;
}

export type AndroidNativePlayerTranslation = {
  kodikId: string;
  title: string;
  type?: string;
  studioId?: string;
  /** #AARRGGBB */
  bg?: string;
  text?: string;
  border?: string;
  bgActive?: string;
};

export type AndroidNativePlayerSource = "continue" | "watch" | "episode" | "deep-link";

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
  /** User already confirmed Continue on the site — seek immediately. */
  suppressContinuePrompt?: boolean;
  source?: AndroidNativePlayerSource;
  translations: AndroidNativePlayerTranslation[];
};

export type AndroidNativePlayerClosedPayload = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
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

export function buildAndroidNativeTranslations(
  playable: Array<{ kodikId: string; translationTitle: string; translationType: string }>,
): AndroidNativePlayerTranslation[] {
  return playable.map((tr) => {
    const colors = resolveTranslationColors(tr.translationTitle, "dark");
    return {
      kodikId: tr.kodikId,
      title: tr.translationTitle,
      type: tr.translationType,
      studioId: resolveTranslationStudioId(tr.translationTitle) ?? undefined,
      bg: colors ? cssColorToArgbHex(colors.bg) : undefined,
      text: colors ? cssColorToArgbHex(colors.text) : undefined,
      border: colors ? cssColorToArgbHex(colors.border) : undefined,
      bgActive: colors ? cssColorToArgbHex(colors.bgActive) : undefined,
    };
  });
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

/** Install callback invoked when native PlayerActivity finishes. */
export function installAndroidNativePlayerClosedHandler(
  handler: (payload: AndroidNativePlayerClosedPayload) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const win = window as Window & {
    __taOnNativePlayerClosed?: (json: string) => void;
  };
  win.__taOnNativePlayerClosed = (json: string) => {
    try {
      const parsed = JSON.parse(json) as AndroidNativePlayerClosedPayload;
      if (!parsed || !Number.isFinite(parsed.shikimoriId)) return;
      handler(parsed);
    } catch {
      /* ignore */
    }
  };
  return () => {
    if (win.__taOnNativePlayerClosed) delete win.__taOnNativePlayerClosed;
  };
}
