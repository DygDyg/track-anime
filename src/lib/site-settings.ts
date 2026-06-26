import { filterPopularTranslationNames } from "@/lib/translation-colors";

export const SITE_FONT_IDS = [
  "inter",
  "system",
  "inter-tight",
  "tektur",
  "fira-sans",
  "roboto-condensed",
  "pangolin",
  "morpheus",
  "propaniac",
  "tolkien",
] as const;

export type SiteFontFamily = (typeof SITE_FONT_IDS)[number];
export type SiteCursorStyle = "default" | "large" | "accent";
export type SiteCardSize = "compact" | "normal" | "large";
export type SiteAccentPreset = "blue" | "purple" | "green" | "rose" | "amber";
export type SiteBackgroundDim = "none" | "light" | "medium" | "heavy";

/** null = показывать все озвучки; массив = только выбранные */
export type HomeTranslationFilter = null | string[];

export const HOVER_TRAILER_DELAY_MIN_SEC = 1;
export const HOVER_TRAILER_DELAY_MAX_SEC = 15;
export const HOVER_TRAILER_DELAY_DEFAULT_SEC = 2;

export type SiteSettings = {
  fontFamily: SiteFontFamily;
  cursorStyle: SiteCursorStyle;
  cardSize: SiteCardSize;
  accentPreset: SiteAccentPreset;
  backgroundDim: SiteBackgroundDim;
  reduceMotion: boolean;
  preferPosterOverScreenshot: boolean;
  showRelativeTime: boolean;
  homeTranslationFilter: HomeTranslationFilter;
  hoverTrailerEnabled: boolean;
  hoverTrailerDelaySec: number;
  /** Блок «Новое в вашей истории» на главной свёрнут по умолчанию */
  homeHistoryCollapsedByDefault: boolean;
};

export const SITE_SETTINGS_STORAGE_KEY = "track-anime-site-settings";
export const HOME_HISTORY_COLLAPSED_STORAGE_KEY = "track-anime-home-history-collapsed";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  fontFamily: "inter",
  cursorStyle: "default",
  cardSize: "normal",
  accentPreset: "blue",
  backgroundDim: "medium",
  reduceMotion: false,
  preferPosterOverScreenshot: false,
  showRelativeTime: true,
  homeTranslationFilter: null,
  hoverTrailerEnabled: true,
  hoverTrailerDelaySec: HOVER_TRAILER_DELAY_DEFAULT_SEC,
  homeHistoryCollapsedByDefault: false,
};

export const SITE_FONT_OPTIONS: { id: SiteFontFamily; label: string }[] = [
  { id: "inter", label: "Inter" },
  { id: "system", label: "Системный" },
  { id: "inter-tight", label: "Inter Tight" },
  { id: "tektur", label: "Tektur" },
  { id: "fira-sans", label: "Fira Sans" },
  { id: "roboto-condensed", label: "Roboto Condensed" },
  { id: "pangolin", label: "Pangolin" },
  { id: "morpheus", label: "Morpheus" },
  { id: "propaniac", label: "Propaniac" },
  { id: "tolkien", label: "Tolkien" },
];

export const SITE_CURSOR_OPTIONS: { id: SiteCursorStyle; label: string }[] = [
  { id: "default", label: "Стандартный" },
  { id: "large", label: "Крупный" },
  { id: "accent", label: "Акцентный" },
];

export const SITE_CARD_SIZE_OPTIONS: { id: SiteCardSize; label: string; hint: string }[] = [
  { id: "compact", label: "Компактные", hint: "Больше карточек в ряд" },
  { id: "normal", label: "Обычные", hint: "Баланс размера и плотности" },
  { id: "large", label: "Крупные", hint: "Крупные постеры и текст" },
];

export const SITE_ACCENT_OPTIONS: { id: SiteAccentPreset; label: string; swatch: string }[] = [
  { id: "blue", label: "Синий", swatch: "#6c8cff" },
  { id: "purple", label: "Фиолетовый", swatch: "#a78bfa" },
  { id: "green", label: "Зелёный", swatch: "#34d399" },
  { id: "rose", label: "Розовый", swatch: "#fb7185" },
  { id: "amber", label: "Янтарный", swatch: "#fbbf24" },
];

export const SITE_BG_DIM_OPTIONS: { id: SiteBackgroundDim; label: string }[] = [
  { id: "none", label: "Без затемнения" },
  { id: "light", label: "Лёгкое" },
  { id: "medium", label: "Среднее" },
  { id: "heavy", label: "Сильное" },
];

const SITE_FONT_ID_SET = new Set<string>(SITE_FONT_IDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseHomeTranslationFilter(value: unknown): HomeTranslationFilter {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseFontFamily(value: unknown): SiteFontFamily {
  if (typeof value === "string" && SITE_FONT_ID_SET.has(value)) {
    return value as SiteFontFamily;
  }
  return DEFAULT_SITE_SETTINGS.fontFamily;
}

function parseHoverTrailerDelaySec(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SITE_SETTINGS.hoverTrailerDelaySec;
  return Math.min(
    HOVER_TRAILER_DELAY_MAX_SEC,
    Math.max(HOVER_TRAILER_DELAY_MIN_SEC, Math.round(parsed)),
  );
}

export function normalizeSiteSettings(raw: unknown): SiteSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SITE_SETTINGS };

  const cursorStyle = raw.cursorStyle;
  const cardSize = raw.cardSize;
  const accentPreset = raw.accentPreset;
  const backgroundDim = raw.backgroundDim;

  return {
    fontFamily: parseFontFamily(raw.fontFamily),
    cursorStyle:
      cursorStyle === "large" || cursorStyle === "accent" || cursorStyle === "default"
        ? cursorStyle
        : DEFAULT_SITE_SETTINGS.cursorStyle,
    cardSize:
      cardSize === "compact" || cardSize === "normal" || cardSize === "large"
        ? cardSize
        : DEFAULT_SITE_SETTINGS.cardSize,
    accentPreset:
      accentPreset === "purple" ||
      accentPreset === "green" ||
      accentPreset === "rose" ||
      accentPreset === "amber" ||
      accentPreset === "blue"
        ? accentPreset
        : DEFAULT_SITE_SETTINGS.accentPreset,
    backgroundDim:
      backgroundDim === "none" ||
      backgroundDim === "light" ||
      backgroundDim === "heavy" ||
      backgroundDim === "medium"
        ? backgroundDim
        : DEFAULT_SITE_SETTINGS.backgroundDim,
    reduceMotion: raw.reduceMotion === true,
    preferPosterOverScreenshot: raw.preferPosterOverScreenshot === true,
    showRelativeTime: raw.showRelativeTime !== false,
    homeTranslationFilter: parseHomeTranslationFilter(raw.homeTranslationFilter),
    hoverTrailerEnabled: raw.hoverTrailerEnabled !== false,
    hoverTrailerDelaySec: parseHoverTrailerDelaySec(raw.hoverTrailerDelaySec),
    homeHistoryCollapsedByDefault: raw.homeHistoryCollapsedByDefault === true,
  };
}

export function readStoredSiteSettings(): SiteSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SITE_SETTINGS };
  try {
    const raw = localStorage.getItem(SITE_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SITE_SETTINGS };
    const parsed = JSON.parse(raw);
    // Validate font family from localStorage
    if (parsed.fontFamily && !SITE_FONT_IDS.includes(parsed.fontFamily)) {
      parsed.fontFamily = "inter"; // fallback to default
    }
    return normalizeSiteSettings(parsed);
  } catch {
    return { ...DEFAULT_SITE_SETTINGS };
  }
}

export function applySiteSettings(settings: SiteSettings): void {
  const root = document.documentElement;
  root.setAttribute("data-font", settings.fontFamily);
  root.setAttribute("data-cursor", settings.cursorStyle);
  root.setAttribute("data-card-size", settings.cardSize);
  root.setAttribute("data-accent", settings.accentPreset);
  root.setAttribute("data-bg-dim", settings.backgroundDim);
  if (settings.reduceMotion) {
    root.setAttribute("data-reduce-motion", "true");
  } else {
    root.removeAttribute("data-reduce-motion");
  }
  localStorage.setItem(SITE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function isHomeTranslationVisible(
  translationName: string,
  filter: HomeTranslationFilter,
): boolean {
  if (filter === null) return true;
  return filter.includes(translationName);
}

export function homeTranslationFilterSummary(
  filter: HomeTranslationFilter,
  totalCount: number,
): string {
  if (filter === null) return `Все озвучки (${totalCount})`;
  if (filter.length === 0) return `Не выбрано ни одной из ${totalCount}`;
  return `Выбрано ${filter.length} из ${totalCount}`;
}

/** Выбрать только популярные озвучки из полного списка; null = все популярные покрывают каталог */
export function buildPopularHomeTranslationFilter(allNames: string[]): HomeTranslationFilter {
  if (allNames.length === 0) return null;
  const popular = filterPopularTranslationNames(allNames);
  if (popular.length === 0) return [];
  if (popular.length >= allNames.length) return null;
  return popular;
}

export function readHomeHistoryCollapsed(defaultCollapsed: boolean): boolean {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    const raw = localStorage.getItem(HOME_HISTORY_COLLAPSED_STORAGE_KEY);
    if (raw === null) return defaultCollapsed;
    return raw === "true";
  } catch {
    return defaultCollapsed;
  }
}

export function writeHomeHistoryCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOME_HISTORY_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export const siteSettingsInitScript = `(function(){try{var k="${SITE_SETTINGS_STORAGE_KEY}";var d=JSON.parse(localStorage.getItem(k)||"{}");var el=document.documentElement;var f=d.fontFamily||"inter";var c=d.cursorStyle||"default";var s=d.cardSize||"normal";var a=d.accentPreset||"blue";var b=d.backgroundDim||"medium";var allowed=${JSON.stringify(SITE_FONT_IDS)};if(allowed.indexOf(f)===-1)f="inter";el.setAttribute("data-font",f);el.setAttribute("data-cursor",c);el.setAttribute("data-card-size",s);el.setAttribute("data-accent",a);el.setAttribute("data-bg-dim",b);if(d.reduceMotion===true)el.setAttribute("data-reduce-motion","true");}catch(e){}})();`;
