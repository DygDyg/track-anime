import { prisma } from "@/lib/prisma";
import {
  buildHolidayThemePublicConfig,
  DEFAULT_HOLIDAY_WINDOWS,
  normalizeHolidayWindows,
  type HolidayThemePublicConfig,
  type HolidayWindowConfig,
} from "@/lib/holiday-theme";

export const HOLIDAY_THEME_SETTINGS_ID = "default";

type HolidayThemeSettingsRow = {
  enabled: boolean;
  windows: unknown;
  updatedAt: Date;
};

type HolidayThemeSettingsDelegate = {
  upsert(args: {
    where: { id: string };
    create: { id: string; enabled: boolean; windows: HolidayWindowConfig[] };
    update: Record<string, never>;
  }): Promise<HolidayThemeSettingsRow>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<HolidayThemeSettingsRow>;
  update(args: {
    where: { id: string };
    data: { enabled?: boolean; windows?: HolidayWindowConfig[] };
  }): Promise<HolidayThemeSettingsRow>;
};

export type HolidayThemeSettingsDto = {
  enabled: boolean;
  windows: HolidayWindowConfig[];
  updatedAt: string;
  public: HolidayThemePublicConfig;
};

export const DEFAULT_HOLIDAY_THEME_SETTINGS_DTO: HolidayThemeSettingsDto = {
  enabled: true,
  windows: DEFAULT_HOLIDAY_WINDOWS.map((w) => ({ ...w })),
  updatedAt: new Date(0).toISOString(),
  public: buildHolidayThemePublicConfig(true, DEFAULT_HOLIDAY_WINDOWS),
};

let cachedSettings: { value: HolidayThemeSettingsDto; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function getDelegate(): HolidayThemeSettingsDelegate | null {
  const delegate = (prisma as unknown as { holidayThemeSettings?: HolidayThemeSettingsDelegate })
    .holidayThemeSettings;
  return typeof delegate?.upsert === "function" ? delegate : null;
}

export function invalidateHolidayThemeSettingsCache(): void {
  cachedSettings = null;
}

function toDto(row: HolidayThemeSettingsRow): HolidayThemeSettingsDto {
  const enabled = Boolean(row.enabled);
  const windows = normalizeHolidayWindows(
    Array.isArray(row.windows) && row.windows.length > 0 ? row.windows : DEFAULT_HOLIDAY_WINDOWS,
  );
  return {
    enabled,
    windows,
    updatedAt: row.updatedAt.toISOString(),
    public: buildHolidayThemePublicConfig(enabled, windows),
  };
}

export async function ensureHolidayThemeSettings(): Promise<void> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите сервер");
  }

  await delegate.upsert({
    where: { id: HOLIDAY_THEME_SETTINGS_ID },
    create: {
      id: HOLIDAY_THEME_SETTINGS_ID,
      enabled: true,
      windows: DEFAULT_HOLIDAY_WINDOWS.map((w) => ({ ...w })),
    },
    update: {},
  });
}

export async function getHolidayThemeSettingsDto(): Promise<HolidayThemeSettingsDto> {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) {
    return {
      ...cachedSettings.value,
      public: buildHolidayThemePublicConfig(
        cachedSettings.value.enabled,
        cachedSettings.value.windows,
      ),
    };
  }

  try {
    await ensureHolidayThemeSettings();
    const delegate = getDelegate();
    if (!delegate) throw new Error("HolidayThemeSettings delegate missing");

    const row = await delegate.findUniqueOrThrow({ where: { id: HOLIDAY_THEME_SETTINGS_ID } });
    const value = toDto(row);
    cachedSettings = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[holiday-theme] settings fallback:", error);
    return {
      ...DEFAULT_HOLIDAY_THEME_SETTINGS_DTO,
      public: buildHolidayThemePublicConfig(true, DEFAULT_HOLIDAY_WINDOWS),
    };
  }
}

export async function getHolidayThemePublicConfig(): Promise<HolidayThemePublicConfig> {
  const dto = await getHolidayThemeSettingsDto();
  return dto.public;
}

export async function updateHolidayThemeSettings(input: {
  enabled?: boolean;
  windows?: unknown;
}): Promise<HolidayThemeSettingsDto> {
  await ensureHolidayThemeSettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("HolidayThemeSettings delegate missing");

  const data: { enabled?: boolean; windows?: HolidayWindowConfig[] } = {};
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
  if (input.windows !== undefined) data.windows = normalizeHolidayWindows(input.windows);

  await delegate.update({
    where: { id: HOLIDAY_THEME_SETTINGS_ID },
    data,
  });

  invalidateHolidayThemeSettingsCache();
  return getHolidayThemeSettingsDto();
}
