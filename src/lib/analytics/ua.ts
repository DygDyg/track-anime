import { createHash } from "crypto";
import { TRACK_ANIME_ANDROID_UA_MARKER } from "@/lib/android-app";
import { TRACK_ANIME_WINDOWS_UA_MARKER } from "@/lib/windows-app";

export type AnalyticsClientKind = "web" | "pwa" | "android_apk" | "windows_app" | "android_tv";

export type ParsedUserAgent = {
  clientKind: AnalyticsClientKind;
  os: string;
  browser: string;
  deviceLabel: string | null;
  uaHash: string;
};

export type ClientHintsInput = {
  isPwa?: boolean;
  isTv?: boolean;
};

function hashUa(ua: string): string {
  return createHash("sha256").update(ua).digest("hex").slice(0, 16);
}

function pickOs(ua: string): string {
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s+([\d._]+)/i);
    return m ? `Android ${m[1].replace(/_/g, ".")}` : "Android";
  }
  if (/Windows NT 10/i.test(ua)) return "Windows 10+";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const m = ua.match(/OS\s+([\d_]+)/i);
    return m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
  }
  if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X\s+([\d_]+)/i);
    return m ? `macOS ${m[1].replace(/_/g, ".")}` : "macOS";
  }
  if (/CrOS/i.test(ua)) return "Chrome OS";
  if (/Linux/i.test(ua)) return "Linux";
  return "unknown";
}

function pickBrowser(ua: string): string {
  if (new RegExp(`\\b${TRACK_ANIME_ANDROID_UA_MARKER}`).test(ua)) return "TrackAnime Android";
  if (new RegExp(`\\b${TRACK_ANIME_WINDOWS_UA_MARKER}`).test(ua)) return "TrackAnime Windows";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/SamsungBrowser\//i.test(ua)) return "Samsung Internet";
  if (/YaBrowser\//i.test(ua)) return "Yandex";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/CriOS\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/CriOS\//i.test(ua)) return "Safari";
  return "unknown";
}

/** TrackAnimeAndroid/1 (Pixel 7; Android 14) */
function parseAndroidShellDevice(ua: string): { model: string | null; androidVersion: string | null } {
  const m = ua.match(/TrackAnimeAndroid\/\S+\s+\(([^;]+);\s*Android\s+([^)]+)\)/i);
  if (!m) return { model: null, androidVersion: null };
  return {
    model: m[1]?.trim() || null,
    androidVersion: m[2]?.trim() || null,
  };
}

function pickDeviceLabel(ua: string, clientKind: AnalyticsClientKind): string | null {
  if (clientKind === "android_apk" || clientKind === "android_tv") {
    const shell = parseAndroidShellDevice(ua);
    if (shell.model) {
      return shell.androidVersion ? `${shell.model} · Android ${shell.androidVersion}` : shell.model;
    }
  }

  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    // Часто модель недоступна: "Linux; Android 14; K" или "...; SM-S911B"
    const m = ua.match(/Android[^;]*;\s*([^;)]+)\)/i);
    const raw = m?.[1]?.trim();
    if (!raw) return "Android";
    if (/^(Mobile|wv|K)$/i.test(raw)) return "Android";
    if (/^[A-Z]{2,}-[A-Z0-9]+$/i.test(raw) || /Pixel|Galaxy|Redmi|POCO|Xiaomi|OnePlus|HUAWEI|Honor/i.test(raw)) {
      return raw;
    }
    return "Android";
  }
  if (clientKind === "windows_app") return "Windows app";
  return null;
}

function pickClientKind(ua: string, hints?: ClientHintsInput): AnalyticsClientKind {
  if (new RegExp(`\\b${TRACK_ANIME_WINDOWS_UA_MARKER}`).test(ua)) return "windows_app";
  if (new RegExp(`\\b${TRACK_ANIME_ANDROID_UA_MARKER}`).test(ua)) {
    if (hints?.isTv) return "android_tv";
    // Heuristic: Android TV often has "TV" / "Android TV" in UA
    if (/\bTV\b|Android TV|AFT[A-Z0-9]|BRAVIA|MIBOX/i.test(ua)) return "android_tv";
    return "android_apk";
  }
  if (hints?.isPwa) return "pwa";
  return "web";
}

export function parseUserAgent(uaRaw: string | null | undefined, hints?: ClientHintsInput): ParsedUserAgent {
  const ua = (uaRaw ?? "").trim() || "unknown";
  const clientKind = pickClientKind(ua, hints);
  let os = pickOs(ua);

  if (clientKind === "android_apk" || clientKind === "android_tv") {
    const shell = parseAndroidShellDevice(ua);
    if (shell.androidVersion) os = `Android ${shell.androidVersion}`;
  }

  return {
    clientKind,
    os,
    browser: pickBrowser(ua),
    deviceLabel: pickDeviceLabel(ua, clientKind),
    uaHash: hashUa(ua),
  };
}

export type ContentSection =
  | "home"
  | "anime"
  | "favorites"
  | "history"
  | "search"
  | "calendar"
  | "login"
  | "app"
  | "other";

export type ParsedPath = {
  section: ContentSection;
  shikimoriId: number;
  shouldTrack: boolean;
};

export function parseAnalyticsPath(pathRaw: string | null | undefined): ParsedPath {
  const path = (pathRaw ?? "/").trim() || "/";
  const normalized = path.split("?")[0]?.split("#")[0] || "/";

  if (normalized.startsWith("/admin") || normalized.startsWith("/api")) {
    return { section: "other", shikimoriId: 0, shouldTrack: false };
  }

  if (normalized === "/" || normalized === "") {
    return { section: "home", shikimoriId: 0, shouldTrack: true };
  }

  const animeMatch = normalized.match(/^\/anime\/(\d+)(?:\/|$)/);
  if (animeMatch) {
    const id = Number(animeMatch[1]);
    return {
      section: "anime",
      shikimoriId: Number.isFinite(id) && id > 0 ? id : 0,
      shouldTrack: true,
    };
  }

  if (normalized.startsWith("/favorites")) return { section: "favorites", shikimoriId: 0, shouldTrack: true };
  if (normalized.startsWith("/history")) return { section: "history", shikimoriId: 0, shouldTrack: true };
  if (normalized.startsWith("/search")) return { section: "search", shikimoriId: 0, shouldTrack: true };
  if (normalized.startsWith("/calendar")) return { section: "calendar", shikimoriId: 0, shouldTrack: true };
  if (normalized.startsWith("/login")) return { section: "login", shikimoriId: 0, shouldTrack: true };
  if (normalized.startsWith("/app")) return { section: "app", shikimoriId: 0, shouldTrack: true };

  return { section: "other", shikimoriId: 0, shouldTrack: true };
}

export function identityKeyFor(userId: string | null | undefined, visitorKey: string): string {
  if (userId) return `u:${userId}`;
  return `v:${visitorKey}`;
}

export function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
