import { prisma } from "@/lib/prisma";

export const APP_PROMO_SETTINGS_ID = "default";

export type AppPromoSettingsDto = {
  /** Mobile Android soft-banner + notification hint */
  enabled: boolean;
  /** Desktop soft-banner + header button */
  desktopEnabled: boolean;
  updatedAt: string;
};

export const DEFAULT_APP_PROMO_SETTINGS_DTO: AppPromoSettingsDto = {
  enabled: true,
  desktopEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

type AppPromoSettingsRow = {
  enabled: boolean;
  desktopEnabled: boolean;
  updatedAt: Date;
};

type AppPromoSettingsDelegate = {
  upsert(args: {
    where: { id: string };
    create: { id: string; enabled: boolean; desktopEnabled: boolean };
    update: Partial<{ enabled: boolean; desktopEnabled: boolean }>;
  }): Promise<AppPromoSettingsRow>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<AppPromoSettingsRow>;
  update(args: {
    where: { id: string };
    data: Partial<{ enabled: boolean; desktopEnabled: boolean }>;
  }): Promise<AppPromoSettingsRow>;
};

let cachedSettings: { value: AppPromoSettingsDto; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function getDelegate(): AppPromoSettingsDelegate | null {
  return (
    prisma as unknown as {
      appPromoSettings?: AppPromoSettingsDelegate;
    }
  ).appPromoSettings ?? null;
}

function toDto(row: AppPromoSettingsRow): AppPromoSettingsDto {
  return {
    enabled: Boolean(row.enabled),
    desktopEnabled: Boolean(row.desktopEnabled),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function invalidateAppPromoSettingsCache(): void {
  cachedSettings = null;
}

export async function ensureAppPromoSettings(): Promise<void> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await delegate.upsert({
    where: { id: APP_PROMO_SETTINGS_ID },
    create: {
      id: APP_PROMO_SETTINGS_ID,
      enabled: DEFAULT_APP_PROMO_SETTINGS_DTO.enabled,
      desktopEnabled: DEFAULT_APP_PROMO_SETTINGS_DTO.desktopEnabled,
    },
    update: {},
  });
}

export async function getAppPromoSettingsDto(): Promise<AppPromoSettingsDto> {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }

  try {
    await ensureAppPromoSettings();
    const delegate = getDelegate();
    if (!delegate) throw new Error("AppPromoSettings delegate missing");

    const row = await delegate.findUniqueOrThrow({
      where: { id: APP_PROMO_SETTINGS_ID },
    });
    const value = toDto(row);
    cachedSettings = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[app-promo] settings fallback:", error);
    return DEFAULT_APP_PROMO_SETTINGS_DTO;
  }
}

export async function updateAppPromoSettings(input: {
  enabled?: boolean;
  desktopEnabled?: boolean;
}): Promise<AppPromoSettingsDto> {
  await ensureAppPromoSettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("AppPromoSettings delegate missing");

  const data: Partial<{ enabled: boolean; desktopEnabled: boolean }> = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.desktopEnabled !== undefined) data.desktopEnabled = input.desktopEnabled;

  await delegate.update({
    where: { id: APP_PROMO_SETTINGS_ID },
    data,
  });

  invalidateAppPromoSettingsCache();
  return getAppPromoSettingsDto();
}
