import "server-only";

import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { normalizeAnimeScore } from "@/lib/anime-score";
import { normalizeKodikGenreKey } from "@/lib/kodik-material-meta";
import { prisma } from "@/lib/prisma";
import { withPublicSearchSlot } from "@/lib/search-protection";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  escapeIlikePattern,
  type SearchPage,
  type SearchResult,
  type SearchResultDto,
  type SearchSortMode,
} from "@/lib/search-shared";
import type { AdvancedSearchFilters } from "@/lib/search-fields";
import {
  hasAdvancedFilters,
  isMinRatingActive,
  isYearRangeActive,
  parseGenreList,
  serializeGenreList,
  SEARCH_YEAR_MAX,
  SEARCH_YEAR_MIN,
} from "@/lib/search-fields";
import { getAlternateKeyboardLayoutQuery } from "@/lib/keyboard-layout";

/** Сколько уникальных аниме обрабатываем до тяжёлой агрегации meta. */
const SEARCH_CANDIDATE_POOL_MIN = 120;
const SEARCH_CANDIDATE_POOL_MAX = 500;
const SEARCH_CANDIDATE_POOL_DEEP_MAX = 2000;
const DESCRIPTION_MATCH_RANK = 4;
/** Строгий fuzzy по всем токенам названия. */
const FUZZY_TITLE_MATCH_RANK = 4;
/** Частичный fuzzy (не все токены) — только fallback при пустой выдаче. */
const PARTIAL_FUZZY_TITLE_MATCH_RANK = 5;
const FUZZY_SEARCH_MAX_IDS = 160;
const FUZZY_SEARCH_MIN_TOKEN_LENGTH = 4;
/** Минимум сильных токенов в запросе, чтобы включать partial-fallback. */
const PARTIAL_FUZZY_MIN_QUERY_TOKENS = 2;

type FuzzySearchMode = "strict" | "partial";

export {
  SEARCH_MAX_PAGE,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  buildSearchHref,
  parseSearchSort,
  type SearchPage,
  type SearchResult,
  type SearchResultDto,
  type SearchSortMode,
} from "@/lib/search-shared";

const GENRES_JSON = Prisma.sql`
  COALESCE(
    m."materialData"->'anime_genres',
    m."materialData"->'all_genres',
    m."materialData"->'genres',
    '[]'::jsonb
  )
`;

function emptySearchPage(
  page: number,
  pageSize: number,
  query = "",
  genre: string | null = null,
  tab: SearchPage["tab"] = "quick",
  advancedFilters: AdvancedSearchFilters = {},
  sort: SearchSortMode = "relevance",
): SearchPage {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
    hasMore: false,
    query,
    genre,
    tab,
    advancedFilters,
    sort,
  };
}

function searchCandidatePoolLimit(offset: number, pageSize: number): number {
  const needed = offset + pageSize + 20;
  if (needed <= SEARCH_CANDIDATE_POOL_MAX) {
    return Math.max(needed, SEARCH_CANDIDATE_POOL_MIN);
  }
  return Math.min(needed, SEARCH_CANDIDATE_POOL_DEEP_MAX);
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fuzzyDistanceLimit(length: number): number {
  if (length >= 10) return 3;
  if (length >= 7) return 2;
  if (length >= FUZZY_SEARCH_MIN_TOKEN_LENGTH) return 1;
  return 0;
}

function levenshteinWithin(a: string, b: string, maxDistance: number): number | null {
  if (Math.abs(a.length - b.length) > maxDistance) return null;
  if (a === b) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0]!;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) return null;
    [previous, current] = [current, previous];
  }

  const distance = previous[b.length]!;
  return distance <= maxDistance ? distance : null;
}

function bestTokenDistance(queryToken: string, titleTokens: string[]): number | null {
  const limit = fuzzyDistanceLimit(queryToken.length);
  if (limit <= 0) return null;

  let best: number | null = null;
  for (const titleToken of titleTokens) {
    if (titleToken.length < FUZZY_SEARCH_MIN_TOKEN_LENGTH) continue;
    if (titleToken.includes(queryToken) || queryToken.includes(titleToken)) return 0;

    const distance = levenshteinWithin(queryToken, titleToken, limit);
    if (distance === null) continue;
    best = best === null ? distance : Math.min(best, distance);
  }

  return best;
}

function splitStrongSearchTokens(normalizedText: string): string[] {
  return normalizedText
    .split(" ")
    .filter((token) => token.length >= FUZZY_SEARCH_MIN_TOKEN_LENGTH);
}

function fuzzyTitleScore(query: string, title: string): number | null {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedQuery || !normalizedTitle) return null;

  if (normalizedTitle === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 1;
  if (normalizedTitle.includes(normalizedQuery)) return 2;

  const queryTokens = splitStrongSearchTokens(normalizedQuery);
  if (queryTokens.length === 0) return null;

  const titleTokens = normalizedTitle.split(" ");
  let distanceTotal = 0;

  for (const queryToken of queryTokens) {
    const distance = bestTokenDistance(queryToken, titleTokens);
    if (distance === null) return null;
    distanceTotal += distance;
  }

  return 4 + distanceTotal + Math.max(0, queryTokens.length - 1);
}

/**
 * Ослабленный матч: достаточно большинства сильных токенов.
 * Ловит «ателье ведьминских колпаков» → «Ателье колдовских колпаков».
 */
function partialFuzzyTitleScore(query: string, title: string): number | null {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedQuery || !normalizedTitle) return null;

  if (normalizedTitle === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 1;
  if (normalizedTitle.includes(normalizedQuery)) return 2;

  const queryTokens = splitStrongSearchTokens(normalizedQuery);
  if (queryTokens.length < PARTIAL_FUZZY_MIN_QUERY_TOKENS) return null;

  const titleTokens = normalizedTitle.split(" ");
  let matched = 0;
  let distanceTotal = 0;
  let unmatched = 0;

  for (const queryToken of queryTokens) {
    const distance = bestTokenDistance(queryToken, titleTokens);
    if (distance === null) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    distanceTotal += distance;
  }

  const minMatched = Math.max(
    PARTIAL_FUZZY_MIN_QUERY_TOKENS,
    Math.ceil((queryTokens.length * 2) / 3),
  );
  if (matched < minMatched) return null;

  return 20 + distanceTotal + unmatched * 5 + Math.max(0, queryTokens.length - matched);
}

type FuzzySearchCandidateRow = {
  shikimoriId: number;
  title: string | null;
  titleOrig: string | null;
  otherTitle: string | null;
  animeTitle: string | null;
};

async function findFuzzySearchShikimoriIds(
  query: string,
  mode: FuzzySearchMode = "strict",
): Promise<number[]> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < SEARCH_MIN_QUERY_LENGTH) return [];

  if (mode === "partial") {
    const strongTokens = splitStrongSearchTokens(normalizedQuery);
    if (strongTokens.length < PARTIAL_FUZZY_MIN_QUERY_TOKENS) return [];
  }

  const scoreTitle = mode === "partial" ? partialFuzzyTitleScore : fuzzyTitleScore;

  const candidates = await prisma.$queryRaw<FuzzySearchCandidateRow[]>`
    SELECT
      m."shikimoriId",
      m.title,
      m."titleOrig",
      m."otherTitle",
      m."materialData"->>'anime_title' AS "animeTitle"
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
  `;

  const bestById = new Map<number, { score: number; title: string }>();

  for (const candidate of candidates) {
    const titles = [
      candidate.animeTitle,
      candidate.title,
      candidate.titleOrig,
      candidate.otherTitle,
    ].filter((value): value is string => Boolean(value?.trim()));

    for (const title of titles) {
      const score = scoreTitle(normalizedQuery, title);
      if (score === null) continue;

      const previous = bestById.get(candidate.shikimoriId);
      if (!previous || score < previous.score) {
        bestById.set(candidate.shikimoriId, { score, title });
      }
    }
  }

  return [...bestById.entries()]
    .sort(([, a], [, b]) => a.score - b.score || a.title.localeCompare(b.title, "ru-RU"))
    .slice(0, FUZZY_SEARCH_MAX_IDS)
    .map(([shikimoriId]) => shikimoriId);
}

function buildSearchPage(
  rows: RawSearchRow[],
  page: number,
  pageSize: number,
  includeTotal: boolean,
  offset: number,
  query: string,
  genre: string | null,
  totalOverride?: number,
  tab: SearchPage["tab"] = "quick",
  advancedFilters: AdvancedSearchFilters = {},
  layoutCorrectedQuery?: string | null,
  sort: SearchSortMode = "relevance",
): SearchPage {
  const total =
    totalOverride ?? (includeTotal ? (rows.length > 0 ? Number(rows[0]!.total ?? 0) : 0) : rows.length);

  return {
    items: rows.map(mapSearchRow),
    total,
    page,
    pageSize,
    hasMore: includeTotal ? offset + rows.length < total : rows.length >= pageSize,
    query,
    genre,
    tab,
    advancedFilters,
    layoutCorrectedQuery: layoutCorrectedQuery ?? null,
    sort,
  };
}

const SEARCH_META_CTE = Prisma.sql`
  meta AS (
    SELECT
      m."shikimoriId",
      COALESCE(
        MAX(m.year),
        MAX(NULLIF(TRIM(m."materialData"->>'year'), '')::int),
        MAX(
          NULLIF(
            LEFT(
              COALESCE(
                m."materialData"->'anime_full'->>'aired_on',
                m."materialData"->'anime_full'->>'released_on'
              ),
              4
            ),
            ''
          )::int
        )
      ) AS year,
      (
        array_agg(
          COALESCE(
            NULLIF(TRIM(m."materialData"->>'anime_status'), ''),
            NULLIF(TRIM(m."materialData"->>'all_status'), ''),
            NULLIF(TRIM(m."materialData"->'anime_full'->>'status'), '')
          )
          ORDER BY m."kodikUpdatedAt" DESC NULLS LAST
        ) FILTER (
          WHERE COALESCE(
            NULLIF(TRIM(m."materialData"->>'anime_status'), ''),
            NULLIF(TRIM(m."materialData"->>'all_status'), ''),
            NULLIF(TRIM(m."materialData"->'anime_full'->>'status'), '')
          ) IS NOT NULL
        )
      )[1] AS status,
      (
        array_agg(
          COALESCE(
            NULLIF(TRIM(m."materialData"->>'anime_kind'), ''),
            NULLIF(TRIM(m."materialData"->'anime_full'->>'kind'), '')
          )
          ORDER BY m."kodikUpdatedAt" DESC NULLS LAST
        ) FILTER (
          WHERE COALESCE(
            NULLIF(TRIM(m."materialData"->>'anime_kind'), ''),
            NULLIF(TRIM(m."materialData"->'anime_full'->>'kind'), '')
          ) IS NOT NULL
        )
      )[1] AS kind,
      NULLIF(
        GREATEST(
          COALESCE(MAX(m."episodesCount"), 0),
          COALESCE(MAX(m."lastEpisode"), 0),
          COALESCE(MAX(NULLIF(TRIM(m."materialData"->>'episodes_total'), '')::int), 0),
          COALESCE(MAX(NULLIF(TRIM(m."materialData"->>'shikimori_episodes'), '')::int), 0),
          COALESCE(MAX(NULLIF(TRIM(m."materialData"->'anime_full'->>'episodes'), '')::int), 0)
        ),
        0
      ) AS episodes,
      MAX(
        COALESCE(
          NULLIF(TRIM(m."materialData"->>'shikimori_rating'), '')::numeric,
          NULLIF(TRIM(m."materialData"->>'shikimori_score'), '')::numeric
        )
      ) AS score
    FROM matched m
    GROUP BY m."shikimoriId"
  )
`;

async function countSearchMatches(filterSql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT m."shikimoriId")::bigint AS count
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
      ${filterSql}
  `;
  return Number(rows[0]?.count ?? 0);
}

async function fetchSearchRows(
  filterSql: Prisma.Sql,
  candidateRankExpr: Prisma.Sql,
  pageSize: number,
  offset: number,
  sort: SearchSortMode = "relevance",
): Promise<RawSearchRow[]> {
  const poolLimit = searchCandidatePoolLimit(offset, pageSize);
  const orderBySql =
    sort === "date"
      ? Prisma.sql`sort_date DESC NULLS LAST, sort_year DESC NULLS LAST, sort_title ASC`
      : Prisma.sql`rank ASC, sort_title ASC`;
  const finalOrderBySql =
    sort === "date"
      ? Prisma.sql`o.sort_date DESC NULLS LAST, o.sort_year DESC NULLS LAST, o.title ASC`
      : Prisma.sql`o.rank ASC, o.title ASC`;

  return prisma.$queryRaw<RawSearchRow[]>`
    WITH candidates AS (
      SELECT
        m."shikimoriId",
        MIN(${candidateRankExpr}) AS rank,
        MIN(COALESCE(m."materialData"->>'anime_title', m.title)) AS sort_title,
        MAX(m."animeReleasedAt") AS sort_date,
        MAX(
          COALESCE(
            m.year,
            NULLIF(TRIM(m."materialData"->>'year'), '')::int,
            NULLIF(
              LEFT(
                COALESCE(
                  m."materialData"->'anime_full'->>'aired_on',
                  m."materialData"->'anime_full'->>'released_on'
                ),
                4
              ),
              ''
            )::int
          )
        ) AS sort_year
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
        ${filterSql}
      GROUP BY m."shikimoriId"
      ORDER BY ${orderBySql}
      LIMIT ${poolLimit}
    ),
    matched AS (
      SELECT m.*
      FROM "KodikMaterial" m
      INNER JOIN candidates c ON c."shikimoriId" = m."shikimoriId"
    ),
    ${SEARCH_META_CTE},
    ranked AS (
      SELECT DISTINCT ON (m."shikimoriId")
        m."shikimoriId",
        COALESCE(m."materialData"->>'anime_title', m.title) AS title,
        NULLIF(m."titleOrig", '') AS "titleOriginal",
        meta.year,
        NULLIF(m."materialData"->>'anime_poster_url', '') AS "posterFromMaterial",
        NULLIF(m."materialData"->>'poster_url', '') AS "posterUrlFromMaterial",
        NULLIF(m."materialData"->>'worldart_poster_url', '') AS "worldartPosterFromMaterial",
        NULLIF(m."materialData"->>'worldart_link', '') AS "worldartLinkFromMaterial",
        meta.status,
        meta.kind,
        meta.episodes,
        meta.score,
        m."materialData"->'screenshots' AS "animeScreenshots",
        m."kodikUpdatedAt"
      FROM matched m
      INNER JOIN meta ON meta."shikimoriId" = m."shikimoriId"
      ORDER BY m."shikimoriId", m."kodikUpdatedAt" DESC NULLS LAST
    ),
    ordered AS (
      SELECT
        r."shikimoriId",
        r.title,
        r."titleOriginal",
        r.year,
        rp."posterUrl",
        r."posterFromMaterial",
        r."posterUrlFromMaterial",
        r."worldartPosterFromMaterial",
        r."worldartLinkFromMaterial",
        r.status,
        r.kind,
        r.episodes,
        r.score,
        r."animeScreenshots",
        c.rank,
        c.sort_date,
        c.sort_year
      FROM ranked r
      INNER JOIN candidates c ON c."shikimoriId" = r."shikimoriId"
      LEFT JOIN LATERAL (
        SELECT rel."posterUrl"
        FROM "KodikEpisodeRelease" rel
        WHERE rel."shikimoriId" = r."shikimoriId"
        ORDER BY rel."releasedAt" DESC
        LIMIT 1
      ) rp ON TRUE
    )
    SELECT o.*
    FROM ordered o
    ORDER BY ${finalOrderBySql}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
}

type RawSearchRow = {
  shikimoriId: number;
  title: string;
  titleOriginal: string | null;
  year: number | null;
  posterUrl: string | null;
  posterFromMaterial: string | null;
  posterUrlFromMaterial: string | null;
  worldartPosterFromMaterial: string | null;
  worldartLinkFromMaterial: string | null;
  status: string | null;
  kind: string | null;
  episodes: number | null;
  score: number | string | null;
  animeScreenshots: unknown;
  rank?: number;
  total?: bigint;
};

const MATERIAL_YEAR_EXPR = Prisma.sql`
  COALESCE(
    m.year,
    NULLIF(TRIM(m."materialData"->>'year'), '')::int
  )
`;

const MATERIAL_SCORE_EXPR = Prisma.sql`
  COALESCE(
    NULLIF(TRIM(m."materialData"->>'shikimori_rating'), '')::numeric,
    NULLIF(TRIM(m."materialData"->>'shikimori_score'), '')::numeric
  )
`;

function buildDescriptionMatchFilterSql(query: string | undefined): Prisma.Sql | null {
  const trimmed = query?.trim();
  if (!trimmed) return null;

  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  return Prisma.sql`
    AND (
      COALESCE(m."materialData"->>'anime_description', '') ILIKE ${pattern}
      OR COALESCE(m."materialData"->>'description', '') ILIKE ${pattern}
      OR COALESCE(m."materialData"->'anime_full'->>'description', '') ILIKE ${pattern}
    )
  `;
}

function buildDescriptionSupplementFilterSql(
  query: string,
  excludeShikimoriIds: number[],
): Prisma.Sql {
  const descriptionFilter = buildDescriptionMatchFilterSql(query);
  if (!descriptionFilter) return Prisma.empty;

  if (excludeShikimoriIds.length === 0) return descriptionFilter;

  return Prisma.sql`
    ${descriptionFilter}
    AND m."shikimoriId" NOT IN (${Prisma.join(excludeShikimoriIds)})
  `;
}

function buildAdvancedFilterSql(filters: AdvancedSearchFilters): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];

  const addIlike = (column: Prisma.Sql, value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    parts.push(Prisma.sql`AND ${column} ILIKE ${`%${escapeIlikePattern(trimmed)}%`}`);
  };

  addIlike(Prisma.sql`COALESCE(m."materialData"->>'anime_title', '')`, filters.animeTitle);

  if (filters.title?.trim()) {
    const pattern = `%${escapeIlikePattern(filters.title.trim())}%`;
    parts.push(Prisma.sql`
      AND (
        m.title ILIKE ${pattern}
        OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
        OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
      )
    `);
  }

  const descriptionFilter = buildDescriptionMatchFilterSql(filters.description);
  if (descriptionFilter) parts.push(descriptionFilter);

  if (parseGenreList(filters.genre).length > 0) {
    for (const genre of parseGenreList(filters.genre)) {
      const genreKey = normalizeKodikGenreKey(genre);
      const pattern = `%${escapeIlikePattern(genreKey)}%`;
      parts.push(Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM "KodikMaterialGenre" genre
          WHERE genre."materialId" = m."kodikId"
            AND (genre."genreKey" = ${genreKey} OR genre."genreKey" ILIKE ${pattern})
        )
      `);
    }
  }

  if (isYearRangeActive(filters)) {
    const yearFrom = Number(filters.yearFrom);
    const yearTo = Number(filters.yearTo);
    const from = Number.isFinite(yearFrom) ? Math.floor(yearFrom) : SEARCH_YEAR_MIN;
    const to = Number.isFinite(yearTo) ? Math.floor(yearTo) : SEARCH_YEAR_MAX;
    const safeFrom = Math.max(SEARCH_YEAR_MIN, Math.min(from, to));
    const safeTo = Math.min(SEARCH_YEAR_MAX, Math.max(from, to));
    parts.push(Prisma.sql`
      AND ${MATERIAL_YEAR_EXPR} IS NOT NULL
      AND ${MATERIAL_YEAR_EXPR} >= ${safeFrom}
      AND ${MATERIAL_YEAR_EXPR} <= ${safeTo}
    `);
  }

  if (isMinRatingActive(filters)) {
    const minRating = Number(filters.minRating);
    if (Number.isFinite(minRating)) {
      parts.push(Prisma.sql`
        AND ${MATERIAL_SCORE_EXPR} IS NOT NULL
        AND ${MATERIAL_SCORE_EXPR} >= ${minRating}
      `);
    }
  }

  if (filters.kind?.trim()) {
    const kind = filters.kind.trim();
    parts.push(Prisma.sql`
      AND (
        lower(COALESCE(m."materialData"->>'anime_kind', '')) = lower(${kind})
        OR lower(COALESCE(m."materialData"->'anime_full'->>'kind', '')) = lower(${kind})
      )
    `);
  }

  if (filters.status?.trim()) {
    const status = filters.status.trim();
    parts.push(Prisma.sql`
      AND (
        lower(COALESCE(m."materialData"->>'anime_status', '')) = lower(${status})
        OR lower(COALESCE(m."materialData"->>'all_status', '')) = lower(${status})
        OR lower(COALESCE(m."materialData"->'anime_full'->>'status', '')) = lower(${status})
      )
    `);
  }

  if (filters.studio?.trim()) {
    const pattern = `%${escapeIlikePattern(filters.studio.trim())}%`;
    parts.push(Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(m."materialData"->'anime_studios', '[]'::jsonb)) AS studio(name)
        WHERE studio.name ILIKE ${pattern}
      )
    `);
  }

  if (parts.length === 0) return null;
  return Prisma.join(parts, " ");
}

function normalizePoster(url: string | null | undefined): string | null {
  return resolveMaterialPosterUrl({ anime_poster_url: url });
}

function posterFromMaterialParts(row: {
  posterFromMaterial: string | null;
  posterUrlFromMaterial: string | null;
  worldartPosterFromMaterial: string | null;
  worldartLinkFromMaterial: string | null;
}): string | null {
  return resolveMaterialPosterUrl({
    anime_poster_url: row.posterFromMaterial,
    poster_url: row.posterUrlFromMaterial,
    worldart_poster_url: row.worldartPosterFromMaterial,
    worldart_link: row.worldartLinkFromMaterial,
  } satisfies MaterialPosterSource);
}

function mapSearchRow(row: RawSearchRow): SearchResult {
  return {
    shikimoriId: row.shikimoriId,
    title: row.title,
    titleOriginal: row.titleOriginal,
    year: row.year,
    posterUrl: normalizePoster(row.posterUrl) ?? posterFromMaterialParts(row),
    screenshotUrl: pickScreenshotUrl([row.animeScreenshots], String(row.shikimoriId)),
    status: row.status,
    kind: row.kind,
    episodes: row.episodes,
    score: normalizeAnimeScore(row.score),
  };
}

export function serializeSearchResult(item: SearchResult): SearchResultDto {
  return item;
}

export async function searchAnimes(
  query: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  const trimmed = query.trim();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    return emptySearchPage(safePage, safePageSize, trimmed, null, "quick", {}, sort);
  }

  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const prefixPattern = `${escapeIlikePattern(trimmed)}%`;
  const shikimoriIdMatch = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const fuzzyShikimoriIds = await findFuzzySearchShikimoriIds(trimmed);
  const offset = (safePage - 1) * safePageSize;

  const shikimoriFilter =
    shikimoriIdMatch !== null
      ? Prisma.sql`OR m."shikimoriId" = ${shikimoriIdMatch}`
      : Prisma.empty;
  const fuzzyFilter =
    fuzzyShikimoriIds.length > 0
      ? Prisma.sql`OR m."shikimoriId" IN (${Prisma.join(fuzzyShikimoriIds)})`
      : Prisma.empty;

  const filterSql = Prisma.sql`
    AND (
      m.title ILIKE ${pattern}
      OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
      OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
      OR COALESCE(m."materialData"->>'anime_title', '') ILIKE ${pattern}
      ${shikimoriFilter}
      ${fuzzyFilter}
    )
  `;

  const candidateRankExpr = Prisma.sql`
    CASE
      WHEN lower(COALESCE(m."materialData"->>'anime_title', m.title)) = lower(${trimmed}) THEN 0
      WHEN COALESCE(m."materialData"->>'anime_title', m.title) ILIKE ${prefixPattern} THEN 1
      WHEN COALESCE(m."titleOrig", '') ILIKE ${prefixPattern} THEN 2
      WHEN m."shikimoriId" IN (${Prisma.join(fuzzyShikimoriIds.length > 0 ? fuzzyShikimoriIds : [-1])}) THEN ${FUZZY_TITLE_MATCH_RANK}
      ELSE 3
    END
  `;

  const rowsPromise = fetchSearchRows(filterSql, candidateRankExpr, safePageSize, offset, sort);
  const totalPromise = includeTotal ? countSearchMatches(filterSql) : Promise.resolve(undefined);
  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  return buildSearchPage(
    rows,
    safePage,
    safePageSize,
    includeTotal,
    offset,
    trimmed,
    null,
    total,
    "quick",
    {},
    null,
    sort,
  );
}

async function searchAnimesByDescriptionUncached(
  query: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  excludeShikimoriIds: number[] = [],
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  const trimmed = query.trim();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    return emptySearchPage(safePage, safePageSize, trimmed, null, "quick", {}, sort);
  }

  const filterSql = buildDescriptionSupplementFilterSql(trimmed, excludeShikimoriIds);
  const offset = (safePage - 1) * safePageSize;

  const rowsPromise = fetchSearchRows(
    filterSql,
    Prisma.sql`${DESCRIPTION_MATCH_RANK}`,
    safePageSize,
    offset,
    sort,
  );
  const totalPromise = includeTotal ? countSearchMatches(filterSql) : Promise.resolve(undefined);
  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  return buildSearchPage(
    rows,
    safePage,
    safePageSize,
    includeTotal,
    offset,
    trimmed,
    null,
    total,
    "quick",
    {},
    null,
    sort,
  );
}

async function searchAnimesQuickUncached(
  query: string,
  genresParam: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const trimmed = query.trim();
  const result = await searchAnimesQuickCore(trimmed, genresParam, page, pageSize, options, trimmed);

  const genres = parseGenreList(genresParam);
  const hasQuery = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  const hasGenres = genres.length > 0;

  if (result.items.length > 0 || !hasQuery || hasGenres) {
    return result;
  }

  const alternateQuery = getAlternateKeyboardLayoutQuery(trimmed);
  if (alternateQuery) {
    const corrected = await searchAnimesQuickCore(
      alternateQuery,
      genresParam,
      page,
      pageSize,
      options,
      trimmed,
      alternateQuery,
    );
    if (corrected.items.length > 0) {
      return corrected;
    }
  }

  const partial = await searchAnimesQuickCore(
    trimmed,
    genresParam,
    page,
    pageSize,
    options,
    trimmed,
    null,
    "partial",
  );
  if (partial.items.length > 0) {
    return partial;
  }

  if (alternateQuery) {
    const partialAlt = await searchAnimesQuickCore(
      alternateQuery,
      genresParam,
      page,
      pageSize,
      options,
      trimmed,
      alternateQuery,
      "partial",
    );
    if (partialAlt.items.length > 0) {
      return partialAlt;
    }
  }

  return result;
}

async function searchAnimesQuickCore(
  searchQuery: string,
  genresParam: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
  displayQuery = searchQuery,
  layoutCorrectedQuery?: string | null,
  fuzzyMode: FuzzySearchMode = "strict",
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  const trimmed = searchQuery.trim();
  const genres = parseGenreList(genresParam);
  const serializedGenres = serializeGenreList(genres);
  const hasQuery = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  const hasGenres = genres.length > 0;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;
  const partialFuzzyOnly = fuzzyMode === "partial";

  if (!hasQuery && !hasGenres) {
    return emptySearchPage(
      safePage,
      safePageSize,
      displayQuery,
      serializedGenres || null,
      "quick",
      {},
      sort,
    );
  }

  const parts: Prisma.Sql[] = [];
  let fuzzyShikimoriIds: number[] = [];

  if (hasQuery) {
    fuzzyShikimoriIds = await findFuzzySearchShikimoriIds(trimmed, fuzzyMode);

    if (partialFuzzyOnly) {
      if (fuzzyShikimoriIds.length === 0) {
        return emptySearchPage(
          safePage,
          safePageSize,
          displayQuery,
          serializedGenres || null,
          "quick",
          {},
          sort,
        );
      }

      parts.push(Prisma.sql`
        AND m."shikimoriId" IN (${Prisma.join(fuzzyShikimoriIds)})
      `);
    } else {
      const pattern = `%${escapeIlikePattern(trimmed)}%`;
      const shikimoriIdMatch = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
      const shikimoriFilter =
        shikimoriIdMatch !== null
          ? Prisma.sql`OR m."shikimoriId" = ${shikimoriIdMatch}`
          : Prisma.empty;
      const fuzzyFilter =
        fuzzyShikimoriIds.length > 0
          ? Prisma.sql`OR m."shikimoriId" IN (${Prisma.join(fuzzyShikimoriIds)})`
          : Prisma.empty;

      parts.push(Prisma.sql`
        AND (
          m.title ILIKE ${pattern}
          OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
          OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
          OR COALESCE(m."materialData"->>'anime_title', '') ILIKE ${pattern}
          ${shikimoriFilter}
          ${fuzzyFilter}
        )
      `);
    }
  }

  if (hasGenres) {
    for (const genre of genres) {
      const genreKey = normalizeKodikGenreKey(genre);
      const pattern = `%${escapeIlikePattern(genreKey)}%`;
      parts.push(Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM "KodikMaterialGenre" genre
          WHERE genre."materialId" = m."kodikId"
            AND (genre."genreKey" = ${genreKey} OR genre."genreKey" ILIKE ${pattern})
        )
      `);
    }
  }

  const filterSql = Prisma.join(parts, " ");
  const offset = (safePage - 1) * safePageSize;
  const prefixPattern = `${escapeIlikePattern(trimmed)}%`;
  const fuzzyRank = partialFuzzyOnly ? PARTIAL_FUZZY_TITLE_MATCH_RANK : FUZZY_TITLE_MATCH_RANK;

  const candidateRankExpr = hasQuery
    ? partialFuzzyOnly
      ? Prisma.sql`${fuzzyRank}`
      : Prisma.sql`
        CASE
          WHEN lower(COALESCE(m."materialData"->>'anime_title', m.title)) = lower(${trimmed}) THEN 0
          WHEN COALESCE(m."materialData"->>'anime_title', m.title) ILIKE ${prefixPattern} THEN 1
          WHEN COALESCE(m."titleOrig", '') ILIKE ${prefixPattern} THEN 2
          WHEN m."shikimoriId" IN (${Prisma.join(fuzzyShikimoriIds.length > 0 ? fuzzyShikimoriIds : [-1])}) THEN ${fuzzyRank}
          ELSE 3
        END
      `
    : Prisma.sql`0`;

  const rowsPromise = fetchSearchRows(filterSql, candidateRankExpr, safePageSize, offset, sort);
  const totalPromise = includeTotal ? countSearchMatches(filterSql) : Promise.resolve(undefined);
  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  return buildSearchPage(
    rows,
    safePage,
    safePageSize,
    includeTotal,
    offset,
    displayQuery,
    serializedGenres || null,
    total,
    "quick",
    {},
    layoutCorrectedQuery,
    sort,
  );
}

export async function searchAnimesByGenre(
  genre: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  return searchAnimesQuick("", genre, page, pageSize, options);
}

async function searchAnimesAdvancedUncached(
  filters: AdvancedSearchFilters,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (!hasAdvancedFilters(filters)) {
    return emptySearchPage(safePage, safePageSize, "", null, "advanced", filters, sort);
  }

  const filterSql = buildAdvancedFilterSql(filters);
  if (!filterSql) {
    return emptySearchPage(safePage, safePageSize, "", null, "advanced", filters, sort);
  }

  const offset = (safePage - 1) * safePageSize;
  const candidateRankExpr = Prisma.sql`0`;

  const rowsPromise = fetchSearchRows(filterSql, candidateRankExpr, safePageSize, offset, sort);
  const totalPromise = includeTotal ? countSearchMatches(filterSql) : Promise.resolve(undefined);
  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  return buildSearchPage(
    rows,
    safePage,
    safePageSize,
    includeTotal,
    offset,
    "",
    null,
    total,
    "advanced",
    filters,
    null,
    sort,
  );
}

function cachedPublicSearch<T>(keyParts: string[], load: () => Promise<T>): Promise<T> {
  return unstable_cache(
    () => withPublicSearchSlot(load),
    ["public-search", ...keyParts],
    { revalidate: 60, tags: ["public-search"] },
  )();
}

export async function searchAnimesQuick(
  query: string,
  genresParam: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  const genres = serializeGenreList(parseGenreList(genresParam));
  return cachedPublicSearch(
    ["quick", query.trim(), genres, String(page), String(pageSize), String(includeTotal), sort],
    () => searchAnimesQuickUncached(query, genres, page, pageSize, { includeTotal, sort }),
  );
}

export async function searchAnimesByDescription(
  query: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  excludeShikimoriIds: number[] = [],
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  return cachedPublicSearch(
    [
      "description",
      query.trim(),
      String(page),
      String(pageSize),
      excludeShikimoriIds.join(","),
      String(includeTotal),
      sort,
    ],
    () =>
      searchAnimesByDescriptionUncached(query, page, pageSize, excludeShikimoriIds, {
        includeTotal,
        sort,
      }),
  );
}

export async function searchAnimesAdvanced(
  filters: AdvancedSearchFilters,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean; sort?: SearchSortMode },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const sort = options?.sort ?? "relevance";
  return cachedPublicSearch(
    ["advanced", JSON.stringify(filters), String(page), String(pageSize), String(includeTotal), sort],
    () => searchAnimesAdvancedUncached(filters, page, pageSize, { includeTotal, sort }),
  );
}
