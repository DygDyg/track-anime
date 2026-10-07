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
  /** Client Hints model (Chrome Android), e.g. "Pixel 7" / "SM-S911B" */
  model?: string;
  mobile?: boolean;
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

/** TrackAnimeAndroid/1 (Samsung; SM-S911B; Android 14) или legacy (Pixel 7; Android 14) */
function parseAndroidShellDevice(ua: string): {
  brand: string | null;
  model: string | null;
  androidVersion: string | null;
} {
  const withBrand = ua.match(
    /TrackAnimeAndroid\/\S+\s+\(([^;]+);\s*([^;]+);\s*Android\s+([^)]+)\)/i,
  );
  if (withBrand) {
    return {
      brand: withBrand[1]?.trim() || null,
      model: withBrand[2]?.trim() || null,
      androidVersion: withBrand[3]?.trim() || null,
    };
  }
  const legacy = ua.match(/TrackAnimeAndroid\/\S+\s+\(([^;]+);\s*Android\s+([^)]+)\)/i);
  if (legacy) {
    return {
      brand: null,
      model: legacy[1]?.trim() || null,
      androidVersion: legacy[2]?.trim() || null,
    };
  }
  return { brand: null, model: null, androidVersion: null };
}

/** Угадать бренд по коду модели / подстроке (браузер без APK). */
function inferBrandFromModel(model: string): string | null {
  const m = model.trim();
  if (!m) return null;
  if (/^SM-|^SAMSUNG\b|Galaxy/i.test(m)) return "Samsung";
  if (/^Pixel\b/i.test(m)) return "Google";
  if (/^(Redmi|POCO|Mi\s|Xiaomi|Black Shark)/i.test(m)) return "Xiaomi";
  if (/^Moto|^XT\d/i.test(m)) return "Motorola";
  if (/^(CPH|OPPO)/i.test(m)) return "OPPO";
  if (/^(V\d{4}|vivo)/i.test(m)) return "vivo";
  if (/^(RMX|Realme)/i.test(m)) return "Realme";
  if (/^(ONEPLUS|ONEPLUS)/i.test(m) || /^LE\d|^KB\d|^NE\d/i.test(m)) return "OnePlus";
  if (/^(HUAWEI|Honor|ANA-|ELS-|NOH-|LIO-|BRT-)/i.test(m)) return /Honor/i.test(m) ? "Honor" : "HUAWEI";
  if (/^Nokia/i.test(m)) return "Nokia";
  if (/^(LM-|LGE|LG-)/i.test(m)) return "LG";
  if (/^(SO-|Sony|Xperia)/i.test(m)) return "Sony";
  if (/^(ASUS_|ZenFone)/i.test(m)) return "ASUS";
  if (/^TECNO/i.test(m)) return "TECNO";
  if (/^Infinix/i.test(m)) return "Infinix";
  if (/^iPhone/i.test(m)) return "Apple";
  if (/^iPad/i.test(m)) return "Apple";
  return null;
}

function formatDeviceLabel(parts: {
  brand?: string | null;
  model?: string | null;
  androidVersion?: string | null;
}): string | null {
  const brand = parts.brand?.trim() || null;
  let model = parts.model?.trim() || null;
  if (!brand && !model) return null;

  if (brand && model) {
    const bl = brand.toLowerCase();
    const ml = model.toLowerCase();
    if (ml === bl || ml.startsWith(`${bl} `)) {
      // model already includes brand
    } else {
      model = `${brand} ${model}`;
    }
  } else if (brand && !model) {
    model = brand;
  }

  if (!model) return null;
  if (parts.androidVersion) return `${model} · Android ${parts.androidVersion}`;
  return model;
}

function pickDeviceLabel(
  ua: string,
  clientKind: AnalyticsClientKind,
  hints?: ClientHintsInput,
): string | null {
  const hintModel = hints?.model?.trim();
  if (hintModel && hintModel !== "K" && !/^(Unknown|Generic|null|undefined)$/i.test(hintModel)) {
    const inferred = inferBrandFromModel(hintModel);
    if (clientKind === "android_apk" || clientKind === "android_tv") {
      const shell = parseAndroidShellDevice(ua);
      return formatDeviceLabel({
        brand: shell.brand || inferred,
        model: hintModel,
        androidVersion: shell.androidVersion,
      });
    }
    if (hints?.mobile || /Android|iPhone|iPad|Mobile/i.test(ua) || clientKind === "pwa") {
      return formatDeviceLabel({ brand: inferred, model: hintModel });
    }
  }

  if (clientKind === "android_apk" || clientKind === "android_tv") {
    const shell = parseAndroidShellDevice(ua);
    if (shell.model || shell.brand) {
      return formatDeviceLabel({
        brand: shell.brand || inferBrandFromModel(shell.model ?? ""),
        model: shell.model,
        androidVersion: shell.androidVersion,
      });
    }
  }

  if (/iPhone/i.test(ua)) return formatDeviceLabel({ brand: "Apple", model: "iPhone" });
  if (/iPad/i.test(ua)) return formatDeviceLabel({ brand: "Apple", model: "iPad" });
  if (/Android/i.test(ua)) {
    // Часто модель недоступна: "Linux; Android 14; K" или "...; SM-S911B"
    const m = ua.match(/Android[^;]*;\s*([^;)]+)\)?/i);
    const raw = m?.[1]?.trim();
    if (!raw) return "Android (модель неизвестна)";
    if (/^(Mobile|wv|K)$/i.test(raw)) return "Android (модель неизвестна)";
    if (
      /^[A-Z]{2,}-[A-Z0-9]+$/i.test(raw) ||
      /Pixel|Galaxy|Redmi|POCO|Xiaomi|OnePlus|HUAWEI|Honor|moto|Nokia|Realme|OPPO|vivo/i.test(raw)
    ) {
      return formatDeviceLabel({ brand: inferBrandFromModel(raw), model: raw });
    }
    if (raw.length >= 3 && raw.length <= 64 && !/\s{2,}/.test(raw)) {
      return formatDeviceLabel({ brand: inferBrandFromModel(raw), model: raw });
    }
    return "Android (модель неизвестна)";
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

/**
 * Поисковые / SEO / headless-боты по User-Agent.
 * Классические краулеры JS обычно не выполняют — beacon и так их почти не видит;
 * это отсекает headless и «браузероподобные» боты.
 */
const ANALYTICS_BOT_UA_RE =
  /bot|crawler|spider|crawling|slurp|bingpreview|preview\/|headless|phantomjs|selenium|puppeteer|playwright|scrapy|httpclient|python-requests|go-http-client|libwww|wget|curl\/|aiohttp|http\.rb|okhttp|java\/|php\/|wordpress|monitor|uptime|pingdom|statuscake|siteaudit|semrush|ahrefs|majestic|moz\.com|screaming frog|lighthouse|chrome-lighthouse|pagespeed|gtmetrix|facebookexternalhit|facebot|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|applebot|duckduckbot|yandex(?:bot|images|metrika|mobile|screenshot)|googlebot|google-inspectiontool|adsbot-google|mediapartners-google|apis-google|storebot|bytespider|petalbot|baiduspider|sogou|exabot|ia_archiver|archive\.org|ia_archiver|mj12bot|dotbot|rogerbot|seznambot|qwantify|duckduckgo-favicons|proximic|embedly|quora link|outbrain|pinterest|redditbot|slackbot|vkshare|bitlybot|flipboard|tumblr|yahoo!|msnbot|adidxbot|bingbot|duckduckbot/i;

export function isAnalyticsBotUserAgent(uaRaw: string | null | undefined): boolean {
  const ua = (uaRaw ?? "").trim();
  if (!ua || ua === "unknown") return true;
  if (ua.length < 12) return true;
  // Наши оболочки — не боты
  if (new RegExp(`\\b${TRACK_ANIME_ANDROID_UA_MARKER}`).test(ua)) return false;
  if (new RegExp(`\\b${TRACK_ANIME_WINDOWS_UA_MARKER}`).test(ua)) return false;
  return ANALYTICS_BOT_UA_RE.test(ua);
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
    deviceLabel: pickDeviceLabel(ua, clientKind, hints),
    uaHash: hashUa(ua),
  };
}

/** Телефон/планшет/APK с распознанной (или неизвестной) моделью — для статистики. */
export function isPhoneLikeDevice(params: {
  deviceLabel: string | null | undefined;
  clientKind: string | null | undefined;
  os: string | null | undefined;
}): boolean {
  const label = params.deviceLabel?.trim() ?? "";
  const kind = params.clientKind ?? "";
  const os = params.os ?? "";
  if (kind === "android_apk" || kind === "android_tv") return true;
  if (!label) return false;
  if (/^Windows app$/i.test(label)) return false;
  if (/iPhone|iPad|Android/i.test(label)) return true;
  if (/^Android|^iOS/i.test(os)) return true;
  return false;
}

export type ContentSection =
  | "home"
  | "anime"
  | "anime_play"
  | "anime_play_kodik"
  | "anime_play_cvh"
  | "favorites"
  | "history"
  | "search"
  | "calendar"
  | "login"
  | "app"
  | "other";

/** Плеер при реальном старте воспроизведения (аналитика). */
export type AnalyticsPlayerKind = "kodik" | "cvh";

export function analyticsPlaySectionForPlayer(player: AnalyticsPlayerKind): ContentSection {
  return player === "cvh" ? "anime_play_cvh" : "anime_play_kodik";
}

export function parseAnalyticsPlayerKind(raw: unknown): AnalyticsPlayerKind | null {
  if (raw === "kodik" || raw === "cvh") return raw;
  return null;
}

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

  if (normalized.startsWith("/favorites") || /^\/user\/\d+\/favorites/.test(normalized)) {
    return { section: "favorites", shikimoriId: 0, shouldTrack: true };
  }
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
