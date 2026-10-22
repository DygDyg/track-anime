/**
 * Seasonal UI themes. Windows come from admin (`HolidayThemeSettings`);
 * defaults live in `holiday-theme-types.ts`. Calendar TZ: Europe/Moscow.
 */

import {
  DEFAULT_HOLIDAY_WINDOWS,
  HOLIDAY_THEME_CATALOG,
  type HolidayThemeId,
  type HolidayThemePreference,
  type HolidayThemePublicConfig,
  type HolidayWindowConfig,
  type ImplementedHolidayThemeId,
  isHolidayThemeId,
  isImplementedHolidayThemeId,
} from "@/lib/holiday-theme-types";

export type {
  HolidayThemeCatalogEntry,
  HolidayThemeId,
  HolidayThemePreference,
  HolidayThemePublicConfig,
  HolidayWindowConfig,
  ImplementedHolidayThemeId,
} from "@/lib/holiday-theme-types";

export {
  DEFAULT_HOLIDAY_WINDOWS,
  HOLIDAY_THEME_CATALOG,
  HOLIDAY_THEME_IDS,
  IMPLEMENTED_HOLIDAY_THEME_IDS,
  holidayCatalogLabel,
  isHolidayThemeId,
  isImplementedHolidayThemeId,
} from "@/lib/holiday-theme-types";

type MonthDay = { month: number; day: number };

/** Legacy preference → boolean (default on). */
export function normalizeHolidayThemePreference(raw: unknown): HolidayThemePreference {
  if (raw === "off" || raw === "auto") return raw;
  if (isImplementedHolidayThemeId(raw)) return raw;
  return "auto";
}

/**
 * User toggle «Включить праздники». Default on.
 * Migrates legacy `holidayThemePreference`: only `"off"` → false.
 */
export function normalizeHolidaysEnabled(
  raw: unknown,
  legacyPreference: unknown = undefined,
): boolean {
  if (typeof raw === "boolean") return raw;
  if (legacyPreference === "off") return false;
  return true;
}

/** Calendar day in Europe/Moscow as month/day (1-based month). */
export function getMoscowMonthDay(now: Date = new Date()): MonthDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 0);
  return { month, day };
}

export function getMoscowDateIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function mdKey(month: number, day: number): number {
  return month * 100 + day;
}

export function clampDayForMonth(month: number, day: number): number {
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const max = daysInMonth[Math.min(12, Math.max(1, month)) - 1] ?? 31;
  return Math.min(max, Math.max(1, Math.round(day)));
}

export function normalizeHolidayWindow(raw: unknown, fallback: HolidayWindowConfig): HolidayWindowConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = isHolidayThemeId(src.id) ? src.id : fallback.id;
  const startMonth = Math.min(12, Math.max(1, Math.round(Number(src.startMonth) || fallback.startMonth)));
  const endMonth = Math.min(12, Math.max(1, Math.round(Number(src.endMonth) || fallback.endMonth)));
  const startDay = clampDayForMonth(startMonth, Number(src.startDay) || fallback.startDay);
  const endDay = clampDayForMonth(endMonth, Number(src.endDay) || fallback.endDay);
  const priority = Number.isFinite(Number(src.priority)) ? Math.round(Number(src.priority)) : fallback.priority;
  return {
    id,
    enabled: src.enabled !== false,
    startMonth,
    startDay,
    endMonth,
    endDay,
    priority,
  };
}

/** Merge stored windows with catalog defaults (keep unknown ids out). */
export function normalizeHolidayWindows(raw: unknown): HolidayWindowConfig[] {
  const byId = new Map<HolidayThemeId, HolidayWindowConfig>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      if (!isHolidayThemeId(id)) continue;
      const fallback = DEFAULT_HOLIDAY_WINDOWS.find((w) => w.id === id) ?? {
        id,
        enabled: false,
        startMonth: 1,
        startDay: 1,
        endMonth: 1,
        endDay: 1,
        priority: 100,
      };
      byId.set(id, normalizeHolidayWindow(item, fallback));
    }
  }

  return DEFAULT_HOLIDAY_WINDOWS.map((fallback) => byId.get(fallback.id) ?? { ...fallback });
}

/**
 * Inclusive yearly window. If start > end (e.g. 20 Dec → 8 Jan), wraps across New Year.
 */
export function isMonthDayInWindow(
  month: number,
  day: number,
  window: Pick<HolidayWindowConfig, "startMonth" | "startDay" | "endMonth" | "endDay">,
): boolean {
  const key = mdKey(month, day);
  const start = mdKey(window.startMonth, window.startDay);
  const end = mdKey(window.endMonth, window.endDay);
  if (start <= end) return key >= start && key <= end;
  return key >= start || key <= end;
}

export function findHolidayWindowsForMonthDay(
  windows: HolidayWindowConfig[],
  month: number,
  day: number,
): HolidayWindowConfig[] {
  return windows
    .filter((w) => w.enabled && isMonthDayInWindow(month, day, w))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function resolveHolidayThemeFromWindows(
  windows: HolidayWindowConfig[],
  now: Date = new Date(),
  options?: { implementedOnly?: boolean },
): HolidayThemeId | null {
  const { month, day } = getMoscowMonthDay(now);
  const matches = findHolidayWindowsForMonthDay(windows, month, day);
  const implementedOnly = options?.implementedOnly !== false;
  for (const match of matches) {
    if (!implementedOnly || isImplementedHolidayThemeId(match.id)) {
      return match.id;
    }
  }
  return null;
}

/**
 * @param adminForceId — личный preview админа (local); обходит календарь и мастер-выключатель.
 */
export function resolveHolidayTheme(
  userEnabled = true,
  now: Date = new Date(),
  windows: HolidayWindowConfig[] = DEFAULT_HOLIDAY_WINDOWS,
  masterEnabled = true,
  adminForceId: HolidayThemeId | null = null,
): HolidayThemeId | null {
  if (adminForceId && isHolidayThemeId(adminForceId)) return adminForceId;
  if (!userEnabled || !masterEnabled) return null;
  return resolveHolidayThemeFromWindows(windows, now, { implementedOnly: true });
}

export function normalizeHolidayAdminForceId(value: unknown): HolidayThemeId | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return isHolidayThemeId(value) ? value : null;
}

export function buildHolidayThemePublicConfig(
  enabled: boolean,
  windows: HolidayWindowConfig[],
  now: Date = new Date(),
): HolidayThemePublicConfig {
  const normalized = normalizeHolidayWindows(windows);
  return {
    enabled,
    windows: normalized,
    active: enabled
      ? resolveHolidayThemeFromWindows(normalized, now, { implementedOnly: true })
      : null,
    moscowDate: getMoscowDateIso(now),
  };
}

export function applyHolidayThemeAttribute(theme: HolidayThemeId | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme) {
    root.setAttribute("data-holiday", theme);
  } else {
    root.removeAttribute("data-holiday");
  }
}

declare global {
  interface Window {
    __TA_HOLIDAY__?: HolidayThemePublicConfig;
  }
}

export function readHolidayPublicConfigFromWindow(): HolidayThemePublicConfig | null {
  if (typeof window === "undefined") return null;
  const cfg = window.__TA_HOLIDAY__;
  if (!cfg || typeof cfg !== "object") return null;
  return {
    enabled: cfg.enabled !== false,
    windows: normalizeHolidayWindows(cfg.windows),
    active: isHolidayThemeId(cfg.active) ? cfg.active : null,
    moscowDate: typeof cfg.moscowDate === "string" ? cfg.moscowDate : getMoscowDateIso(),
  };
}

/** Inline snippet for early paint. Expects `d` and `el`; reads `window.__TA_HOLIDAY__`. */
export function holidayThemeInitSnippet(): string {
  return (
    "var holiday=null;" +
    "var force=typeof d.holidayAdminForceId===\"string\"?d.holidayAdminForceId:null;" +
    "if(force){holiday=force;}" +
    "else{" +
    "var holidaysOn=true;" +
    "if(typeof d.holidaysEnabled===\"boolean\")holidaysOn=d.holidaysEnabled;" +
    "else if(d.holidayThemePreference===\"off\")holidaysOn=false;" +
    "if(holidaysOn){" +
    "try{" +
    "var cfg=typeof window!==\"undefined\"?window.__TA_HOLIDAY__:null;" +
    "if(cfg&&cfg.enabled!==false&&cfg.active)holiday=cfg.active;" +
    "}catch(he){}" +
    "}" +
    "}" +
    "if(holiday)el.setAttribute(\"data-holiday\",holiday);else el.removeAttribute(\"data-holiday\");"
  );
}
