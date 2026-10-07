import { prisma } from "@/lib/prisma";
import type {
  DbBackupIncludedTables,
  DbBackupSettingsDto,
} from "@/lib/admin/db-backup-settings-types";

export type { DbBackupIncludedTables, DbBackupSettingsDto };

export const DB_BACKUP_SETTINGS_ID = "default";

export const DB_BACKUP_INTERVAL_HOURS_OPTIONS = [6, 12, 24, 48, 72, 168] as const;

/** Типичные лимиты облаков: ~50 / 100 / 200 / 500 МБ; 900 МБ — Mail Disk (~1 ГБ на файл) */
export const DB_BACKUP_MAX_FILE_BYTES_OPTIONS = [
  50 * 1024 * 1024,
  95 * 1024 * 1024,
  200 * 1024 * 1024,
  500 * 1024 * 1024,
  900 * 1024 * 1024,
] as const;

export const DEFAULT_DB_BACKUP_MAX_FILE_BYTES = 95 * 1024 * 1024;

export type DbBackupSettingsSecrets = {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  remoteFolder: string;
  maxFileBytes: number;
  includedTables: DbBackupIncludedTables;
  enabled: boolean;
  intervalHours: number;
  lastAutoRunAt: Date | null;
  runRequestedAt: Date | null;
};

function clampIntervalHours(value: number): number {
  if ((DB_BACKUP_INTERVAL_HOURS_OPTIONS as readonly number[]).includes(value)) {
    return value;
  }
  return 24;
}

function clampMaxFileBytes(value: number): number {
  if (!Number.isFinite(value) || value < 1_000_000) {
    return DEFAULT_DB_BACKUP_MAX_FILE_BYTES;
  }
  return Math.min(Math.trunc(value), 1024 * 1024 * 1024);
}

export function normalizeIncludedTables(raw: unknown): DbBackupIncludedTables {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DbBackupIncludedTables = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === "string" && key.trim() && typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

function computeNextAutoRunAt(
  lastAutoRunAt: Date | null,
  intervalHours: number,
  enabled: boolean,
): Date | null {
  if (!enabled) return null;
  if (!lastAutoRunAt) return new Date();
  return new Date(lastAutoRunAt.getTime() + intervalHours * 60 * 60 * 1000);
}

function isConfigured(url: string, username: string, passwordSet: boolean): boolean {
  return Boolean(url.trim() && username.trim() && passwordSet);
}

export async function ensureDbBackupSettings() {
  await prisma.dbBackupSettings.upsert({
    where: { id: DB_BACKUP_SETTINGS_ID },
    create: {
      id: DB_BACKUP_SETTINGS_ID,
      enabled: false,
      intervalHours: 24,
      maxFileBytes: DEFAULT_DB_BACKUP_MAX_FILE_BYTES,
      remoteFolder: "/track-anime-backups",
      includedTables: {},
    },
    update: {},
  });
}

export async function getDbBackupSettingsSecrets(): Promise<DbBackupSettingsSecrets> {
  await ensureDbBackupSettings();
  const row = await prisma.dbBackupSettings.findUniqueOrThrow({
    where: { id: DB_BACKUP_SETTINGS_ID },
  });
  return {
    webdavUrl: row.webdavUrl ?? "",
    webdavUsername: row.webdavUsername ?? "",
    webdavPassword: row.webdavPassword?.trim() ?? "",
    remoteFolder: row.remoteFolder?.trim() || "/track-anime-backups",
    maxFileBytes: clampMaxFileBytes(row.maxFileBytes),
    includedTables: normalizeIncludedTables(row.includedTables),
    enabled: row.enabled,
    intervalHours: clampIntervalHours(row.intervalHours),
    lastAutoRunAt: row.lastAutoRunAt,
    runRequestedAt: row.runRequestedAt,
  };
}

export async function getDbBackupSettingsDto(): Promise<DbBackupSettingsDto> {
  const secrets = await getDbBackupSettingsSecrets();
  const row = await prisma.dbBackupSettings.findUniqueOrThrow({
    where: { id: DB_BACKUP_SETTINGS_ID },
  });
  const passwordSet = Boolean(secrets.webdavPassword);
  return {
    enabled: secrets.enabled,
    intervalHours: secrets.intervalHours,
    webdavUrl: secrets.webdavUrl,
    webdavUsername: secrets.webdavUsername,
    webdavPasswordSet: passwordSet,
    remoteFolder: secrets.remoteFolder,
    maxFileBytes: secrets.maxFileBytes,
    includedTables: secrets.includedTables,
    lastAutoRunAt: secrets.lastAutoRunAt?.toISOString() ?? null,
    nextAutoRunAt: computeNextAutoRunAt(
      secrets.lastAutoRunAt,
      secrets.intervalHours,
      secrets.enabled,
    )?.toISOString() ?? null,
    runRequestedAt: secrets.runRequestedAt?.toISOString() ?? null,
    configured: isConfigured(secrets.webdavUrl, secrets.webdavUsername, passwordSet),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateDbBackupSettings(input: {
  enabled?: boolean;
  intervalHours?: number;
  webdavUrl?: string;
  webdavUsername?: string;
  /** null = очистить; undefined = не менять */
  webdavPassword?: string | null;
  remoteFolder?: string;
  maxFileBytes?: number;
  includedTables?: DbBackupIncludedTables;
}): Promise<DbBackupSettingsDto> {
  await ensureDbBackupSettings();

  const data: {
    enabled?: boolean;
    intervalHours?: number;
    webdavUrl?: string;
    webdavUsername?: string;
    webdavPassword?: string | null;
    remoteFolder?: string;
    maxFileBytes?: number;
    includedTables?: DbBackupIncludedTables;
  } = {};

  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.intervalHours !== undefined) {
    data.intervalHours = clampIntervalHours(input.intervalHours);
  }
  if (input.webdavUrl !== undefined) data.webdavUrl = input.webdavUrl.trim();
  if (input.webdavUsername !== undefined) data.webdavUsername = input.webdavUsername.trim();
  if (input.webdavPassword !== undefined) {
    data.webdavPassword = input.webdavPassword === null || input.webdavPassword === ""
      ? null
      : input.webdavPassword;
  }
  if (input.remoteFolder !== undefined) {
    const folder = input.remoteFolder.trim() || "/track-anime-backups";
    data.remoteFolder = folder.startsWith("/") ? folder : `/${folder}`;
  }
  if (input.maxFileBytes !== undefined) {
    data.maxFileBytes = clampMaxFileBytes(input.maxFileBytes);
  }
  if (input.includedTables !== undefined) {
    data.includedTables = normalizeIncludedTables(input.includedTables);
  }

  await prisma.dbBackupSettings.update({
    where: { id: DB_BACKUP_SETTINGS_ID },
    data,
  });

  return getDbBackupSettingsDto();
}

export async function requestDbBackupRun(): Promise<DbBackupSettingsDto> {
  await ensureDbBackupSettings();
  await prisma.dbBackupSettings.update({
    where: { id: DB_BACKUP_SETTINGS_ID },
    data: { runRequestedAt: new Date() },
  });
  return getDbBackupSettingsDto();
}

export async function clearDbBackupRunRequest(): Promise<void> {
  await prisma.dbBackupSettings.update({
    where: { id: DB_BACKUP_SETTINGS_ID },
    data: { runRequestedAt: null },
  });
}

export async function markDbBackupAutoRun(): Promise<void> {
  await prisma.dbBackupSettings.update({
    where: { id: DB_BACKUP_SETTINGS_ID },
    data: { lastAutoRunAt: new Date(), runRequestedAt: null },
  });
}

export function isTableIncluded(
  includedTables: DbBackupIncludedTables,
  tableName: string,
): boolean {
  if (Object.prototype.hasOwnProperty.call(includedTables, tableName)) {
    return includedTables[tableName] === true;
  }
  return true;
}
