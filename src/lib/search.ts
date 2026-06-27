import "server-only";

import { Prisma } from "@prisma/client";
import { normalizeAnimeScore } from "@/lib/anime-score";
import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  escapeIlikePattern,
  type SearchPage,
  type SearchResult,
  type SearchResultDto,
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

/** Сколько уникальных аниме обрабатываем до тяжёлой агрегации meta. */
const SEARCH_CANDIDATE_POOL_MIN = 120;
const SEARCH_CANDIDATE_POOL_MAX = 500;
const SEARCH_CANDIDATE_POOL_DEEP_MAX = 2000;

export {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  buildSearchHref,
  type SearchPage,
  type SearchResult,
  type SearchResultDto,
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
  };
}

function searchCandidatePoolLimit(offset: number, pageSize: number): number {
  const needed = offset + pageSize + 20;
  if (needed <= SEARCH_CANDIDATE_POOL_MAX) {
    return Math.max(needed, SEARCH_CANDIDATE_POOL_MIN);
  }
  return Math.min(needed, SEARCH_CANDIDATE_POOL_DEEP_MAX);
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
): Promise<RawSearchRow[]> {
  const poolLimit = searchCandidatePoolLimit(offset, pageSize);

  return prisma.$queryRaw<RawSearchRow[]>`
    WITH candidates AS (
      SELECT
        m."shikimoriId",
        MIN(${candidateRankExpr}) AS rank,
        MIN(COALESCE(m."materialData"->>'anime_title', m.title)) AS sort_title
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
        ${filterSql}
      GROUP BY m."shikimoriId"
      ORDER BY rank, sort_title
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
        c.rank
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
    ORDER BY o.rank, o.title
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

  if (filters.description?.trim()) {
    const pattern = `%${escapeIlikePattern(filters.description.trim())}%`;
    parts.push(Prisma.sql`
      AND (
        COALESCE(m."materialData"->>'anime_description', '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->>'description', '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->'anime_full'->>'description', '') ILIKE ${pattern}
      )
    `);
  }

  if (parseGenreList(filters.genre).length > 0) {
    for (const genre of parseGenreList(filters.genre)) {
      const pattern = `%${escapeIlikePattern(genre)}%`;
      parts.push(Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${GENRES_JSON}) AS genre(name)
          WHERE lower(genre.name) = lower(${genre})
            OR genre.name ILIKE ${pattern}
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
  options?: { includeTotal?: boolean },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const trimmed = query.trim();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    return emptySearchPage(safePage, safePageSize, trimmed);
  }

  const pattern = `%${escapeIlikePattern(trimmed)}%`;
  const prefixPattern = `${escapeIlikePattern(trimmed)}%`;
  const shikimoriIdMatch = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const offset = (safePage - 1) * safePageSize;

  const shikimoriFilter =
    shikimoriIdMatch !== null
      ? Prisma.sql`OR m."shikimoriId" = ${shikimoriIdMatch}`
      : Prisma.empty;

  const filterSql = Prisma.sql`
    AND (
      m.title ILIKE ${pattern}
      OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
      OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
      OR COALESCE(m."materialData"->>'anime_title', '') ILIKE ${pattern}
      ${shikimoriFilter}
    )
  `;

  const candidateRankExpr = Prisma.sql`
    CASE
      WHEN lower(COALESCE(m."materialData"->>'anime_title', m.title)) = lower(${trimmed}) THEN 0
      WHEN COALESCE(m."materialData"->>'anime_title', m.title) ILIKE ${prefixPattern} THEN 1
      WHEN COALESCE(m."titleOrig", '') ILIKE ${prefixPattern} THEN 2
      ELSE 3
    END
  `;

  const rowsPromise = fetchSearchRows(filterSql, candidateRankExpr, safePageSize, offset);
  const totalPromise = includeTotal ? countSearchMatches(filterSql) : Promise.resolve(undefined);
  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  return buildSearchPage(rows, safePage, safePageSize, includeTotal, offset, trimmed, null, total);
}

export async function searchAnimesQuick(
  query: string,
  genresParam: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const trimmed = query.trim();
  const genres = parseGenreList(genresParam);
  const serializedGenres = serializeGenreList(genres);
  const hasQuery = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  const hasGenres = genres.length > 0;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (!hasQuery && !hasGenres) {
    return emptySearchPage(safePage, safePageSize, trimmed, serializedGenres || null);
  }

  const parts: Prisma.Sql[] = [];

  if (hasQuery) {
    const pattern = `%${escapeIlikePattern(trimmed)}%`;
    const shikimoriIdMatch = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
    const shikimoriFilter =
      shikimoriIdMatch !== null
        ? Prisma.sql`OR m."shikimoriId" = ${shikimoriIdMatch}`
        : Prisma.empty;

    parts.push(Prisma.sql`
      AND (
        m.title ILIKE ${pattern}
        OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
        OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->>'anime_title', '') ILIKE ${pattern}
        ${shikimoriFilter}
      )
    `);
  }

  if (hasGenres) {
    for (const genre of genres) {
      const pattern = `%${escapeIlikePattern(genre)}%`;
      parts.push(Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${GENRES_JSON}) AS genre(name)
          WHERE lower(genre.name) = lower(${genre})
            OR genre.name ILIKE ${pattern}
        )
      `);
    }
  }

  const filterSql = Prisma.join(parts, " ");
  const offset = (safePage - 1) * safePageSize;
  const prefixPattern = `${escapeIlikePattern(trimmed)}%`;

  const candidateRankExpr = hasQuery
    ? Prisma.sql`
        CASE
          WHEN lower(COALESCE(m."materialData"->>'anime_title', m.title)) = lower(${trimmed}) THEN 0
          WHEN COALESCE(m."materialData"->>'anime_title', m.title) ILIKE ${prefixPattern} THEN 1
          WHEN COALESCE(m."titleOrig", '') ILIKE ${prefixPattern} THEN 2
          ELSE 3
        END
      `
    : Prisma.sql`0`;

  const rowsPromise = fetchSearchRows(filterSql, candidateRankExpr, safePageSize, offset);
  const totalPromise = includeTotal ? countSearchMatches(filterSql) : Promise.resolve(undefined);
  const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

  return buildSearchPage(
    rows,
    safePage,
    safePageSize,
    includeTotal,
    offset,
    trimmed,
    serializedGenres || null,
    total,
  );
}

export async function searchAnimesByGenre(
  genre: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean },
): Promise<SearchPage> {
  return searchAnimesQuick("", genre, page, pageSize, options);
}

export async function searchAnimesAdvanced(
  filters: AdvancedSearchFilters,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (!hasAdvancedFilters(filters)) {
    return emptySearchPage(safePage, safePageSize, "", null, "advanced", filters);
  }

  const filterSql = buildAdvancedFilterSql(filters);
  if (!filterSql) {
    return emptySearchPage(safePage, safePageSize, "", null, "advanced", filters);
  }

  const offset = (safePage - 1) * safePageSize;
  const candidateRankExpr = Prisma.sql`0`;

  const rowsPromise = fetchSearchRows(filterSql, candidateRankExpr, safePageSize, offset);
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
  );
}
