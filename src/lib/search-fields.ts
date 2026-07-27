import { labelKind, labelStatus, statusBadgeClass } from "@/lib/anime-labels";
import { getAnimeKindDescription } from "@/lib/anime-kind-descriptions";
import { kindBadgeClass } from "@/lib/anime-kind-theme";

export type SearchSortMode = "relevance" | "date";

export function parseSearchSort(value: string | null | undefined): SearchSortMode {
  return value === "date" ? "date" : "relevance";
}

export const SEARCH_FIELD_PARAM_PREFIX = "f";
export const SEARCH_YEAR_FROM_PARAM = `${SEARCH_FIELD_PARAM_PREFIX}yearFrom`;
export const SEARCH_YEAR_TO_PARAM = `${SEARCH_FIELD_PARAM_PREFIX}yearTo`;
export const SEARCH_MIN_RATING_PARAM = `${SEARCH_FIELD_PARAM_PREFIX}minRating`;

export const SEARCH_YEAR_MIN = 1963;
export const SEARCH_YEAR_MAX = new Date().getFullYear() + 1;
export const SEARCH_RATING_MIN = 0;
export const SEARCH_RATING_MAX = 10;
export const SEARCH_MAX_FIELD_LENGTH = 160;
export const SEARCH_MAX_GENRES = 6;
export const SEARCH_MAX_GENRE_LENGTH = 80;

const KIND_VALUES = ["tv", "tv_13", "tv_24", "tv_48", "movie", "ova", "ona", "special", "music"] as const;
const STATUS_VALUES = ["ongoing", "released", "anons", "latest"] as const;

export type SearchFieldId =
  | "title"
  | "animeTitle"
  | "genre"
  | "kind"
  | "status"
  | "studio"
  | "description";

export type AdvancedSearchFilters = Partial<Record<SearchFieldId, string>> & {
  yearFrom?: string;
  yearTo?: string;
  minRating?: string;
};

export type SearchTabId = "quick" | "advanced";

export const SEARCH_KIND_OPTIONS: Array<{
  value: string;
  label: string;
  badgeClass: string | null;
  description?: string | null;
}> = [
  { value: "", label: "— любой —", badgeClass: null },
  ...KIND_VALUES.map((value) => ({
    value,
    label: labelKind(value) ?? value,
    badgeClass: kindBadgeClass(value),
    description: getAnimeKindDescription(value),
  })),
];

export const SEARCH_STATUS_OPTIONS: Array<{
  value: string;
  label: string;
  badgeClass: string | null;
  description?: string | null;
}> = [
  { value: "", label: "— любой —", badgeClass: null },
  ...STATUS_VALUES.map((value) => ({
    value,
    label: labelStatus(value) ?? value,
    badgeClass: statusBadgeClass(value),
  })),
];

export const SEARCH_COMBOBOX_FIELD_OPTIONS: Array<{
  id: Exclude<SearchFieldId, "genre">;
  label: string;
  placeholder: string;
  inputMode?: "text" | "numeric";
}> = [
  { id: "title", label: "Название", placeholder: "Русское, romaji, альтернативное…" },
  { id: "animeTitle", label: "anime_title", placeholder: "Поле anime_title в material_data" },
  {
    id: "description",
    label: "Описание / синопсис",
    placeholder: "Фрагмент текста описания…",
  },
  { id: "studio", label: "Студия", placeholder: "C2C, MAPPA…" },
];

export const SEARCH_GENRE_PLACEHOLDER = "Начните вводить…";

/** Разбирает строку жанров: «Исэкай, Экшен» → массив без дубликатов. */
export function parseGenreList(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of value.split(",")) {
    const trimmed = part.trim().slice(0, SEARCH_MAX_GENRE_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= SEARCH_MAX_GENRES) break;
  }

  return result;
}

/** Сериализует жанры в строку для URL и формы. */
export function serializeGenreList(genres: string[]): string {
  return parseGenreList(genres.join(", ")).join(", ");
}

/** @deprecated use SEARCH_COMBOBOX_FIELD_OPTIONS */
export const SEARCH_FIELD_OPTIONS = SEARCH_COMBOBOX_FIELD_OPTIONS;

const FIELD_IDS = new Set<string>([
  ...SEARCH_COMBOBOX_FIELD_OPTIONS.map((item) => item.id),
  "genre",
  "kind",
  "status",
]);

export function isSearchFieldId(value: string): value is SearchFieldId {
  return FIELD_IDS.has(value);
}

export function searchFieldParamName(id: SearchFieldId): string {
  return `${SEARCH_FIELD_PARAM_PREFIX}${id}`;
}

export function parseSearchTab(value: string | null | undefined): SearchTabId {
  return value === "advanced" ? "advanced" : "quick";
}

function readParam(
  params: URLSearchParams | Record<string, string | undefined>,
  key: string,
): string | undefined {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  return raw?.trim().slice(0, SEARCH_MAX_FIELD_LENGTH) || undefined;
}

function parseYearParam(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  const rounded = Math.floor(year);
  if (rounded < SEARCH_YEAR_MIN || rounded > SEARCH_YEAR_MAX) return null;
  return rounded;
}

function parseMinRatingParam(value: string | undefined): number | null {
  if (!value) return null;
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  const rounded = Math.round(rating * 10) / 10;
  if (rounded < SEARCH_RATING_MIN || rounded > SEARCH_RATING_MAX) return null;
  return rounded;
}

export function isMinRatingActive(filters: AdvancedSearchFilters): boolean {
  const rating = parseMinRatingParam(filters.minRating);
  return rating != null && rating > SEARCH_RATING_MIN;
}

export function isYearRangeActive(filters: AdvancedSearchFilters): boolean {
  const from = parseYearParam(filters.yearFrom);
  const to = parseYearParam(filters.yearTo);
  if (from == null && to == null) return false;
  const effectiveFrom = from ?? SEARCH_YEAR_MIN;
  const effectiveTo = to ?? SEARCH_YEAR_MAX;
  return effectiveFrom > SEARCH_YEAR_MIN || effectiveTo < SEARCH_YEAR_MAX;
}

export function parseAdvancedFiltersFromParams(
  params: URLSearchParams | Record<string, string | undefined>,
): AdvancedSearchFilters {
  const filters: AdvancedSearchFilters = {};

  for (const option of SEARCH_COMBOBOX_FIELD_OPTIONS) {
    const key = searchFieldParamName(option.id);
    const value = readParam(params, key);
    if (value) filters[option.id] = value;
  }

  const genre = readParam(params, searchFieldParamName("genre"));
  if (genre) filters.genre = serializeGenreList(parseGenreList(genre));

  const kind = readParam(params, searchFieldParamName("kind"));
  const status = readParam(params, searchFieldParamName("status"));
  if (kind) filters.kind = kind;
  if (status) filters.status = status;

  const yearFrom = parseYearParam(readParam(params, SEARCH_YEAR_FROM_PARAM));
  const yearTo = parseYearParam(readParam(params, SEARCH_YEAR_TO_PARAM));
  if (yearFrom != null) filters.yearFrom = String(yearFrom);
  if (yearTo != null) filters.yearTo = String(yearTo);

  const minRating = parseMinRatingParam(readParam(params, SEARCH_MIN_RATING_PARAM));
  if (minRating != null && minRating > SEARCH_RATING_MIN) {
    filters.minRating = String(minRating);
  }

  const legacyYear = readParam(params, `${SEARCH_FIELD_PARAM_PREFIX}year`);
  if (legacyYear && !filters.yearFrom && !filters.yearTo) {
    const year = parseYearParam(legacyYear);
    if (year != null) {
      filters.yearFrom = String(year);
      filters.yearTo = String(year);
    }
  }

  if (!filters.title?.trim()) {
    const legacyOrig = readParam(params, `${SEARCH_FIELD_PARAM_PREFIX}titleOrig`);
    const legacyOther = readParam(params, `${SEARCH_FIELD_PARAM_PREFIX}otherTitle`);
    const legacy = legacyOrig || legacyOther;
    if (legacy) filters.title = legacy;
  }

  return filters;
}

export function countAdvancedFilters(filters: AdvancedSearchFilters): number {
  let count = SEARCH_COMBOBOX_FIELD_OPTIONS.filter((option) => Boolean(filters[option.id]?.trim())).length;
  if (parseGenreList(filters.genre).length > 0) count += 1;
  if (filters.kind?.trim()) count += 1;
  if (filters.status?.trim()) count += 1;
  if (isYearRangeActive(filters)) count += 1;
  if (isMinRatingActive(filters)) count += 1;
  return count;
}

export function hasAdvancedFilters(filters: AdvancedSearchFilters): boolean {
  return countAdvancedFilters(filters) > 0;
}

export function buildAdvancedSearchParams(
  filters: AdvancedSearchFilters,
  page?: number,
  sort?: SearchSortMode,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tab", "advanced");

  for (const option of SEARCH_COMBOBOX_FIELD_OPTIONS) {
    const value = filters[option.id]?.trim();
    if (value) params.set(searchFieldParamName(option.id), value);
  }

  const genres = serializeGenreList(parseGenreList(filters.genre));
  if (genres) params.set(searchFieldParamName("genre"), genres);

  if (filters.kind?.trim()) params.set(searchFieldParamName("kind"), filters.kind.trim());
  if (filters.status?.trim()) params.set(searchFieldParamName("status"), filters.status.trim());

  if (isYearRangeActive(filters)) {
    const from = parseYearParam(filters.yearFrom) ?? SEARCH_YEAR_MIN;
    const to = parseYearParam(filters.yearTo) ?? SEARCH_YEAR_MAX;
    params.set(SEARCH_YEAR_FROM_PARAM, String(from));
    params.set(SEARCH_YEAR_TO_PARAM, String(to));
  }

  if (isMinRatingActive(filters)) {
    const rating = parseMinRatingParam(filters.minRating);
    if (rating != null) params.set(SEARCH_MIN_RATING_PARAM, String(rating));
  }

  if (sort === "date") params.set("sort", "date");
  if (page && page > 1) params.set("page", String(page));

  return params;
}

export function buildAdvancedSearchHref(
  filters: AdvancedSearchFilters,
  page?: number,
  sort?: SearchSortMode,
): string {
  const params = buildAdvancedSearchParams(filters, page, sort);
  const serialized = params.toString();
  return serialized ? `/search?${serialized}` : "/search?tab=advanced";
}

function formatYearRange(filters: AdvancedSearchFilters): string | null {
  if (!isYearRangeActive(filters)) return null;
  const from = parseYearParam(filters.yearFrom) ?? SEARCH_YEAR_MIN;
  const to = parseYearParam(filters.yearTo) ?? SEARCH_YEAR_MAX;
  return from === to ? String(from) : `${from}–${to}`;
}

export function advancedFiltersSummary(filters: AdvancedSearchFilters): string {
  const parts: string[] = [];

  for (const option of SEARCH_COMBOBOX_FIELD_OPTIONS) {
    const value = filters[option.id]?.trim();
    if (value) parts.push(`${option.label}: ${value}`);
  }

  const genres = parseGenreList(filters.genre);
  if (genres.length > 0) parts.push(`Жанры: ${genres.join(", ")}`);

  if (filters.kind?.trim()) {
    const label = SEARCH_KIND_OPTIONS.find((item) => item.value === filters.kind)?.label ?? filters.kind;
    parts.push(`Тип: ${label}`);
  }

  if (filters.status?.trim()) {
    const label =
      SEARCH_STATUS_OPTIONS.find((item) => item.value === filters.status)?.label ?? filters.status;
    parts.push(`Статус: ${label}`);
  }

  const yearRange = formatYearRange(filters);
  if (yearRange) parts.push(`Год: ${yearRange}`);

  if (isMinRatingActive(filters)) {
    const rating = parseMinRatingParam(filters.minRating);
    if (rating != null) parts.push(`Рейтинг от ${rating.toFixed(1)}`);
  }

  return parts.join(" · ");
}

export function emptyAdvancedFilters(): AdvancedSearchFilters {
  return {
    ...Object.fromEntries(SEARCH_COMBOBOX_FIELD_OPTIONS.map((option) => [option.id, ""])),
    genre: "",
  } as AdvancedSearchFilters;
}

export function buildSearchApiParams(input: {
  tab?: SearchTabId;
  query?: string;
  genre?: string | null;
  advancedFilters?: AdvancedSearchFilters;
  page: number;
  pageSize?: number;
  includeTotal?: boolean;
  sort?: SearchSortMode;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.includeTotal === false) params.set("includeTotal", "0");
  if (input.sort === "date") params.set("sort", "date");

  if (input.tab === "advanced" && input.advancedFilters) {
    const built = buildAdvancedSearchParams(input.advancedFilters, input.page, input.sort);
    built.forEach((value, key) => params.set(key, value));
    return params;
  }

  const genre = input.genre?.trim();
  const query = input.query?.trim();
  if (genre) params.set("genre", genre);
  if (query) params.set("q", query);

  return params;
}
