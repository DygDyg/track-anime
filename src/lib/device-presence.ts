import { prisma } from "@/lib/prisma";
import { getDevicePresenceTtlHours } from "@/lib/admin/device-presence-settings";

export const DEVICE_PRESENCE_CLIENT_KINDS = ["browser", "android", "windows"] as const;
export type DevicePresenceClientKind = (typeof DEVICE_PRESENCE_CLIENT_KINDS)[number];

export type DevicePresenceDto = {
  id: string;
  deviceKey: string;
  displayName: string;
  clientKind: DevicePresenceClientKind;
  lastPath: string;
  lastTitle: string | null;
  lastOpenedAt: string;
  isCurrent: boolean;
};

const MAX_PATH_LENGTH = 2000;
const MAX_TITLE_LENGTH = 300;
const MAX_DISPLAY_NAME_LENGTH = 80;

export function isDevicePresenceClientKind(value: unknown): value is DevicePresenceClientKind {
  return typeof value === "string" && (DEVICE_PRESENCE_CLIENT_KINDS as readonly string[]).includes(value);
}

export function normalizeDeviceKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < 8 || key.length > 128) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(key)) return null;
  return key;
}

export function normalizeLastPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.length > MAX_PATH_LENGTH) return null;
  if (trimmed.includes("://") || trimmed.includes("\\")) return null;
  return trimmed;
}

export function normalizeLastTitle(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const title = raw.trim().slice(0, MAX_TITLE_LENGTH);
  return title || null;
}

export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME_LENGTH);
  return name || null;
}

export function defaultDisplayName(kind: DevicePresenceClientKind): string {
  switch (kind) {
    case "android":
      return "Android";
    case "windows":
      return "Windows";
    default:
      return "Браузер";
  }
}

function ttlCutoff(ttlHours: number): Date {
  return new Date(Date.now() - ttlHours * 60 * 60 * 1000);
}

async function purgeExpiredForUser(userId: string, ttlHours: number): Promise<void> {
  await prisma.userDevicePresence.deleteMany({
    where: {
      userId,
      lastOpenedAt: { lt: ttlCutoff(ttlHours) },
    },
  });
}

function toDto(
  row: {
    id: string;
    deviceKey: string;
    displayName: string;
    clientKind: string;
    lastPath: string;
    lastTitle: string | null;
    lastOpenedAt: Date;
  },
  currentDeviceKey: string | null,
): DevicePresenceDto {
  const kind = isDevicePresenceClientKind(row.clientKind) ? row.clientKind : "browser";
  return {
    id: row.id,
    deviceKey: row.deviceKey,
    displayName: row.displayName,
    clientKind: kind,
    lastPath: row.lastPath,
    lastTitle: row.lastTitle,
    lastOpenedAt: row.lastOpenedAt.toISOString(),
    isCurrent: currentDeviceKey != null && row.deviceKey === currentDeviceKey,
  };
}

export async function listUserDevices(
  userId: string,
  currentDeviceKey: string | null,
): Promise<DevicePresenceDto[]> {
  const ttlHours = await getDevicePresenceTtlHours();
  await purgeExpiredForUser(userId, ttlHours);

  const rows = await prisma.userDevicePresence.findMany({
    where: {
      userId,
      lastOpenedAt: { gte: ttlCutoff(ttlHours) },
    },
    orderBy: { lastOpenedAt: "desc" },
  });

  return rows.map((row) => toDto(row, currentDeviceKey));
}

export async function upsertDevicePresence(
  userId: string,
  input: {
    deviceKey: string;
    clientKind: DevicePresenceClientKind;
    lastPath: string;
    lastTitle: string | null;
    displayName?: string | null;
  },
): Promise<DevicePresenceDto> {
  const ttlHours = await getDevicePresenceTtlHours();
  await purgeExpiredForUser(userId, ttlHours);

  const now = new Date();
  const existing = await prisma.userDevicePresence.findUnique({
    where: { userId_deviceKey: { userId, deviceKey: input.deviceKey } },
  });

  const displayName =
    normalizeDisplayName(input.displayName) ??
    existing?.displayName ??
    defaultDisplayName(input.clientKind);

  const row = await prisma.userDevicePresence.upsert({
    where: { userId_deviceKey: { userId, deviceKey: input.deviceKey } },
    create: {
      userId,
      deviceKey: input.deviceKey,
      displayName,
      clientKind: input.clientKind,
      lastPath: input.lastPath,
      lastTitle: input.lastTitle,
      lastOpenedAt: now,
    },
    update: {
      clientKind: input.clientKind,
      lastPath: input.lastPath,
      lastTitle: input.lastTitle,
      lastOpenedAt: now,
      ...(input.displayName != null && normalizeDisplayName(input.displayName)
        ? { displayName: normalizeDisplayName(input.displayName)! }
        : {}),
    },
  });

  return toDto(row, input.deviceKey);
}

export async function renameCurrentDevice(
  userId: string,
  deviceKey: string,
  displayName: string,
): Promise<DevicePresenceDto | null> {
  const name = normalizeDisplayName(displayName);
  if (!name) return null;

  try {
    const row = await prisma.userDevicePresence.update({
      where: { userId_deviceKey: { userId, deviceKey } },
      data: { displayName: name },
    });
    return toDto(row, deviceKey);
  } catch {
    return null;
  }
}
