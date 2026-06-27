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
] as const;

export type SiteFontFamily = (typeof SITE_FONT_IDS)[number];
export type SiteCursorStyle = "default" | "large" | "accent" | "retro";
export type SiteCardSize = "compact" | "normal" | "large";
export type SiteAccentPreset = "blue" | "purple" | "green" | "rose" | "amber";
export type SiteBackgroundDim = "none" | "light" | "medium" | "heavy";

/** null = показывать все озвучки; массив = только выбранные */
export type HomeTranslationFilter = null | string[];

/** null = все фоны в слайдшоу; массив = только выбранные URL; [] = без фона */
export type BackgroundSlideshowFilter = null | string[];

export const HOVER_TRAILER_DELAY_MIN_SEC = 1;
export const HOVER_TRAILER_DELAY_MAX_SEC = 15;
export const HOVER_TRAILER_DELAY_DEFAULT_SEC = 2;

export type SiteSettings = {
  fontFamily: SiteFontFamily;
  cursorStyle: SiteCursorStyle;
  cardSize: SiteCardSize;
  accentPreset: SiteAccentPreset;
  backgroundDim: SiteBackgroundDim;
  backgroundSlideshowFilter: BackgroundSlideshowFilter;
  reduceMotion: boolean;
  preferPosterOverScreenshot: boolean;
  showRelativeTime: boolean;
  homeTranslationFilter: HomeTranslationFilter;
  hoverTrailerEnabled: boolean;
  hoverTrailerDelaySec: number;
  /** Блок «Новое в вашей истории» на главной свёрнут по умолчанию */
  homeHistoryCollapsedByDefault: boolean;
  /** Отправлять текущий просмотр в Discord через локальный мост */
  discordPresenceEnabled: boolean;
  /** Показывать в Discord текущий раздел сайта (Главная, Календарь и т.д.) */
  discordPresenceShowSitePage: boolean;
  /** Кнопка «Открыть» в Discord с ссылкой на страницу */
  discordPresenceOpenButtonEnabled: boolean;
};

export const SITE_SETTINGS_STORAGE_KEY = "track-anime-site-settings";
export const HOME_HISTORY_COLLAPSED_STORAGE_KEY = "track-anime-home-history-collapsed";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  fontFamily: "inter",
  cursorStyle: "default",
  cardSize: "normal",
  accentPreset: "blue",
  backgroundDim: "medium",
  backgroundSlideshowFilter: null,
  reduceMotion: false,
  preferPosterOverScreenshot: false,
  showRelativeTime: true,
  homeTranslationFilter: null,
  hoverTrailerEnabled: true,
  hoverTrailerDelaySec: HOVER_TRAILER_DELAY_DEFAULT_SEC,
  homeHistoryCollapsedByDefault: false,
  discordPresenceEnabled: false,
  discordPresenceShowSitePage: false,
  discordPresenceOpenButtonEnabled: true,
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
];

export const SITE_CURSOR_OPTIONS: { id: SiteCursorStyle; label: string }[] = [
  { id: "default", label: "Стандартный" },
  { id: "large", label: "Крупный" },
  { id: "accent", label: "Акцентный" },
  { id: "retro", label: "Ретро" },
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

function parseBackgroundSlideshowFilter(value: unknown): BackgroundSlideshowFilter {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
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
      cursorStyle === "large" ||
      cursorStyle === "accent" ||
      cursorStyle === "retro" ||
      cursorStyle === "default"
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
    backgroundSlideshowFilter: parseBackgroundSlideshowFilter(raw.backgroundSlideshowFilter),
    reduceMotion: raw.reduceMotion === true,
    preferPosterOverScreenshot: raw.preferPosterOverScreenshot === true,
    showRelativeTime: raw.showRelativeTime !== false,
    homeTranslationFilter: parseHomeTranslationFilter(raw.homeTranslationFilter),
    hoverTrailerEnabled: raw.hoverTrailerEnabled !== false,
    hoverTrailerDelaySec: parseHoverTrailerDelaySec(raw.hoverTrailerDelaySec),
    homeHistoryCollapsedByDefault: raw.homeHistoryCollapsedByDefault === true,
    discordPresenceEnabled: raw.discordPresenceEnabled === true,
    discordPresenceShowSitePage: raw.discordPresenceShowSitePage === true,
    discordPresenceOpenButtonEnabled: raw.discordPresenceOpenButtonEnabled !== false,
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

export function resolveSlideshowBackgroundUrls(
  allUrls: string[],
  filter: BackgroundSlideshowFilter,
): string[] {
  if (filter === null) return allUrls;
  const allowed = new Set(filter);
  return allUrls.filter((url) => allowed.has(url));
}

export function backgroundSlideshowFilterSummary(
  filter: BackgroundSlideshowFilter,
  totalCount: number,
): string {
  if (totalCount === 0) return "Нет доступных фонов";
  if (filter === null) return `Все фоны (${totalCount})`;
  if (filter.length === 0) return "Слайдшоу отключено";
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

export const siteSettingsInitScript = `(function(){try{var k="${SITE_SETTINGS_STORAGE_KEY}";var d=JSON.parse(localStorage.getItem(k)||"{}");var el=document.documentElement;var f=d.fontFamily||"inter";var c=d.cursorStyle||"default";var s=d.cardSize||"normal";var a=d.accentPreset||"blue";var b=d.backgroundDim||"medium";var allowed=${JSON.stringify(SITE_FONT_IDS)};var cursors=${JSON.stringify(SITE_CURSOR_OPTIONS.map((item) => item.id))};if(allowed.indexOf(f)===-1)f="inter";if(cursors.indexOf(c)===-1)c="default";el.setAttribute("data-font",f);el.setAttribute("data-cursor",c);el.setAttribute("data-card-size",s);el.setAttribute("data-accent",a);el.setAttribute("data-bg-dim",b);if(d.reduceMotion===true)el.setAttribute("data-reduce-motion","true");}catch(e){}})();`;
