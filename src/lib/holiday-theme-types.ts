/** Shared holiday theme types (safe for client + server). */

export const HOLIDAY_THEME_IDS = [
  "halloween",
  "ny",
  "valentine",
  "march8",
  "feb23",
  "cosmonautics",
  "april1",
] as const;

export type HolidayThemeId = (typeof HOLIDAY_THEME_IDS)[number];

/** Themes with live UI (palette / décor). Others can be scheduled in admin. */
export const IMPLEMENTED_HOLIDAY_THEME_IDS = ["halloween"] as const satisfies readonly HolidayThemeId[];

export type ImplementedHolidayThemeId = (typeof IMPLEMENTED_HOLIDAY_THEME_IDS)[number];

/** @deprecated user setting is boolean `holidaysEnabled`; kept for migrate/normalize. */
export type HolidayThemePreference = "auto" | "off" | ImplementedHolidayThemeId;

export type HolidayWindowConfig = {
  id: HolidayThemeId;
  enabled: boolean;
  /** 1–12 */
  startMonth: number;
  /** 1–31 */
  startDay: number;
  /** 1–12 */
  endMonth: number;
  /** 1–31 */
  endDay: number;
  /** Lower runs first when windows overlap */
  priority: number;
};

export type HolidayThemeCatalogEntry = {
  id: HolidayThemeId;
  label: string;
  /** Short hint for admin */
  hint: string;
  implemented: boolean;
};

export const HOLIDAY_THEME_CATALOG: HolidayThemeCatalogEntry[] = [
  {
    id: "halloween",
    label: "Хэллоуин",
    hint: "Оранжевый акцент, мыши, рамка на обложках, свой курсор",
    implemented: true,
  },
  {
    id: "ny",
    label: "Новый год",
    hint: "Пока только расписание (UI позже)",
    implemented: false,
  },
  {
    id: "valentine",
    label: "14 февраля",
    hint: "Пока только расписание (UI позже)",
    implemented: false,
  },
  {
    id: "march8",
    label: "8 марта",
    hint: "Пока только расписание (UI позже)",
    implemented: false,
  },
  {
    id: "feb23",
    label: "23 февраля",
    hint: "Пока только расписание (UI позже)",
    implemented: false,
  },
  {
    id: "cosmonautics",
    label: "День космонавтики",
    hint: "Пока только расписание (UI позже)",
    implemented: false,
  },
  {
    id: "april1",
    label: "1 апреля",
    hint: "Пока только расписание (UI позже)",
    implemented: false,
  },
];

export const DEFAULT_HOLIDAY_WINDOWS: HolidayWindowConfig[] = [
  {
    id: "halloween",
    enabled: true,
    startMonth: 10,
    startDay: 24,
    endMonth: 11,
    endDay: 1,
    priority: 10,
  },
  {
    id: "ny",
    enabled: false,
    startMonth: 12,
    startDay: 20,
    endMonth: 1,
    endDay: 8,
    priority: 20,
  },
  {
    id: "valentine",
    enabled: false,
    startMonth: 2,
    startDay: 10,
    endMonth: 2,
    endDay: 14,
    priority: 30,
  },
  {
    id: "feb23",
    enabled: false,
    startMonth: 2,
    startDay: 20,
    endMonth: 2,
    endDay: 23,
    priority: 35,
  },
  {
    id: "march8",
    enabled: false,
    startMonth: 3,
    startDay: 6,
    endMonth: 3,
    endDay: 8,
    priority: 40,
  },
  {
    id: "cosmonautics",
    enabled: false,
    startMonth: 4,
    startDay: 10,
    endMonth: 4,
    endDay: 12,
    priority: 50,
  },
  {
    id: "april1",
    enabled: false,
    startMonth: 4,
    startDay: 1,
    endMonth: 4,
    endDay: 1,
    priority: 55,
  },
];

export type HolidayThemePublicConfig = {
  enabled: boolean;
  windows: HolidayWindowConfig[];
  /** Resolved theme for Moscow «today», null if none / master off */
  active: HolidayThemeId | null;
  /** YYYY-MM-DD Europe/Moscow */
  moscowDate: string;
};

export function isHolidayThemeId(value: unknown): value is HolidayThemeId {
  return typeof value === "string" && (HOLIDAY_THEME_IDS as readonly string[]).includes(value);
}

export function isImplementedHolidayThemeId(value: unknown): value is ImplementedHolidayThemeId {
  return (
    typeof value === "string" && (IMPLEMENTED_HOLIDAY_THEME_IDS as readonly string[]).includes(value)
  );
}

export function holidayCatalogLabel(id: HolidayThemeId): string {
  return HOLIDAY_THEME_CATALOG.find((item) => item.id === id)?.label ?? id;
}
