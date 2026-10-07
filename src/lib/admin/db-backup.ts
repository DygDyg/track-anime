import { gzipSync } from "zlib";
import { prisma } from "@/lib/prisma";
import {
  formatBytes,
  type DbBackupHistoryDto,
  type DbBackupRunDto,
  type DbBackupTableStat,
} from "@/lib/admin/db-backup-format";
import {
  clearDbBackupRunRequest,
  getDbBackupSettingsSecrets,
  isTableIncluded,
  markDbBackupAutoRun,
  type DbBackupIncludedTables,
} from "@/lib/admin/db-backup-settings";
import {
  joinWebDavUrl,
  webdavEnsurePath,
  webdavPutFile,
  webdavTestConnection,
  type WebDavClientOptions,
} from "@/lib/admin/db-backup-webdav";

export type { DbBackupHistoryDto, DbBackupRunDto, DbBackupTableStat };
export { formatBytes };

const STALE_RUNNING_MS = 3 * 60 * 60 * 1000;
const ROW_BATCH = 500;
/** Несжатый буфер ~⅓ лимита файла — gzip JSONL обычно сильно жмёт */
const UNCOMPRESSED_BUDGET_RATIO = 0.35;

const TABLE_LABELS: Record<string, string> = {
  KodikMaterial: "Материалы Kodik",
  KodikEpisode: "Серии Kodik",
  KodikEpisodeRelease: "Релизы (лента)",
  KodikSeason: "Сезоны Kodik",
  KodikMaterialGenre: "Жанры материалов",
  User: "Пользователи",
  UserAnimeListEntry: "Списки аниме",
  UserAnimeBookmark: "Закладки",
  UserWatchProgress: "Прогресс просмотра",
  UserListSync: "Синхронизация списков",
  UserRecentAnimeOpen: "Недавние открытия",
  UserNotificationPreferences: "Настройки уведомлений пользователей",
  UserNotificationLink: "Привязки уведомлений",
  PushSubscription: "Web Push подписки",
  FcmDeviceToken: "FCM токены",
  Session: "Сессии",
  ShikimoriAccount: "Аккаунты Shikimori",
  LocalCredential: "Локальные пароли",
  OAuthState: "OAuth state",
  QrLoginRequest: "QR-логин",
  SiteVisitor: "Посетители",
  SiteVisitDay: "Визиты по дням",
  SiteContentDay: "Контент по дням",
  SiteContentIdentityDay: "Идентичности по дням",
  AnimeWatchShareEvent: "Watch share",
  AnimeExternalIdMap: "Внешние ID (MAL)",
  AnimeRelationSnapshot: "Связанные аниме (кэш)",
  AnimeEpisodeSkipTime: "Тайминги OP/ED",
  CoverCacheSettings: "Настройки кэша обложек",
  KodikSyncSettings: "Настройки Kodik sync",
  KodikSyncRun: "История Kodik sync",
  KodikImportJob: "Импорт Kodik",
  NotificationSettings: "Настройки уведомлений",
  DbBackupSettings: "Настройки WebDAV-бекапа",
  DbBackupRun: "История WebDAV-бекапа",
  WatchPartySettings: "Совместный просмотр",
  WatchPartySession: "Комнаты совместного просмотра",
  WatchPartySessionParticipant: "Участники совместного просмотра",
  BrandRotationSettings: "Ротация бренда",
  AppPromoSettings: "Промо приложений",
  SearchSettings: "Поиск",
  SiteSettingsDefaults: "Дефолты настроек сайта",
  WatchHistorySettings: "История просмотра",
  ShikimoriSettings: "Shikimori",
  DiscordSettings: "Discord",
  TranslationIntroSettings: "Интро озвучек",
  AdminTodo: "Админ to-do",
  ShikimoriAnonsEntry: "Анонсы Shikimori",
  ShikimoriAnonsSyncState: "Состояние sync анонсов",
  HistoryNewNotification: "Уведомления «новое в истории»",
  NotificationDelivery: "Очередь доставки уведомлений",
  SiteFriend: "Друзья",
};

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Недопустимое имя таблицы: ${name}`);
  }
  return `"${name}"`;
}

function serializeCell(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { __type: "Buffer", data: value.toString("base64") };
  if (typeof value === "object") return value;
  return value;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = serializeCell(value);
  }
  return out;
}

function formatBackupFolderName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

export async function listDbBackupTables(
  includedTables: DbBackupIncludedTables = {},
): Promise<DbBackupTableStat[]> {
  const rows = await prisma.$queryRaw<
    Array<{ name: string; bytes: bigint | number; row_estimate: bigint | number }>
  >`
    SELECT
      c.relname AS name,
      pg_total_relation_size(c.oid) AS bytes,
      COALESCE(s.n_live_tup, 0) AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC, c.relname ASC
  `;

  return rows.map((row) => {
    const name = String(row.name);
    return {
      name,
      label: TABLE_LABELS[name] ?? name,
      bytes: Number(row.bytes),
      rowEstimate: Number(row.row_estimate),
      enabled: isTableIncluded(includedTables, name),
    };
  });
}

export async function isDbBackupRunning(): Promise<boolean> {
  const run = await prisma.dbBackupRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return false;
  if (Date.now() - run.startedAt.getTime() > STALE_RUNNING_MS) {
    await prisma.dbBackupRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        error: "Прервано: превышено время выполнения",
        finishedAt: new Date(),
        durationMs: Date.now() - run.startedAt.getTime(),
      },
    });
    return false;
  }
  return true;
}

function mapRun(row: {
  id: string;
  trigger: string;
  status: string;
  remoteFolder: string | null;
  uploadedFiles: number;
  uploadedBytes: bigint;
  tablesTotal: number;
  tablesDone: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}): DbBackupRunDto {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    remoteFolder: row.remoteFolder,
    uploadedFiles: row.uploadedFiles,
    uploadedBytes: row.uploadedBytes.toString(),
    tablesTotal: row.tablesTotal,
    tablesDone: row.tablesDone,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
  };
}

export async function getDbBackupHistory(limit = 20): Promise<DbBackupHistoryDto> {
  const runs = await prisma.dbBackupRun.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.min(50, Math.max(1, limit)),
  });
  return {
    runs: runs.map(mapRun),
    running: await isDbBackupRunning(),
  };
}

export async function testDbBackupWebDav(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const secrets = await getDbBackupSettingsSecrets();
  if (!secrets.webdavUrl.trim() || !secrets.webdavUsername.trim() || !secrets.webdavPassword) {
    return { ok: false, error: "Укажите URL, логин и пароль WebDAV" };
  }
  const client: WebDavClientOptions = {
    baseUrl: secrets.webdavUrl.trim(),
    auth: { username: secrets.webdavUsername.trim(), password: secrets.webdavPassword },
  };
  return webdavTestConnection(client, secrets.remoteFolder);
}

type BackupProgress = {
  uploadedFiles: number;
  uploadedBytes: number;
  tablesDone: number;
};

async function uploadGzipPart(
  client: WebDavClientOptions,
  remoteBase: string,
  relativePath: string,
  text: string,
  progress: BackupProgress,
  runId: string,
): Promise<void> {
  const compressed = gzipSync(Buffer.from(text, "utf8"));
  const remotePath = `${remoteBase.replace(/\/+$/, "")}/${relativePath}`.replace(/\/+/g, "/");
  await webdavPutFile(client, remotePath, compressed, "application/gzip");
  progress.uploadedFiles += 1;
  progress.uploadedBytes += compressed.byteLength;
  await prisma.dbBackupRun.update({
    where: { id: runId },
    data: {
      uploadedFiles: progress.uploadedFiles,
      uploadedBytes: BigInt(progress.uploadedBytes),
    },
  });
}

async function exportTableToWebDav(options: {
  client: WebDavClientOptions;
  remoteBase: string;
  tableName: string;
  maxFileBytes: number;
  progress: BackupProgress;
  runId: string;
}): Promise<{ parts: number; rows: number }> {
  const { client, remoteBase, tableName, maxFileBytes, progress, runId } = options;
  const ident = quoteIdent(tableName);
  const uncompressedBudget = Math.max(
    256 * 1024,
    Math.floor(maxFileBytes * UNCOMPRESSED_BUDGET_RATIO),
  );

  let offset = 0;
  let part = 1;
  let rowsTotal = 0;
  let buffer = "";

  const flush = async (force = false) => {
    if (!buffer && !force) return;
    if (!buffer) return;
    const fileName = `${tableName}.part${String(part).padStart(3, "0")}.jsonl.gz`;
    await uploadGzipPart(client, remoteBase, fileName, buffer, progress, runId);
    part += 1;
    buffer = "";
  };

  for (;;) {
    const batch = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${ident} ORDER BY ctid LIMIT ${ROW_BATCH} OFFSET ${offset}`,
    );
    if (batch.length === 0) break;

    for (const row of batch) {
      const line = `${JSON.stringify(serializeRow(row))}\n`;
      if (buffer.length > 0 && buffer.length + line.length > uncompressedBudget) {
        await flush();
      }
      buffer += line;
      rowsTotal += 1;
    }

    offset += batch.length;
    if (batch.length < ROW_BATCH) break;
  }

  await flush();
  return { parts: part - 1, rows: rowsTotal };
}

export type DbBackupRunResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      runId: string;
      remoteFolder: string;
      uploadedFiles: number;
      uploadedBytes: number;
      tablesDone: number;
    };

export async function runDbBackup(options: {
  trigger: "manual" | "auto" | "requested";
  skipIfRunning?: boolean;
}): Promise<DbBackupRunResult> {
  if (options.skipIfRunning !== false && (await isDbBackupRunning())) {
    return { skipped: true, reason: "backup_already_running" };
  }

  const secrets = await getDbBackupSettingsSecrets();
  if (!secrets.webdavUrl.trim() || !secrets.webdavUsername.trim() || !secrets.webdavPassword) {
    throw new Error("WebDAV не настроен: укажите URL, логин и пароль");
  }

  const tables = await listDbBackupTables(secrets.includedTables);
  const selected = tables.filter((t) => t.enabled);
  if (selected.length === 0) {
    throw new Error("Не выбрано ни одной таблицы для бекапа");
  }

  const folderName = formatBackupFolderName();
  const remoteBase = `${secrets.remoteFolder.replace(/\/+$/, "")}/${folderName}`;
  const client: WebDavClientOptions = {
    baseUrl: secrets.webdavUrl.trim(),
    auth: {
      username: secrets.webdavUsername.trim(),
      password: secrets.webdavPassword,
    },
  };

  const run = await prisma.dbBackupRun.create({
    data: {
      trigger: options.trigger,
      status: "running",
      remoteFolder: remoteBase,
      tablesTotal: selected.length,
      tablesDone: 0,
      uploadedFiles: 0,
      uploadedBytes: BigInt(0),
    },
  });

  const progress: BackupProgress = {
    uploadedFiles: 0,
    uploadedBytes: 0,
    tablesDone: 0,
  };
  const startedAt = run.startedAt.getTime();
  const tableManifest: Array<{
    name: string;
    label: string;
    rows: number;
    parts: number;
    bytesOnDisk: number;
  }> = [];

  try {
    await webdavEnsurePath(client, remoteBase);

    for (const table of selected) {
      const result = await exportTableToWebDav({
        client,
        remoteBase,
        tableName: table.name,
        maxFileBytes: secrets.maxFileBytes,
        progress,
        runId: run.id,
      });
      tableManifest.push({
        name: table.name,
        label: table.label,
        rows: result.rows,
        parts: result.parts,
        bytesOnDisk: table.bytes,
      });
      progress.tablesDone += 1;
      await prisma.dbBackupRun.update({
        where: { id: run.id },
        data: { tablesDone: progress.tablesDone },
      });
    }

    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      trigger: options.trigger,
      format: "jsonl.gz",
      note: "Каждая строка файла — JSON-объект строки таблицы. Восстановление — отдельный импорт.",
      maxFileBytes: secrets.maxFileBytes,
      tables: tableManifest,
      uploadedFiles: progress.uploadedFiles,
      uploadedBytes: progress.uploadedBytes,
    };
    const manifestBuf = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await webdavPutFile(
      client,
      `${remoteBase}/manifest.json`,
      manifestBuf,
      "application/json",
    );
    progress.uploadedFiles += 1;
    progress.uploadedBytes += manifestBuf.byteLength;

    await prisma.dbBackupRun.update({
      where: { id: run.id },
      data: {
        status: "done",
        uploadedFiles: progress.uploadedFiles,
        uploadedBytes: BigInt(progress.uploadedBytes),
        tablesDone: progress.tablesDone,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: null,
      },
    });

    if (options.trigger === "auto" || options.trigger === "requested") {
      await markDbBackupAutoRun();
    } else {
      await clearDbBackupRunRequest();
    }

    return {
      skipped: false,
      runId: run.id,
      remoteFolder: remoteBase,
      uploadedFiles: progress.uploadedFiles,
      uploadedBytes: progress.uploadedBytes,
      tablesDone: progress.tablesDone,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.dbBackupRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        error: message.slice(0, 2000),
        uploadedFiles: progress.uploadedFiles,
        uploadedBytes: BigInt(progress.uploadedBytes),
        tablesDone: progress.tablesDone,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });
    await clearDbBackupRunRequest();
    throw error;
  }
}

/** Для UI: полный URL папки бекапа (без гарантии публичного доступа). */
export function buildRemoteFolderHint(webdavUrl: string, remoteFolder: string): string {
  if (!webdavUrl.trim()) return remoteFolder;
  return joinWebDavUrl(webdavUrl.trim(), remoteFolder);
}
