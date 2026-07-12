import { prisma } from "@/lib/prisma";
import {
  DEFAULT_HEADER_SEARCH_DEBOUNCE_MS,
  MAX_HEADER_SEARCH_DEBOUNCE_MS,
  MIN_HEADER_SEARCH_DEBOUNCE_MS,
} from "@/lib/search-shared";

export const SEARCH_SETTINGS_ID = "default";
const SETTINGS_CACHE_MS = 30_000;

export type SearchSettingsDto = {
  headerSearchDebounceMs: number;
  updatedAt: string;
};

type SearchSettingsRow = {
  headerSearchDebounceMs: number;
  updatedAt: Date;
};

type SearchSettingsDelegate = {
  upsert(args: {
    where: { id: string };
    create: { id: string; headerSearchDebounceMs: number };
    update: Record<string, never>;
  }): Promise<unknown>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<SearchSettingsRow>;
  update(args: {
    where: { id: string };
    data: { headerSearchDebounceMs?: number };
  }): Promise<unknown>;
};

const DEFAULT_SEARCH_SETTINGS_DTO: SearchSettingsDto = {
  headerSearchDebounceMs: DEFAULT_HEADER_SEARCH_DEBOUNCE_MS,
  updatedAt: new Date(0).toISOString(),
};

let cachedHeaderSearchDebounceMs: { value: number; at: number } | null = null;

function searchSettingsDelegate(): SearchSettingsDelegate | null {
  const delegate = (prisma as unknown as { searchSettings?: SearchSettingsDelegate }).searchSettings;
  return delegate && typeof delegate.upsert === "function" ? delegate : null;
}

export function clampHeaderSearchDebounceMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HEADER_SEARCH_DEBOUNCE_MS;
  return Math.min(
    MAX_HEADER_SEARCH_DEBOUNCE_MS,
    Math.max(MIN_HEADER_SEARCH_DEBOUNCE_MS, Math.round(value)),
  );
}

function toDto(row: SearchSettingsRow): SearchSettingsDto {
  return {
    headerSearchDebounceMs: clampHeaderSearchDebounceMs(row.headerSearchDebounceMs),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureSearchSettings(): Promise<void> {
  const delegate = searchSettingsDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await delegate.upsert({
    where: { id: SEARCH_SETTINGS_ID },
    create: {
      id: SEARCH_SETTINGS_ID,
      headerSearchDebounceMs: DEFAULT_HEADER_SEARCH_DEBOUNCE_MS,
    },
    update: {},
  });
}

export function invalidateSearchSettingsCache(): void {
  cachedHeaderSearchDebounceMs = null;
}

export async function getSearchSettingsDto(): Promise<SearchSettingsDto> {
  try {
    await ensureSearchSettings();
    const delegate = searchSettingsDelegate();
    if (!delegate) return DEFAULT_SEARCH_SETTINGS_DTO;
    const row = await delegate.findUniqueOrThrow({ where: { id: SEARCH_SETTINGS_ID } });
    return toDto(row);
  } catch (error) {
    console.warn("[search-settings] dto fallback:", error);
    return DEFAULT_SEARCH_SETTINGS_DTO;
  }
}

export async function getHeaderSearchDebounceMs(): Promise<number> {
  if (cachedHeaderSearchDebounceMs && Date.now() - cachedHeaderSearchDebounceMs.at < SETTINGS_CACHE_MS) {
    return cachedHeaderSearchDebounceMs.value;
  }

  try {
    await ensureSearchSettings();
    const delegate = searchSettingsDelegate();
    if (!delegate) return DEFAULT_HEADER_SEARCH_DEBOUNCE_MS;
    const row = await delegate.findUniqueOrThrow({ where: { id: SEARCH_SETTINGS_ID } });
    const value = clampHeaderSearchDebounceMs(row.headerSearchDebounceMs);
    cachedHeaderSearchDebounceMs = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.warn("[search-settings] runtime fallback:", error);
    return DEFAULT_HEADER_SEARCH_DEBOUNCE_MS;
  }
}

export async function updateSearchSettings(input: {
  headerSearchDebounceMs?: number;
}): Promise<SearchSettingsDto> {
  await ensureSearchSettings();

  const data: { headerSearchDebounceMs?: number } = {};
  if (input.headerSearchDebounceMs !== undefined) {
    data.headerSearchDebounceMs = clampHeaderSearchDebounceMs(input.headerSearchDebounceMs);
  }

  const delegate = searchSettingsDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите dev-сервер");
  }

  await delegate.update({
    where: { id: SEARCH_SETTINGS_ID },
    data,
  });

  invalidateSearchSettingsCache();
  return getSearchSettingsDto();
}
