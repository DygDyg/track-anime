import { NextResponse } from "next/server";
import { isAdminApiError, requireAdminApi } from "@/lib/auth/admin";
import { formatBytes, listDbBackupTables } from "@/lib/admin/db-backup";
import {
  DB_BACKUP_INTERVAL_HOURS_OPTIONS,
  DB_BACKUP_MAX_FILE_BYTES_OPTIONS,
  getDbBackupSettingsDto,
  normalizeIncludedTables,
  updateDbBackupSettings,
  type DbBackupIncludedTables,
} from "@/lib/admin/db-backup-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  const settings = await getDbBackupSettingsDto();
  const tables = await listDbBackupTables(settings.includedTables);
  const selectedBytes = tables.filter((t) => t.enabled).reduce((sum, t) => sum + t.bytes, 0);
  const totalBytes = tables.reduce((sum, t) => sum + t.bytes, 0);

  return NextResponse.json({
    settings,
    tables,
    totals: {
      tableCount: tables.length,
      selectedCount: tables.filter((t) => t.enabled).length,
      totalBytes,
      selectedBytes,
      totalBytesLabel: formatBytes(totalBytes),
      selectedBytesLabel: formatBytes(selectedBytes),
    },
    intervalHoursOptions: DB_BACKUP_INTERVAL_HOURS_OPTIONS,
    maxFileBytesOptions: DB_BACKUP_MAX_FILE_BYTES_OPTIONS,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (isAdminApiError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body as {
    enabled?: unknown;
    intervalHours?: unknown;
    webdavUrl?: unknown;
    webdavUsername?: unknown;
    webdavPassword?: unknown;
    clearWebdavPassword?: unknown;
    remoteFolder?: unknown;
    maxFileBytes?: unknown;
    includedTables?: unknown;
  };

  const patch: {
    enabled?: boolean;
    intervalHours?: number;
    webdavUrl?: string;
    webdavUsername?: string;
    webdavPassword?: string | null;
    remoteFolder?: string;
    maxFileBytes?: number;
    includedTables?: DbBackupIncludedTables;
  } = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled должен быть boolean" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }

  if (input.intervalHours !== undefined) {
    const intervalHours = Number(input.intervalHours);
    if (
      !Number.isInteger(intervalHours) ||
      !(DB_BACKUP_INTERVAL_HOURS_OPTIONS as readonly number[]).includes(intervalHours)
    ) {
      return NextResponse.json(
        { error: `intervalHours: одно из ${DB_BACKUP_INTERVAL_HOURS_OPTIONS.join(", ")}` },
        { status: 400 },
      );
    }
    patch.intervalHours = intervalHours;
  }

  if (input.webdavUrl !== undefined) {
    if (typeof input.webdavUrl !== "string") {
      return NextResponse.json({ error: "webdavUrl должен быть строкой" }, { status: 400 });
    }
    patch.webdavUrl = input.webdavUrl;
  }

  if (input.webdavUsername !== undefined) {
    if (typeof input.webdavUsername !== "string") {
      return NextResponse.json({ error: "webdavUsername должен быть строкой" }, { status: 400 });
    }
    patch.webdavUsername = input.webdavUsername;
  }

  if (input.clearWebdavPassword === true) {
    patch.webdavPassword = null;
  } else if (input.webdavPassword !== undefined) {
    if (typeof input.webdavPassword !== "string") {
      return NextResponse.json({ error: "webdavPassword должен быть строкой" }, { status: 400 });
    }
    if (input.webdavPassword.trim()) {
      patch.webdavPassword = input.webdavPassword;
    }
  }

  if (input.remoteFolder !== undefined) {
    if (typeof input.remoteFolder !== "string") {
      return NextResponse.json({ error: "remoteFolder должен быть строкой" }, { status: 400 });
    }
    patch.remoteFolder = input.remoteFolder;
  }

  if (input.maxFileBytes !== undefined) {
    const maxFileBytes = Number(input.maxFileBytes);
    if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1_000_000) {
      return NextResponse.json({ error: "maxFileBytes: минимум 1 МБ" }, { status: 400 });
    }
    patch.maxFileBytes = maxFileBytes;
  }

  if (input.includedTables !== undefined) {
    patch.includedTables = normalizeIncludedTables(input.includedTables);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const settings = await updateDbBackupSettings(patch);
  const tables = await listDbBackupTables(settings.includedTables);
  const selectedBytes = tables.filter((t) => t.enabled).reduce((sum, t) => sum + t.bytes, 0);
  const totalBytes = tables.reduce((sum, t) => sum + t.bytes, 0);

  return NextResponse.json({
    settings,
    tables,
    totals: {
      tableCount: tables.length,
      selectedCount: tables.filter((t) => t.enabled).length,
      totalBytes,
      selectedBytes,
      totalBytesLabel: formatBytes(totalBytes),
      selectedBytesLabel: formatBytes(selectedBytes),
    },
  });
}
