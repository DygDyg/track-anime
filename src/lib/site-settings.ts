import { parseAnimeScore } from "@/lib/anime-score";
import { normalizeAvatarDecorationId } from "@/lib/avatar-decorations";
import {
  parsePatternBackgroundId,
  patternBackgroundLabel,
} from "@/lib/pattern-backgrounds";
import { filterPopularTranslationNames } from "@/lib/translation-colors";
import {
  parseTranslationIntroOffsets,
  type TranslationIntroOffsets,
} from "@/lib/translation-intro-offset";

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

/** Фильтр статуса на главной: всё / онгоинги (+анонсы) / вышедшие */
export type HomeStatusFilter = "all" | "ongoing" | "released";

export function matchesHomeStatusFilter(
  status: string | null | undefined,
  filter: HomeStatusFilter,
): boolean {
  if (filter === "all") return true;
  const normalized = (status ?? "").trim().toLowerCase();
  if (filter === "ongoing") return normalized === "ongoing" || normalized === "anons";
  return normalized === "released";
}

/** Нет отображаемого рейтинга: пустой score или ≤0 (как у AnimeScoreBadge). */
export function isEmptyOrZeroHomeScore(score: string | null | undefined): boolean {
  return parseAnimeScore(score) == null;
}

/** Видимость карточки на главной с учётом hideZeroScoreOnHome. */
export function isHomeScoreVisible(
  score: string | null | undefined,
  hideEmptyScore: boolean,
): boolean {
  if (!hideEmptyScore) return true;
  return !isEmptyOrZeroHomeScore(score);
}

/** null = без фона; строка = URL выбранного изображения */
export type SiteBackgroundImageUrl = string | null;

export type AutoSkipTranslationIds = Record<string, true>;

export const HOVER_TRAILER_DELAY_MIN_SEC = 1;
export const HOVER_TRAILER_DELAY_MAX_SEC = 15;
export const HOVER_TRAILER_DELAY_DEFAULT_SEC = 2;

export const AVATAR_DECORATION_SCALE_MIN = 1;
export const AVATAR_DECORATION_SCALE_MAX = 2;
export const AVATAR_DECORATION_SCALE_DEFAULT = 1.08;
export const AVATAR_DECORATION_SCALE_STEP = 0.01;
export const COMPANION_SCALE_MIN = 0.5;
export const COMPANION_SCALE_MAX = 2;
export const COMPANION_SCALE_DEFAULT = 1;
export const COMPANION_SCALE_STEP = 0.05;
/** Atlas cell width used for layout offsets (CSS --aqua-companion-width). */
export const COMPANION_FRAME_WIDTH = 192;
/** On-screen multiplier: 1× in settings ≈ 1/2 of the raw 192×208 atlas. */
export const COMPANION_DISPLAY_BASE = 1 / 2;
export const BETA_HIDDEN_PROGRESS_OPACITY_MIN = 0;
export const BETA_HIDDEN_PROGRESS_OPACITY_MAX = 1;
export const BETA_HIDDEN_PROGRESS_OPACITY_DEFAULT = 1;
export const BETA_HIDDEN_PROGRESS_OPACITY_STEP = 0.05;
/** Толщина скрытой полосы прогресса TA-плеера (px). */
export const BETA_HIDDEN_PROGRESS_THICKNESS_MIN = 1;
export const BETA_HIDDEN_PROGRESS_THICKNESS_MAX = 12;
export const BETA_HIDDEN_PROGRESS_THICKNESS_DEFAULT = 4;
export const BETA_HIDDEN_PROGRESS_THICKNESS_STEP = 1;
/** Автоскрытие панели TA-плеера после бездействия (мс). У Kodik Flowplayer — 4000. */
export const PLAYER_CONTROLS_IDLE_MS_MIN = 1_000;
export const PLAYER_CONTROLS_IDLE_MS_MAX = 8_000;
export const PLAYER_CONTROLS_IDLE_MS_DEFAULT = 2_500;
export const PLAYER_CONTROLS_IDLE_MS_STEP = 100;

export type SiteSettings = {
  fontFamily: SiteFontFamily;
  cursorStyle: SiteCursorStyle;
  cardSize: SiteCardSize;
  accentPreset: SiteAccentPreset;
  backgroundDim: SiteBackgroundDim;
  backgroundImageUrl: SiteBackgroundImageUrl;
  reduceMotion: boolean;
  reduceAvatarDecorationMotion: boolean;
  preferPosterOverScreenshot: boolean;
  showRelativeTime: boolean;
  showClock: boolean;
  /** Скрывать на главной тайтлы без рейтинга (пустой score или ≤0) */
  hideZeroScoreOnHome: boolean;
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
  /** translationTitle → секунды пропуска интро; 0 или отсутствие = не задано */
  translationIntroOffsets: TranslationIntroOffsets;
  /** Украшение поверх аватарки; null = без украшения */
  avatarDecorationId: string | null;
  /** Масштаб украшения (1 = по размеру аватарки) */
  avatarDecorationScale: number;
  /** Использовать оригинальный legacy-плеер Kodik вместо основного TA-плеера */
  useLegacyKodikPlayer: boolean;
  /** Legacy: старый глобальный флаг автопропуска OP/ED */
  autoSkipOpeningsEndings: boolean;
  /** Kodik translationId -> автоматический пропуск найденных AniSkip OP/ED интервалов */
  autoSkipTranslationIds: AutoSkipTranslationIds;
  /** Видимость полосы прогресса, когда интерфейс TA-плеера скрыт; 0 = выключена */
  betaHiddenProgressOpacity: number;
  /** Толщина полосы прогресса при скрытом интерфейсе TA-плеера (px) */
  betaHiddenProgressThickness: number;
  /** Задержка автоскрытия UI TA-плеера при воспроизведении (мс) */
  playerControlsIdleMs: number;
  /** Локально для устройства: навигация стрелками по карточкам сайта */
  tvNavigationEnabled: boolean;
  /** Показывать companion Aqua Coder в правом нижнем углу */
  companionEnabled: boolean;
  /** Масштаб companion (1 = кадр 192×208) */
  companionScale: number;
  /** Без покадровой анимации: только первый кадр каждой позы */
  companionStaticAnimations: boolean;
};

export const SITE_SETTINGS_STORAGE_KEY = "track-anime-site-settings";
export const HOME_HISTORY_COLLAPSED_STORAGE_KEY = "track-anime-home-history-collapsed";
export const HOME_UPCOMING_SOON_COLLAPSED_STORAGE_KEY = "track-anime-home-upcoming-soon-collapsed";
export const HOME_STATUS_FILTER_STORAGE_KEY = "track-anime-home-status-filter";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  fontFamily: "inter",
  cursorStyle: "default",
  cardSize: "normal",
  accentPreset: "blue",
  backgroundDim: "medium",
  backgroundImageUrl: null,
  reduceMotion: false,
  reduceAvatarDecorationMotion: false,
  preferPosterOverScreenshot: false,
  showRelativeTime: true,
  showClock: false,
  hideZeroScoreOnHome: true,
  homeTranslationFilter: null,
  hoverTrailerEnabled: true,
  hoverTrailerDelaySec: HOVER_TRAILER_DELAY_DEFAULT_SEC,
  homeHistoryCollapsedByDefault: false,
  discordPresenceEnabled: false,
  discordPresenceShowSitePage: false,
  discordPresenceOpenButtonEnabled: true,
  translationIntroOffsets: {},
  avatarDecorationId: null,
  avatarDecorationScale: AVATAR_DECORATION_SCALE_DEFAULT,
  useLegacyKodikPlayer: false,
  autoSkipOpeningsEndings: false,
  autoSkipTranslationIds: {},
  betaHiddenProgressOpacity: BETA_HIDDEN_PROGRESS_OPACITY_DEFAULT,
  betaHiddenProgressThickness: BETA_HIDDEN_PROGRESS_THICKNESS_DEFAULT,
  playerControlsIdleMs: PLAYER_CONTROLS_IDLE_MS_DEFAULT,
  tvNavigationEnabled: true,
  companionEnabled: true,
  companionScale: COMPANION_SCALE_DEFAULT,
  companionStaticAnimations: false,
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

function parseBackgroundImageUrl(raw: Record<string, unknown>): SiteBackgroundImageUrl {
  if (raw.backgroundImageUrl === null) return null;
  if (typeof raw.backgroundImageUrl === "string") {
    // Только процедурные паттерны; старые фото-URL сбрасываем.
    return parsePatternBackgroundId(raw.backgroundImageUrl) ? raw.backgroundImageUrl : null;
  }

  return null;
}

function parseHoverTrailerDelaySec(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SITE_SETTINGS.hoverTrailerDelaySec;
  return Math.min(
    HOVER_TRAILER_DELAY_MAX_SEC,
    Math.max(HOVER_TRAILER_DELAY_MIN_SEC, Math.round(parsed)),
  );
}

export function normalizeAvatarDecorationScale(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return AVATAR_DECORATION_SCALE_DEFAULT;
  const stepped =
    Math.round(parsed / AVATAR_DECORATION_SCALE_STEP) * AVATAR_DECORATION_SCALE_STEP;
  return Math.min(
    AVATAR_DECORATION_SCALE_MAX,
    Math.max(AVATAR_DECORATION_SCALE_MIN, Math.round(stepped * 100) / 100),
  );
}

export function normalizeCompanionScale(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return COMPANION_SCALE_DEFAULT;
  const stepped = Math.round(parsed / COMPANION_SCALE_STEP) * COMPANION_SCALE_STEP;
  return Math.min(
    COMPANION_SCALE_MAX,
    Math.max(COMPANION_SCALE_MIN, Math.round(stepped * 100) / 100),
  );
}

/** Settings scale (1×) → canvas/CSS scale with display base applied. */
export function resolveCompanionDisplayScale(value: unknown): number {
  return normalizeCompanionScale(value) * COMPANION_DISPLAY_BASE;
}

function parseAutoSkipTranslationIds(value: unknown): AutoSkipTranslationIds {
  if (!isRecord(value)) return {};
  const result: AutoSkipTranslationIds = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled !== true) continue;
    const normalizedKey = key.trim();
    if (normalizedKey.length > 0) result[normalizedKey] = true;
  }
  return result;
}

function normalizeBetaHiddenProgressOpacity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return BETA_HIDDEN_PROGRESS_OPACITY_DEFAULT;
  const stepped =
    Math.round(parsed / BETA_HIDDEN_PROGRESS_OPACITY_STEP) *
    BETA_HIDDEN_PROGRESS_OPACITY_STEP;
  return Math.min(
    BETA_HIDDEN_PROGRESS_OPACITY_MAX,
    Math.max(BETA_HIDDEN_PROGRESS_OPACITY_MIN, Math.round(stepped * 100) / 100),
  );
}

function normalizeBetaHiddenProgressThickness(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return BETA_HIDDEN_PROGRESS_THICKNESS_DEFAULT;
  const stepped =
    Math.round(parsed / BETA_HIDDEN_PROGRESS_THICKNESS_STEP) *
    BETA_HIDDEN_PROGRESS_THICKNESS_STEP;
  return Math.min(
    BETA_HIDDEN_PROGRESS_THICKNESS_MAX,
    Math.max(BETA_HIDDEN_PROGRESS_THICKNESS_MIN, stepped),
  );
}

function normalizePlayerControlsIdleMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return PLAYER_CONTROLS_IDLE_MS_DEFAULT;
  const stepped =
    Math.round(parsed / PLAYER_CONTROLS_IDLE_MS_STEP) * PLAYER_CONTROLS_IDLE_MS_STEP;
  return Math.min(
    PLAYER_CONTROLS_IDLE_MS_MAX,
    Math.max(PLAYER_CONTROLS_IDLE_MS_MIN, stepped),
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
    backgroundImageUrl: parseBackgroundImageUrl(raw),
    reduceMotion: raw.reduceMotion === true,
    reduceAvatarDecorationMotion: raw.reduceAvatarDecorationMotion === true,
    preferPosterOverScreenshot: raw.preferPosterOverScreenshot === true,
    showRelativeTime: raw.showRelativeTime !== false,
    showClock: raw.showClock === true,
    hideZeroScoreOnHome: raw.hideZeroScoreOnHome !== false,
    homeTranslationFilter: parseHomeTranslationFilter(raw.homeTranslationFilter),
    hoverTrailerEnabled: raw.hoverTrailerEnabled !== false,
    hoverTrailerDelaySec: parseHoverTrailerDelaySec(raw.hoverTrailerDelaySec),
    homeHistoryCollapsedByDefault: raw.homeHistoryCollapsedByDefault === true,
    discordPresenceEnabled: raw.discordPresenceEnabled === true,
    discordPresenceShowSitePage: raw.discordPresenceShowSitePage === true,
    discordPresenceOpenButtonEnabled: raw.discordPresenceOpenButtonEnabled !== false,
    translationIntroOffsets: parseTranslationIntroOffsets(raw.translationIntroOffsets),
    avatarDecorationId: normalizeAvatarDecorationId(raw.avatarDecorationId),
    avatarDecorationScale: normalizeAvatarDecorationScale(raw.avatarDecorationScale),
    useLegacyKodikPlayer: raw.useLegacyKodikPlayer === true,
    autoSkipOpeningsEndings: raw.autoSkipOpeningsEndings === true,
    autoSkipTranslationIds: parseAutoSkipTranslationIds(raw.autoSkipTranslationIds),
    betaHiddenProgressOpacity: normalizeBetaHiddenProgressOpacity(raw.betaHiddenProgressOpacity),
    betaHiddenProgressThickness: normalizeBetaHiddenProgressThickness(
      raw.betaHiddenProgressThickness,
    ),
    playerControlsIdleMs: normalizePlayerControlsIdleMs(raw.playerControlsIdleMs),
    tvNavigationEnabled: raw.tvNavigationEnabled !== false,
    companionEnabled: raw.companionEnabled !== false,
    companionScale: normalizeCompanionScale(raw.companionScale),
    companionStaticAnimations: raw.companionStaticAnimations === true,
  };
}

export function readStoredSiteSettings(fallback: SiteSettings = DEFAULT_SITE_SETTINGS): SiteSettings {
  if (typeof window === "undefined") return { ...fallback };
  try {
    const raw = localStorage.getItem(SITE_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    if (parsed.fontFamily && !SITE_FONT_IDS.includes(parsed.fontFamily)) {
      parsed.fontFamily = "inter";
    }
    return normalizeSiteSettings(parsed);
  } catch {
    return { ...fallback };
  }
}
export function hasStoredSiteSettings(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SITE_SETTINGS_STORAGE_KEY) !== null;
}

export function buildSiteSettingsInitScript(defaults: SiteSettings): string {
  const fallback = JSON.stringify(defaults);
  return `(function(){try{var k="${SITE_SETTINGS_STORAGE_KEY}";var raw=localStorage.getItem(k);var d=raw?JSON.parse(raw):${fallback};var el=document.documentElement;var f=d.fontFamily||"inter";var c=d.cursorStyle||"default";var s=d.cardSize||"normal";var a=d.accentPreset||"blue";var b=d.backgroundDim||"medium";var bg=typeof d.backgroundImageUrl==="string"&&d.backgroundImageUrl.length>0;var allowed=${JSON.stringify(SITE_FONT_IDS)};var cursors=${JSON.stringify(SITE_CURSOR_OPTIONS.map((item) => item.id))};if(allowed.indexOf(f)===-1)f="inter";if(cursors.indexOf(c)===-1)c="default";el.setAttribute("data-font",f);el.setAttribute("data-cursor",c);el.setAttribute("data-card-size",s);el.setAttribute("data-accent",a);el.setAttribute("data-bg-dim",b);el.setAttribute("data-site-bg",bg?"true":"false");el.setAttribute("data-tv-nav-enabled",d.tvNavigationEnabled===false?"false":"true");if(d.tvNavigationEnabled===false)el.removeAttribute("data-tv-nav");if(d.reduceMotion===true)el.setAttribute("data-reduce-motion","true");else el.removeAttribute("data-reduce-motion");}catch(e){}})();`;
}

export const siteSettingsInitScript = buildSiteSettingsInitScript(DEFAULT_SITE_SETTINGS);

export function applySiteSettings(settings: SiteSettings): void {
  const root = document.documentElement;
  root.setAttribute("data-font", settings.fontFamily);
  root.setAttribute("data-cursor", settings.cursorStyle);
  root.setAttribute("data-card-size", settings.cardSize);
  root.setAttribute("data-accent", settings.accentPreset);
  root.setAttribute("data-bg-dim", settings.backgroundDim);
  root.setAttribute(
    "data-site-bg",
    settings.backgroundImageUrl && settings.backgroundImageUrl.length > 0 ? "true" : "false",
  );
  if (settings.reduceMotion) {
    root.setAttribute("data-reduce-motion", "true");
  } else {
    root.removeAttribute("data-reduce-motion");
  }
  root.setAttribute("data-tv-nav-enabled", settings.tvNavigationEnabled ? "true" : "false");
  if (!settings.tvNavigationEnabled) {
    root.removeAttribute("data-tv-nav");
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

export function backgroundImageSummary(
  selectedUrl: SiteBackgroundImageUrl,
  totalCount: number,
): string {
  if (totalCount === 0) return "Нет доступных фонов";
  if (!selectedUrl) return "Фон не выбран";
  const patternLabel = patternBackgroundLabel(selectedUrl);
  if (patternLabel) return `Паттерн: ${patternLabel}`;
  return "Выбран один фон";
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

export function readHomeUpcomingSoonCollapsed(defaultCollapsed: boolean): boolean {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    const raw = localStorage.getItem(HOME_UPCOMING_SOON_COLLAPSED_STORAGE_KEY);
    if (raw === null) return defaultCollapsed;
    return raw === "true";
  } catch {
    return defaultCollapsed;
  }
}

export function writeHomeUpcomingSoonCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOME_UPCOMING_SOON_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function parseHomeStatusFilter(raw: unknown): HomeStatusFilter {
  if (raw === "ongoing" || raw === "released" || raw === "all") return raw;
  return "all";
}

export function readHomeStatusFilter(): HomeStatusFilter {
  if (typeof window === "undefined") return "all";
  try {
    return parseHomeStatusFilter(localStorage.getItem(HOME_STATUS_FILTER_STORAGE_KEY));
  } catch {
    return "all";
  }
}

export function writeHomeStatusFilter(filter: HomeStatusFilter): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOME_STATUS_FILTER_STORAGE_KEY, filter);
  } catch {
    /* ignore */
  }
}
