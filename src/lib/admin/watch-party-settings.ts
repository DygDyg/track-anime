import { prisma } from "@/lib/prisma";

export const WATCH_PARTY_SETTINGS_ID = "default";

export type WatchPartySettingsDto = {
  enabled: boolean;
  allowGuests: boolean;
  updatedAt: string;
};

export const DEFAULT_WATCH_PARTY_SETTINGS_DTO: WatchPartySettingsDto = {
  enabled: true,
  allowGuests: true,
  updatedAt: new Date(0).toISOString(),
};

type WatchPartySettingsRow = {
  enabled: boolean;
  allowGuests: boolean;
  updatedAt: Date;
};

type WatchPartySettingsDelegate = {
  upsert(args: {
    where: { id: string };
    create: { id: string; enabled: boolean; allowGuests: boolean };
    update: Partial<{ enabled: boolean; allowGuests: boolean }>;
  }): Promise<WatchPartySettingsRow>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<WatchPartySettingsRow>;
  update(args: {
    where: { id: string };
    data: Partial<{ enabled: boolean; allowGuests: boolean }>;
  }): Promise<WatchPartySettingsRow>;
};

let cachedSettings: { value: WatchPartySettingsDto; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function getDelegate(): WatchPartySettingsDelegate | null {
  return (
    prisma as unknown as {
      watchPartySettings?: WatchPartySettingsDelegate;
    }
  ).watchPartySettings ?? null;
}

function toDto(row: WatchPartySettingsRow): WatchPartySettingsDto {
  return {
    enabled: row.enabled,
    allowGuests: row.allowGuests,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function invalidateWatchPartySettingsCache(): void {
  cachedSettings = null;
}

export async function ensureWatchPartySettings(): Promise<void> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await delegate.upsert({
    where: { id: WATCH_PARTY_SETTINGS_ID },
    create: {
      id: WATCH_PARTY_SETTINGS_ID,
      enabled: DEFAULT_WATCH_PARTY_SETTINGS_DTO.enabled,
      allowGuests: DEFAULT_WATCH_PARTY_SETTINGS_DTO.allowGuests,
    },
    update: {},
  });
}

export async function getWatchPartySettingsDto(): Promise<WatchPartySettingsDto> {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }

  try {
    await ensureWatchPartySettings();
    const delegate = getDelegate();
    if (!delegate) throw new Error("WatchPartySettings delegate missing");

    const row = await delegate.findUniqueOrThrow({
      where: { id: WATCH_PARTY_SETTINGS_ID },
    });
    const value = toDto(row);
    cachedSettings = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[watch-party] settings fallback:", error);
    return DEFAULT_WATCH_PARTY_SETTINGS_DTO;
  }
}

export async function updateWatchPartySettings(input: {
  enabled?: boolean;
  allowGuests?: boolean;
}): Promise<WatchPartySettingsDto> {
  await ensureWatchPartySettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("WatchPartySettings delegate missing");

  const data: Partial<{ enabled: boolean; allowGuests: boolean }> = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.allowGuests !== undefined) data.allowGuests = input.allowGuests;

  await delegate.update({
    where: { id: WATCH_PARTY_SETTINGS_ID },
    data,
  });

  invalidateWatchPartySettingsCache();
  return getWatchPartySettingsDto();
}
