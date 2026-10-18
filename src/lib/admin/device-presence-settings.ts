import { prisma } from "@/lib/prisma";

export const DEVICE_PRESENCE_SETTINGS_ID = "default";

export const DEFAULT_DEVICE_PRESENCE_TTL_HOURS = 24;
export const MIN_DEVICE_PRESENCE_TTL_HOURS = 1;
export const MAX_DEVICE_PRESENCE_TTL_HOURS = 168;

export type DevicePresenceSettingsDto = {
  ttlHours: number;
  updatedAt: string;
};

export const DEFAULT_DEVICE_PRESENCE_SETTINGS_DTO: DevicePresenceSettingsDto = {
  ttlHours: DEFAULT_DEVICE_PRESENCE_TTL_HOURS,
  updatedAt: new Date(0).toISOString(),
};

let cachedTtlHours: { value: number; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function hasDevicePresenceSettingsModel(): boolean {
  const delegate = (prisma as { devicePresenceSettings?: { upsert?: unknown } }).devicePresenceSettings;
  return typeof delegate?.upsert === "function";
}

export function invalidateDevicePresenceSettingsCache(): void {
  cachedTtlHours = null;
}

export function clampDevicePresenceTtlHours(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DEVICE_PRESENCE_TTL_HOURS;
  return Math.min(
    MAX_DEVICE_PRESENCE_TTL_HOURS,
    Math.max(MIN_DEVICE_PRESENCE_TTL_HOURS, Math.round(value)),
  );
}

function toDto(row: { ttlHours: number; updatedAt: Date }): DevicePresenceSettingsDto {
  return {
    ttlHours: clampDevicePresenceTtlHours(row.ttlHours),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureDevicePresenceSettings(): Promise<void> {
  if (!hasDevicePresenceSettingsModel()) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await prisma.devicePresenceSettings.upsert({
    where: { id: DEVICE_PRESENCE_SETTINGS_ID },
    create: {
      id: DEVICE_PRESENCE_SETTINGS_ID,
      ttlHours: DEFAULT_DEVICE_PRESENCE_TTL_HOURS,
    },
    update: {},
  });
}

export async function getDevicePresenceSettingsDto(): Promise<DevicePresenceSettingsDto> {
  try {
    await ensureDevicePresenceSettings();
    const row = await prisma.devicePresenceSettings.findUniqueOrThrow({
      where: { id: DEVICE_PRESENCE_SETTINGS_ID },
    });
    return toDto(row);
  } catch (error) {
    console.warn("[device-presence] settings dto fallback:", error);
    return DEFAULT_DEVICE_PRESENCE_SETTINGS_DTO;
  }
}

export async function getDevicePresenceTtlHours(): Promise<number> {
  if (cachedTtlHours && Date.now() - cachedTtlHours.at < SETTINGS_CACHE_MS) {
    return cachedTtlHours.value;
  }

  const dto = await getDevicePresenceSettingsDto();
  cachedTtlHours = { value: dto.ttlHours, at: Date.now() };
  return dto.ttlHours;
}

export async function updateDevicePresenceSettings(input: {
  ttlHours: number;
}): Promise<DevicePresenceSettingsDto> {
  await ensureDevicePresenceSettings();
  const ttlHours = clampDevicePresenceTtlHours(input.ttlHours);
  const row = await prisma.devicePresenceSettings.update({
    where: { id: DEVICE_PRESENCE_SETTINGS_ID },
    data: { ttlHours },
  });
  invalidateDevicePresenceSettingsCache();
  return toDto(row);
}
