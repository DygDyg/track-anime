import { prisma } from "@/lib/prisma";

export type DbFieldType = "string" | "int" | "boolean" | "datetime";

export type DbSearchMode = "exact" | "contains";

export type DbModelKey =
  | "KodikMaterial"
  | "KodikEpisode"
  | "KodikEpisodeRelease"
  | "KodikSeason"
  | "User"
  | "UserAnimeListEntry"
  | "UserAnimeBookmark"
  | "UserWatchProgress"
  | "UserListSync"
  | "KodikSyncRun"
  | "KodikImportJob"
  | "KodikSyncSettings";

type FieldDef = {
  label: string;
  type: DbFieldType;
};

type ModelDef = {
  label: string;
  columns: string[];
  searchable: Record<string, FieldDef>;
};

export const DB_EXPLORER_MODELS: Record<DbModelKey, ModelDef> = {
  KodikMaterial: {
    label: "Материалы Kodik",
    columns: [
      "kodikId",
      "shikimoriId",
      "type",
      "title",
      "titleOrig",
      "year",
      "translationId",
      "translationTitle",
      "lastSeason",
      "lastEpisode",
      "episodesCount",
      "episodesLoaded",
      "kodikUpdatedAt",
      "updatedAt",
    ],
    searchable: {
      kodikId: { label: "Kodik ID", type: "string" },
      shikimoriId: { label: "Shikimori ID", type: "int" },
      title: { label: "Название", type: "string" },
      titleOrig: { label: "Ориг. название", type: "string" },
      translationId: { label: "ID озвучки", type: "int" },
      translationTitle: { label: "Озвучка", type: "string" },
      type: { label: "Тип", type: "string" },
      episodesLoaded: { label: "Серии загружены", type: "boolean" },
    },
  },
  KodikEpisode: {
    label: "Серии Kodik",
    columns: [
      "id",
      "materialId",
      "seasonNumber",
      "episodeNumber",
      "title",
      "firstSeenAt",
      "updatedAt",
    ],
    searchable: {
      id: { label: "ID", type: "string" },
      materialId: { label: "Material ID", type: "string" },
      seasonNumber: { label: "Сезон", type: "int" },
      episodeNumber: { label: "Серия", type: "int" },
      title: { label: "Название", type: "string" },
    },
  },
  KodikEpisodeRelease: {
    label: "Релизы (лента)",
    columns: [
      "id",
      "shikimoriId",
      "materialId",
      "seasonNumber",
      "episodeNumber",
      "translationId",
      "translationName",
      "animeTitle",
      "releasedAt",
    ],
    searchable: {
      shikimoriId: { label: "Shikimori ID", type: "int" },
      materialId: { label: "Material ID", type: "string" },
      animeTitle: { label: "Название", type: "string" },
      translationName: { label: "Озвучка", type: "string" },
      seasonNumber: { label: "Сезон", type: "int" },
      episodeNumber: { label: "Серия", type: "int" },
    },
  },
  KodikSeason: {
    label: "Сезоны Kodik",
    columns: ["id", "materialId", "seasonNumber", "playerLink"],
    searchable: {
      id: { label: "ID", type: "string" },
      materialId: { label: "Material ID", type: "string" },
      seasonNumber: { label: "Сезон", type: "int" },
    },
  },
  User: {
    label: "Пользователи",
    columns: ["id", "shikimoriId", "nickname", "isAdmin", "createdAt", "updatedAt"],
    searchable: {
      id: { label: "ID", type: "string" },
      shikimoriId: { label: "Shikimori ID", type: "int" },
      nickname: { label: "Ник", type: "string" },
      isAdmin: { label: "Админ", type: "boolean" },
    },
  },
  UserAnimeListEntry: {
    label: "Списки аниме",
    columns: [
      "id",
      "userId",
      "shikimoriId",
      "listStatus",
      "userScore",
      "watchedEpisodes",
      "listUpdatedAt",
    ],
    searchable: {
      userId: { label: "User ID", type: "string" },
      shikimoriId: { label: "Shikimori ID", type: "int" },
      listStatus: { label: "Статус", type: "string" },
    },
  },
  UserAnimeBookmark: {
    label: "Закладки аниме",
    columns: ["id", "userId", "shikimoriId", "createdAt"],
    searchable: {
      userId: { label: "User ID", type: "string" },
      shikimoriId: { label: "Shikimori ID", type: "int" },
    },
  },
  UserWatchProgress: {
    label: "Прогресс просмотра",
    columns: [
      "id",
      "userId",
      "shikimoriId",
      "kodikId",
      "seasonNumber",
      "episodeNumber",
      "positionSeconds",
      "updatedAt",
    ],
    searchable: {
      userId: { label: "User ID", type: "string" },
      shikimoriId: { label: "Shikimori ID", type: "int" },
      kodikId: { label: "Kodik ID", type: "string" },
    },
  },
  UserListSync: {
    label: "Синхронизация списков",
    columns: ["userId", "lastSyncedAt", "lastSyncError", "mangaBookmarkCount", "updatedAt"],
    searchable: {
      userId: { label: "User ID", type: "string" },
    },
  },
  KodikSyncRun: {
    label: "Запуски sync",
    columns: [
      "id",
      "trigger",
      "status",
      "checkedMaterials",
      "updatedMaterials",
      "newReleases",
      "error",
      "startedAt",
      "finishedAt",
    ],
    searchable: {
      id: { label: "ID", type: "string" },
      trigger: { label: "Триггер", type: "string" },
      status: { label: "Статус", type: "string" },
    },
  },
  KodikImportJob: {
    label: "Импорт",
    columns: [
      "id",
      "phase",
      "status",
      "processed",
      "total",
      "currentItem",
      "lastError",
      "updatedAt",
    ],
    searchable: {
      id: { label: "ID", type: "string" },
      phase: { label: "Фаза", type: "string" },
      status: { label: "Статус", type: "string" },
    },
  },
  KodikSyncSettings: {
    label: "Настройки sync",
    columns: ["id", "enabled", "intervalMinutes", "syncPages", "lastAutoRunAt", "updatedAt"],
    searchable: {
      id: { label: "ID", type: "string" },
      enabled: { label: "Включено", type: "boolean" },
    },
  },
};

export const DB_MODEL_KEYS = Object.keys(DB_EXPLORER_MODELS) as DbModelKey[];

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 50;

export function isDbModelKey(value: string): value is DbModelKey {
  return value in DB_EXPLORER_MODELS;
}

function parseSearchValue(type: DbFieldType, raw: string): string | number | boolean | Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  switch (type) {
    case "int": {
      const n = Number(trimmed);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "boolean":
      if (trimmed === "true" || trimmed === "1") return true;
      if (trimmed === "false" || trimmed === "0") return false;
      return null;
    case "datetime": {
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    default:
      return trimmed;
  }
}

function buildWhere(
  field: string,
  fieldType: DbFieldType,
  value: string,
  mode: DbSearchMode,
): Record<string, unknown> | null {
  const parsed = parseSearchValue(fieldType, value);
  if (parsed === null) return null;

  if (fieldType === "string") {
    if (mode === "contains") {
      return { [field]: { contains: String(parsed), mode: "insensitive" } };
    }
    return { [field]: parsed };
  }

  return { [field]: parsed };
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = serializeValue(value);
  }
  return out;
}

type SearchParams = {
  model: DbModelKey;
  field?: string;
  value?: string;
  mode?: DbSearchMode;
  page?: number;
  limit?: number;
};

export type DbSearchResult = {
  model: DbModelKey;
  modelLabel: string;
  columns: string[];
  rows: Record<string, unknown>[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type DbTableCount = number | null;

function isMissingTableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "P2021") return true;
  return (
    typeof e.message === "string" &&
    e.message.includes("does not exist in the current database")
  );
}

async function safeCount(fn: () => Promise<number>): Promise<DbTableCount> {
  try {
    return await fn();
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

async function safeFindMany<T extends Record<string, unknown>>(
  fn: () => Promise<T[]>,
): Promise<T[] | null> {
  try {
    return await fn();
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

async function countModel(model: DbModelKey, where: Record<string, unknown>): Promise<DbTableCount> {
  switch (model) {
    case "KodikMaterial":
      return safeCount(() => prisma.kodikMaterial.count({ where }));
    case "KodikEpisode":
      return safeCount(() => prisma.kodikEpisode.count({ where }));
    case "KodikEpisodeRelease":
      return safeCount(() => prisma.kodikEpisodeRelease.count({ where }));
    case "KodikSeason":
      return safeCount(() => prisma.kodikSeason.count({ where }));
    case "User":
      return safeCount(() => prisma.user.count({ where }));
    case "UserAnimeListEntry":
      return safeCount(() => prisma.userAnimeListEntry.count({ where }));
    case "UserAnimeBookmark":
      return safeCount(() => prisma.userAnimeBookmark.count({ where }));
    case "UserWatchProgress":
      return safeCount(() => prisma.userWatchProgress.count({ where }));
    case "UserListSync":
      return safeCount(() => prisma.userListSync.count({ where }));
    case "KodikSyncRun":
      return safeCount(() => prisma.kodikSyncRun.count({ where }));
    case "KodikImportJob":
      return safeCount(() => prisma.kodikImportJob.count({ where }));
    case "KodikSyncSettings":
      return safeCount(() => prisma.kodikSyncSettings.count({ where }));
  }
}

async function findModel(
  model: DbModelKey,
  where: Record<string, unknown>,
  skip: number,
  take: number,
): Promise<Record<string, unknown>[] | null> {
  const select = Object.fromEntries(
    DB_EXPLORER_MODELS[model].columns.map((column) => [column, true]),
  );

  switch (model) {
    case "KodikMaterial":
      return safeFindMany(() =>
        prisma.kodikMaterial.findMany({ where, select, skip, take, orderBy: { updatedAt: "desc" } }),
      );
    case "KodikEpisode":
      return safeFindMany(() =>
        prisma.kodikEpisode.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { updatedAt: "desc" },
        }),
      );
    case "KodikEpisodeRelease":
      return safeFindMany(() =>
        prisma.kodikEpisodeRelease.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { releasedAt: "desc" },
        }),
      );
    case "KodikSeason":
      return safeFindMany(() =>
        prisma.kodikSeason.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { seasonNumber: "asc" },
        }),
      );
    case "User":
      return safeFindMany(() =>
        prisma.user.findMany({ where, select, skip, take, orderBy: { createdAt: "desc" } }),
      );
    case "UserAnimeListEntry":
      return safeFindMany(() =>
        prisma.userAnimeListEntry.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { updatedAt: "desc" },
        }),
      );
    case "UserAnimeBookmark":
      return safeFindMany(() =>
        prisma.userAnimeBookmark.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
      );
    case "UserWatchProgress":
      return safeFindMany(() =>
        prisma.userWatchProgress.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { updatedAt: "desc" },
        }),
      );
    case "UserListSync":
      return safeFindMany(() =>
        prisma.userListSync.findMany({ where, select, skip, take, orderBy: { updatedAt: "desc" } }),
      );
    case "KodikSyncRun":
      return safeFindMany(() =>
        prisma.kodikSyncRun.findMany({
          where,
          select,
          skip,
          take,
          orderBy: { startedAt: "desc" },
        }),
      );
    case "KodikImportJob":
      return safeFindMany(() =>
        prisma.kodikImportJob.findMany({ where, select, skip, take, orderBy: { updatedAt: "desc" } }),
      );
    case "KodikSyncSettings":
      return safeFindMany(() =>
        prisma.kodikSyncSettings.findMany({ where, select, skip, take, orderBy: { id: "asc" } }),
      );
  }
}

export async function searchDb(params: SearchParams): Promise<DbSearchResult | { error: string }> {
  const def = DB_EXPLORER_MODELS[params.model];
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, params.limit ?? PAGE_SIZE_DEFAULT));
  const skip = (page - 1) * limit;

  let where: Record<string, unknown> = {};

  if (params.field && params.value !== undefined && params.value !== "") {
    const fieldDef = def.searchable[params.field];
    if (!fieldDef) {
      return { error: "Недопустимое поле для поиска" };
    }

    const mode = params.mode ?? "contains";
    const built = buildWhere(params.field, fieldDef.type, params.value, mode);
    if (built === null) {
      return { error: "Некорректное значение для выбранного поля" };
    }
    where = built;
  }

  const [total, rows] = await Promise.all([
    countModel(params.model, where),
    findModel(params.model, where, skip, limit),
  ]);

  if (total === null || rows === null) {
    return { error: "Таблица не создана в этой БД — выполните prisma migrate deploy" };
  }

  return {
    model: params.model,
    modelLabel: def.label,
    columns: def.columns,
    rows: rows.map((row) => serializeRow(row)),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getDbTableCounts(): Promise<Record<DbModelKey, DbTableCount>> {
  const entries = await Promise.all(
    DB_MODEL_KEYS.map(async (key) => {
      try {
        return [key, await countModel(key, {})] as const;
      } catch {
        return [key, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<DbModelKey, DbTableCount>;
}
