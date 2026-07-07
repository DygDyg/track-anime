import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SITE_SETTINGS,
  normalizeSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

export const SITE_SETTINGS_DEFAULTS_ID = "default";

export type SiteSettingsDefaultsDto = {
  settings: SiteSettings;
  updatedAt: string;
};

type SiteSettingsDefaultsRow = {
  settings: unknown;
  updatedAt: Date;
};

type SiteSettingsDefaultsDelegate = {
  upsert: (args: {
    where: { id: string };
    create: { id: string; settings: SiteSettings };
    update: Record<string, never>;
  }) => Promise<SiteSettingsDefaultsRow>;
  findUniqueOrThrow: (args: { where: { id: string } }) => Promise<SiteSettingsDefaultsRow>;
  update: (args: {
    where: { id: string };
    data: { settings: SiteSettings };
  }) => Promise<SiteSettingsDefaultsRow>;
};

function getSiteSettingsDefaultsDelegate(): SiteSettingsDefaultsDelegate | null {
  const delegate = (prisma as PrismaClientWithDefaults).siteSettingsDefaults;
  return delegate ?? null;
}

type PrismaClientWithDefaults = typeof prisma & {
  siteSettingsDefaults?: SiteSettingsDefaultsDelegate;
};

function fallbackDto(): SiteSettingsDefaultsDto {
  return {
    settings: { ...DEFAULT_SITE_SETTINGS },
    updatedAt: new Date(0).toISOString(),
  };
}

export async function ensureSiteSettingsDefaults(): Promise<void> {
  const delegate = getSiteSettingsDefaultsDelegate();
  if (!delegate) return;

  await delegate.upsert({
    where: { id: SITE_SETTINGS_DEFAULTS_ID },
    create: {
      id: SITE_SETTINGS_DEFAULTS_ID,
      settings: DEFAULT_SITE_SETTINGS,
    },
    update: {},
  });
}

export async function getSiteSettingsDefaults(): Promise<SiteSettings> {
  const delegate = getSiteSettingsDefaultsDelegate();
  if (!delegate) {
    return { ...DEFAULT_SITE_SETTINGS };
  }

  await ensureSiteSettingsDefaults();
  const row = await delegate.findUniqueOrThrow({
    where: { id: SITE_SETTINGS_DEFAULTS_ID },
  });
  return normalizeSiteSettings(row.settings);
}

export async function getSiteSettingsDefaultsDto(): Promise<SiteSettingsDefaultsDto> {
  const delegate = getSiteSettingsDefaultsDelegate();
  if (!delegate) {
    return fallbackDto();
  }

  await ensureSiteSettingsDefaults();
  const row = await delegate.findUniqueOrThrow({
    where: { id: SITE_SETTINGS_DEFAULTS_ID },
  });

  return {
    settings: normalizeSiteSettings(row.settings),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateSiteSettingsDefaults(raw: unknown): Promise<SiteSettingsDefaultsDto> {
  const delegate = getSiteSettingsDefaultsDelegate();
  if (!delegate) {
    throw new Error("Prisma client не обновлён. Перезапустите dev-сервер и выполните prisma generate.");
  }

  const settings = normalizeSiteSettings(raw);

  const row = await delegate.update({
    where: { id: SITE_SETTINGS_DEFAULTS_ID },
    data: { settings },
  });

  return {
    settings: normalizeSiteSettings(row.settings),
    updatedAt: row.updatedAt.toISOString(),
  };
}
