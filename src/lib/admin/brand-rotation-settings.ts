import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const BRAND_ROTATION_SETTINGS_ID = "default";
export const DEFAULT_BRAND_ROTATION_ENABLED = true;
export const DEFAULT_BRAND_ROTATION_INTERVAL_MINUTES = 120;
export const MIN_BRAND_ROTATION_INTERVAL_MINUTES = 5;
export const MAX_BRAND_ROTATION_INTERVAL_MINUTES = 24 * 60;

type BrandRotationSettingsRow = {
  enabled: boolean;
  intervalMinutes: number;
  rotationSeed: string;
  updatedAt: Date;
};

type BrandRotationSettingsDelegate = {
  upsert(args: {
    where: { id: string };
    create: { id: string; enabled: boolean; intervalMinutes: number; rotationSeed: string };
    update: Record<string, never>;
  }): Promise<BrandRotationSettingsRow>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<BrandRotationSettingsRow>;
  update(args: {
    where: { id: string };
    data: { enabled?: boolean; intervalMinutes?: number; rotationSeed?: string };
  }): Promise<BrandRotationSettingsRow>;
};

export type BrandRotationSettingsDto = {
  enabled: boolean;
  intervalMinutes: number;
  rotationSeed: string;
  updatedAt: string;
};

export const DEFAULT_BRAND_ROTATION_SETTINGS_DTO: BrandRotationSettingsDto = {
  enabled: DEFAULT_BRAND_ROTATION_ENABLED,
  intervalMinutes: DEFAULT_BRAND_ROTATION_INTERVAL_MINUTES,
  rotationSeed: "default",
  updatedAt: new Date(0).toISOString(),
};

let cachedSettings: { value: BrandRotationSettingsDto; at: number } | null = null;
const SETTINGS_CACHE_MS = 30_000;

function getBrandRotationSettingsDelegate(): BrandRotationSettingsDelegate | null {
  const delegate = (prisma as unknown as { brandRotationSettings?: BrandRotationSettingsDelegate })
    .brandRotationSettings;
  return typeof delegate?.upsert === "function" ? delegate : null;
}

export function invalidateBrandRotationSettingsCache(): void {
  cachedSettings = null;
}

export function clampBrandRotationIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BRAND_ROTATION_INTERVAL_MINUTES;
  return Math.min(
    MAX_BRAND_ROTATION_INTERVAL_MINUTES,
    Math.max(MIN_BRAND_ROTATION_INTERVAL_MINUTES, Math.round(value)),
  );
}

function toDto(row: BrandRotationSettingsRow): BrandRotationSettingsDto {
  return {
    enabled: Boolean(row.enabled),
    intervalMinutes: clampBrandRotationIntervalMinutes(row.intervalMinutes),
    rotationSeed: row.rotationSeed || "default",
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureBrandRotationSettings(): Promise<void> {
  const delegate = getBrandRotationSettingsDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await delegate.upsert({
    where: { id: BRAND_ROTATION_SETTINGS_ID },
    create: {
      id: BRAND_ROTATION_SETTINGS_ID,
      enabled: DEFAULT_BRAND_ROTATION_ENABLED,
      intervalMinutes: DEFAULT_BRAND_ROTATION_INTERVAL_MINUTES,
      rotationSeed: "default",
    },
    update: {},
  });
}

export async function getBrandRotationSettingsDto(): Promise<BrandRotationSettingsDto> {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }

  try {
    await ensureBrandRotationSettings();
    const delegate = getBrandRotationSettingsDelegate();
    if (!delegate) throw new Error("BrandRotationSettings delegate missing");

    const row = await delegate.findUniqueOrThrow({ where: { id: BRAND_ROTATION_SETTINGS_ID } });
    const value = toDto(row);
    cachedSettings = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[brand-rotation] settings fallback:", error);
    return DEFAULT_BRAND_ROTATION_SETTINGS_DTO;
  }
}

export async function updateBrandRotationSettings(input: {
  enabled?: boolean;
  intervalMinutes?: number;
}): Promise<BrandRotationSettingsDto> {
  await ensureBrandRotationSettings();
  const delegate = getBrandRotationSettingsDelegate();
  if (!delegate) throw new Error("BrandRotationSettings delegate missing");

  const data: { enabled?: boolean; intervalMinutes?: number } = {};
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
  if (input.intervalMinutes !== undefined) {
    data.intervalMinutes = clampBrandRotationIntervalMinutes(input.intervalMinutes);
  }

  await delegate.update({
    where: { id: BRAND_ROTATION_SETTINGS_ID },
    data,
  });

  invalidateBrandRotationSettingsCache();
  return getBrandRotationSettingsDto();
}

export async function forceBrandLogoRotation(): Promise<BrandRotationSettingsDto> {
  await ensureBrandRotationSettings();
  const delegate = getBrandRotationSettingsDelegate();
  if (!delegate) throw new Error("BrandRotationSettings delegate missing");

  await delegate.update({
    where: { id: BRAND_ROTATION_SETTINGS_ID },
    data: { rotationSeed: crypto.randomUUID() },
  });

  invalidateBrandRotationSettingsCache();
  return getBrandRotationSettingsDto();
}
