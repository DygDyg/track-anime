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
/** Верхняя граница SQL-кандидатов для fuzzy (до JS scoring). */
const FUZZY_SQL_CANDIDATE_LIMIT = 4000;

/** `ilike` — быстрый SQL; fuzzy-режимы — полный проход по названиям, только при пустой выдаче. */
type FuzzySearchMode = "ilike" | "strict" | "partial";

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

function buildFuzzySeedPatterns(normalizedQuery: string): string[] {
  const patterns = new Set<string>();
  const strongTokens = splitStrongSearchTokens(normalizedQuery);
  for (const token of strongTokens) {
    patterns.add(`%${escapeIlikePattern(token)}%`);
  }

  const seedLength = Math.min(
    normalizedQuery.length,
    Math.max(FUZZY_SEARCH_MIN_TOKEN_LENGTH, Math.ceil(normalizedQuery.length * 0.6)),
  );
  const seed = normalizedQuery.slice(0, seedLength);
  if (seed.length >= 2) {
    patterns.add(`%${escapeIlikePattern(seed)}%`);
  }
  patterns.add(`%${escapeIlikePattern(normalizedQuery)}%`);
  return [...patterns];
}

function buildIlikeOrSql(columnSql: Prisma.Sql, patterns: string[]): Prisma.Sql {
  if (patterns.length === 0) return Prisma.sql`FALSE`;
  return Prisma.join(
    patterns.map((pattern) => Prisma.sql`${columnSql} ILIKE ${pattern}`),
    " OR ",
  );
}

async function loadFuzzySearchCandidateRows(
  normalizedQuery: string,
): Promise<FuzzySearchCandidateRow[]> {
  const patterns = buildFuzzySeedPatterns(normalizedQuery);
  const aliasMatch = buildIlikeOrSql(Prisma.sql`a.title`, patterns);
  const catalogMatch = buildIlikeOrSql(Prisma.sql`c.title`, patterns);
  const catalogOrigMatch = buildIlikeOrSql(Prisma.sql`COALESCE(c."titleOrig", '')`, patterns);

  return prisma.$queryRaw<FuzzySearchCandidateRow[]>`
    SELECT
      a."shikimoriId",
      a.title,
      NULL::text AS "titleOrig",
      NULL::text AS "otherTitle",
      NULL::text AS "animeTitle"
    FROM "AnimeTitleAlias" a
    WHERE (${aliasMatch})
    UNION ALL
    SELECT
      c."shikimoriId",
      c.title,
      c."titleOrig",
      NULL::text AS "otherTitle",
      c.title AS "animeTitle"
    FROM "AnimeCatalog" c
    WHERE (${catalogMatch}) OR (${catalogOrigMatch})
    LIMIT ${FUZZY_SQL_CANDIDATE_LIMIT}
  `;
}

async function findFuzzySearchShikimoriIds(
  query: string,
  mode: Exclude<FuzzySearchMode, "ilike"> = "strict",
): Promise<number[]> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < SEARCH_MIN_QUERY_LENGTH) return [];

  if (mode === "partial") {
    const strongTokens = splitStrongSearchTokens(normalizedQuery);
    if (strongTokens.length < PARTIAL_FUZZY_MIN_QUERY_TOKENS) return [];
  }

  const scoreTitle = mode === "partial" ? partialFuzzyTitleScore : fuzzyTitleScore;

  // Fuzzy только по каталогу/алиасам; кандидаты сужаем SQL-seed'ами, не full-scan.
  const candidates = await loadFuzzySearchCandidateRows(normalizedQuery);

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

function buildShikimoriIdsFilterSql(ids: number[]): Prisma.Sql {
  if (ids.length === 0) {
    return Prisma.sql`AND FALSE`;
  }
  return Prisma.sql`AND m."shikimoriId" IN (${Prisma.join(ids)})`;
}

/** Title-match по каталогу/алиасам (без seq scan KodikMaterial). */
async function findCatalogTitleMatchShikimoriIds(trimmed: string): Promise<number[]> {
  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const shikimoriIdMatch = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const idUnion =
    shikimoriIdMatch !== null
      ? Prisma.sql`UNION SELECT ${shikimoriIdMatch}::int AS "shikimoriId"`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ shikimoriId: number }>>`
    SELECT DISTINCT ids."shikimoriId"
    FROM (
      SELECT a."shikimoriId"
      FROM "AnimeTitleAlias" a
      WHERE a.title ILIKE ${pattern}
      UNION
      SELECT c."shikimoriId"
      FROM "AnimeCatalog" c
      WHERE c.title ILIKE ${pattern}
         OR COALESCE(c."titleOrig", '') ILIKE ${pattern}
         OR COALESCE(c."animeLicenseName", '') ILIKE ${pattern}
      ${idUnion}
    ) ids
  `;
  return rows.map((row) => row.shikimoriId);
}

/** Legacy fallback: material title fields, только если каталог пуст. */
async function findMaterialTitleFallbackShikimoriIds(trimmed: string): Promise<number[]> {
  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const rows = await prisma.$queryRaw<Array<{ shikimoriId: number }>>`
    SELECT DISTINCT m."shikimoriId"
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
      AND (
        m.title ILIKE ${pattern}
        OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
        OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->>'anime_title', '') ILIKE ${pattern}
      )
  `;
  return rows.map((row) => row.shikimoriId);
}

async function resolveTitleMatchShikimoriIds(trimmed: string): Promise<number[]> {
  const catalogIds = await findCatalogTitleMatchShikimoriIds(trimmed);
  if (catalogIds.length > 0) return catalogIds;
  return findMaterialTitleFallbackShikimoriIds(trimmed);
}

async function findCatalogDescriptionMatchShikimoriIds(
  trimmed: string,
  excludeShikimoriIds: number[] = [],
): Promise<number[]> {
  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const excludeSql =
    excludeShikimoriIds.length > 0
      ? Prisma.sql`AND c."shikimoriId" NOT IN (${Prisma.join(excludeShikimoriIds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ shikimoriId: number }>>`
    SELECT c."shikimoriId"
    FROM "AnimeCatalog" c
    WHERE COALESCE(c.description, '') ILIKE ${pattern}
      ${excludeSql}
  `;
  return rows.map((row) => row.shikimoriId);
}

async function findMaterialDescriptionFallbackShikimoriIds(
  trimmed: string,
  excludeShikimoriIds: number[] = [],
): Promise<number[]> {
  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const excludeSql =
    excludeShikimoriIds.length > 0
      ? Prisma.sql`AND m."shikimoriId" NOT IN (${Prisma.join(excludeShikimoriIds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ shikimoriId: number }>>`
    SELECT DISTINCT m."shikimoriId"
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
      ${excludeSql}
      AND (
        COALESCE(m."materialData"->>'anime_description', '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->>'description', '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->'anime_full'->>'description', '') ILIKE ${pattern}
      )
  `;
  return rows.map((row) => row.shikimoriId);
}

async function resolveDescriptionMatchShikimoriIds(
  trimmed: string,
  excludeShikimoriIds: number[] = [],
): Promise<number[]> {
  const catalogIds = await findCatalogDescriptionMatchShikimoriIds(trimmed, excludeShikimoriIds);
  if (catalogIds.length > 0) return catalogIds;
  return findMaterialDescriptionFallbackShikimoriIds(trimmed, excludeShikimoriIds);
}

/** Ранжирование только по catalog/alias (без ILIKE по material в hot path). */
function buildCatalogTitleRankExpr(trimmed: string): Prisma.Sql {
  const prefixPattern = `${escapeIlikePattern(trimmed)}%`;
  return Prisma.sql`
    CASE
      WHEN EXISTS (
        SELECT 1 FROM "AnimeCatalog" c
        WHERE c."shikimoriId" = m."shikimoriId" AND lower(c.title) = lower(${trimmed})
      )
        OR EXISTS (
          SELECT 1 FROM "AnimeTitleAlias" a
          WHERE a."shikimoriId" = m."shikimoriId" AND lower(a.title) = lower(${trimmed})
        )
        THEN 0
      WHEN EXISTS (
        SELECT 1 FROM "AnimeTitleAlias" a
        WHERE a."shikimoriId" = m."shikimoriId" AND a.title ILIKE ${prefixPattern}
      )
        OR EXISTS (
          SELECT 1 FROM "AnimeCatalog" c
          WHERE c."shikimoriId" = m."shikimoriId" AND c.title ILIKE ${prefixPattern}
        )
        THEN 1
      WHEN EXISTS (
        SELECT 1 FROM "AnimeCatalog" c
        WHERE c."shikimoriId" = m."shikimoriId"
          AND (
            COALESCE(c."titleOrig", '') ILIKE ${prefixPattern}
            OR COALESCE(c."animeLicenseName", '') ILIKE ${prefixPattern}
          )
      )
        THEN 2
      ELSE 3
    END
  `;
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


function buildGenreMatchFilterSql(genre: string): Prisma.Sql {
  const genreKey = normalizeKodikGenreKey(genre);
  const pattern = `%${escapeIlikePattern(genreKey)}%`;
  return Prisma.sql`
    AND (
      EXISTS (
        SELECT 1
        FROM "AnimeGenre" ag
        WHERE ag."shikimoriId" = m."shikimoriId"
          AND (ag."genreKey" = ${genreKey} OR ag."genreKey" ILIKE ${pattern})
      )
      OR EXISTS (
        SELECT 1
        FROM "KodikMaterialGenre" genre
        WHERE genre."materialId" = m."kodikId"
          AND (genre."genreKey" = ${genreKey} OR genre."genreKey" ILIKE ${pattern})
      )
    )
  `;
}

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
        MIN(COALESCE(ac.title, m."materialData"->>'anime_title', m.title)) AS sort_title,
        MAX(m."animeReleasedAt") AS sort_date,
        MAX(COALESCE(ac.year, m.year)) AS sort_year
      FROM "KodikMaterial" m
      LEFT JOIN "AnimeCatalog" ac ON ac."shikimoriId" = m."shikimoriId"
      WHERE m."shikimoriId" IS NOT NULL
        ${filterSql}
      GROUP BY m."shikimoriId"
      ORDER BY ${orderBySql}
      LIMIT ${poolLimit}
    ),
    ranked AS (
      SELECT DISTINCT ON (c."shikimoriId")
        c."shikimoriId",
        COALESCE(ac.title, m."materialData"->>'anime_title', m.title) AS title,
        COALESCE(NULLIF(ac."titleOrig", ''), NULLIF(m."titleOrig", '')) AS "titleOriginal",
        COALESCE(ac.year, m.year) AS year,
        COALESCE(NULLIF(ac."posterUrl", ''), NULLIF(m."materialData"->>'anime_poster_url', '')) AS "posterFromMaterial",
        NULLIF(m."materialData"->>'poster_url', '') AS "posterUrlFromMaterial",
        NULLIF(m."materialData"->>'worldart_poster_url', '') AS "worldartPosterFromMaterial",
        NULLIF(m."materialData"->>'worldart_link', '') AS "worldartLinkFromMaterial",
        COALESCE(
          NULLIF(TRIM(ac.status), ''),
          NULLIF(TRIM(m."materialData"->>'anime_status'), ''),
          NULLIF(TRIM(m."materialData"->>'all_status'), ''),
          NULLIF(TRIM(m."materialData"->'anime_full'->>'status'), '')
        ) AS status,
        COALESCE(
          NULLIF(TRIM(ac.kind), ''),
          NULLIF(TRIM(m."materialData"->>'anime_kind'), ''),
          NULLIF(TRIM(m."materialData"->'anime_full'->>'kind'), '')
        ) AS kind,
        NULLIF(
          GREATEST(
            COALESCE(ac."episodesTotal", 0),
            COALESCE(m."episodesCount", 0),
            COALESCE(m."lastEpisode", 0)
          ),
          0
        ) AS episodes,
        COALESCE(
          CASE
            WHEN NULLIF(TRIM(ac.score), '') ~ '^[0-9]+([.][0-9]+)?$'
              THEN NULLIF(TRIM(ac.score), '')::numeric
            ELSE NULL
          END,
          CASE
            WHEN NULLIF(TRIM(m."materialData"->>'shikimori_rating'), '') ~ '^[0-9]+([.][0-9]+)?$'
              THEN NULLIF(TRIM(m."materialData"->>'shikimori_rating'), '')::numeric
            ELSE NULL
          END,
          CASE
            WHEN NULLIF(TRIM(m."materialData"->>'shikimori_score'), '') ~ '^[0-9]+([.][0-9]+)?$'
              THEN NULLIF(TRIM(m."materialData"->>'shikimori_score'), '')::numeric
            ELSE NULL
          END
        ) AS score,
        m."materialData"->'screenshots' AS "animeScreenshots",
        m."kodikUpdatedAt"
      FROM candidates c
      INNER JOIN "KodikMaterial" m ON m."shikimoriId" = c."shikimoriId"
      LEFT JOIN "AnimeCatalog" ac ON ac."shikimoriId" = c."shikimoriId"
      ORDER BY c."shikimoriId", m."kodikUpdatedAt" DESC NULLS LAST
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

const CATALOG_OR_MATERIAL_YEAR_EXPR = Prisma.sql`
  COALESCE(
    (SELECT ac.year FROM "AnimeCatalog" ac WHERE ac."shikimoriId" = m."shikimoriId" LIMIT 1),
    m.year,
    NULLIF(TRIM(m."materialData"->>'year'), '')::int
  )
`;

const CATALOG_OR_MATERIAL_SCORE_EXPR = Prisma.sql`
  COALESCE(
    (
      SELECT
        CASE
          WHEN NULLIF(TRIM(ac.score), '') ~ '^[0-9]+([.][0-9]+)?$'
            THEN NULLIF(TRIM(ac.score), '')::numeric
          ELSE NULL
        END
      FROM "AnimeCatalog" ac
      WHERE ac."shikimoriId" = m."shikimoriId"
      LIMIT 1
    ),
    NULLIF(TRIM(m."materialData"->>'shikimori_rating'), '')::numeric,
    NULLIF(TRIM(m."materialData"->>'shikimori_score'), '')::numeric
  )
`;

async function buildAdvancedFilterSql(filters: AdvancedSearchFilters): Promise<Prisma.Sql | null> {
  const parts: Prisma.Sql[] = [];

  if (filters.animeTitle?.trim()) {
    const ids = await resolveTitleMatchShikimoriIds(filters.animeTitle.trim());
    if (ids.length === 0) return null;
    parts.push(buildShikimoriIdsFilterSql(ids));
  }

  if (filters.title?.trim()) {
    const ids = await resolveTitleMatchShikimoriIds(filters.title.trim());
    if (ids.length === 0) return null;
    parts.push(buildShikimoriIdsFilterSql(ids));
  }

  if (filters.description?.trim()) {
    const ids = await resolveDescriptionMatchShikimoriIds(filters.description.trim());
    if (ids.length === 0) return null;
    parts.push(buildShikimoriIdsFilterSql(ids));
  }

  if (parseGenreList(filters.genre).length > 0) {
    for (const genre of parseGenreList(filters.genre)) {
      parts.push(buildGenreMatchFilterSql(genre));
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
      AND ${CATALOG_OR_MATERIAL_YEAR_EXPR} IS NOT NULL
      AND ${CATALOG_OR_MATERIAL_YEAR_EXPR} >= ${safeFrom}
      AND ${CATALOG_OR_MATERIAL_YEAR_EXPR} <= ${safeTo}
    `);
  }

  if (isMinRatingActive(filters)) {
    const minRating = Number(filters.minRating);
    if (Number.isFinite(minRating)) {
      parts.push(Prisma.sql`
        AND ${CATALOG_OR_MATERIAL_SCORE_EXPR} IS NOT NULL
        AND ${CATALOG_OR_MATERIAL_SCORE_EXPR} >= ${minRating}
      `);
    }
  }

  if (filters.kind?.trim()) {
    const kind = filters.kind.trim();
    parts.push(Prisma.sql`
      AND (
        EXISTS (
          SELECT 1 FROM "AnimeCatalog" ac
          WHERE ac."shikimoriId" = m."shikimoriId"
            AND lower(COALESCE(ac.kind, '')) = lower(${kind})
        )
        OR lower(COALESCE(m."materialData"->>'anime_kind', '')) = lower(${kind})
        OR lower(COALESCE(m."materialData"->'anime_full'->>'kind', '')) = lower(${kind})
      )
    `);
  }

  if (filters.status?.trim()) {
    const status = filters.status.trim();
    parts.push(Prisma.sql`
      AND (
        EXISTS (
          SELECT 1 FROM "AnimeCatalog" ac
          WHERE ac."shikimoriId" = m."shikimoriId"
            AND lower(COALESCE(ac.status, '')) = lower(${status})
        )
        OR lower(COALESCE(m."materialData"->>'anime_status', '')) = lower(${status})
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
  return searchAnimesQuick(query, "", page, pageSize, options);
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

  const descriptionIds = await resolveDescriptionMatchShikimoriIds(trimmed, excludeShikimoriIds);
  if (descriptionIds.length === 0) {
    return emptySearchPage(safePage, safePageSize, trimmed, null, "quick", {}, sort);
  }

  const filterSql = buildShikimoriIdsFilterSql(descriptionIds);
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
  const result = await searchAnimesQuickCore(
    trimmed,
    genresParam,
    page,
    pageSize,
    options,
    trimmed,
    null,
    "ilike",
  );

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
      "ilike",
    );
    if (corrected.items.length > 0) {
      return corrected;
    }
  }

  const strictFuzzy = await searchAnimesQuickCore(
    trimmed,
    genresParam,
    page,
    pageSize,
    options,
    trimmed,
    null,
    "strict",
  );
  if (strictFuzzy.items.length > 0) {
    return strictFuzzy;
  }

  if (alternateQuery) {
    const strictAlt = await searchAnimesQuickCore(
      alternateQuery,
      genresParam,
      page,
      pageSize,
      options,
      trimmed,
      alternateQuery,
      "strict",
    );
    if (strictAlt.items.length > 0) {
      return strictAlt;
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
  fuzzyMode: FuzzySearchMode = "ilike",
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
  const fuzzyOnly = fuzzyMode === "strict" || fuzzyMode === "partial";

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

  if (hasQuery) {
    if (fuzzyOnly) {
      const fuzzyShikimoriIds = await findFuzzySearchShikimoriIds(trimmed, fuzzyMode);
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
      parts.push(buildShikimoriIdsFilterSql(fuzzyShikimoriIds));
    } else {
      const titleIds = await resolveTitleMatchShikimoriIds(trimmed);
      if (titleIds.length === 0) {
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
      parts.push(buildShikimoriIdsFilterSql(titleIds));
    }
  }

  if (hasGenres) {
    for (const genre of genres) {
      parts.push(buildGenreMatchFilterSql(genre));
    }
  }

  const filterSql = Prisma.join(parts, " ");
  const offset = (safePage - 1) * safePageSize;
  const fuzzyRank = fuzzyMode === "partial" ? PARTIAL_FUZZY_TITLE_MATCH_RANK : FUZZY_TITLE_MATCH_RANK;

  const candidateRankExpr = hasQuery
    ? fuzzyOnly
      ? Prisma.sql`${fuzzyRank}`
      : buildCatalogTitleRankExpr(trimmed)
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

  const filterSql = await buildAdvancedFilterSql(filters);
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
