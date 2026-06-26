import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discoverPosterUrl } from "@/lib/poster-fallback";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  type SearchPage,
  type SearchResult,
  type SearchResultDto,
} from "@/lib/search-shared";

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
): SearchPage {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
    hasMore: false,
    query,
    genre,
  };
}

function parseSearchTotal(rows: RawSearchRow[], includeTotal: boolean, offset: number, pageSize: number): number {
  if (includeTotal) {
    return rows.length > 0 ? Number(rows[0]!.total ?? 0) : 0;
  }
  return rows.length;
}

function buildSearchPage(
  rows: RawSearchRow[],
  page: number,
  pageSize: number,
  includeTotal: boolean,
  offset: number,
  query: string,
  genre: string | null,
): SearchPage {
  const total = parseSearchTotal(rows, includeTotal, offset, pageSize);

  return {
    items: rows.map(mapSearchRow),
    total,
    page,
    pageSize,
    hasMore: includeTotal ? offset + rows.length < total : rows.length >= pageSize,
    query,
    genre,
  };
}

async function enrichSearchPosters(items: SearchResult[]): Promise<SearchResult[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.posterUrl) return item;
      const found = await discoverPosterUrl(item.shikimoriId);
      if (!found) return item;
      return { ...item, posterUrl: found.url };
    }),
  );
}

async function finalizeSearchPage(page: SearchPage): Promise<SearchPage> {
  return {
    ...page,
    items: await enrichSearchPosters(page.items),
  };
}

async function fetchSearchRows(
  matchedSql: Prisma.Sql,
  orderSql: Prisma.Sql,
  pageSize: number,
  offset: number,
  includeTotal: boolean,
): Promise<RawSearchRow[]> {
  const selectFields = includeTotal
    ? Prisma.sql`
        o.*,
        COUNT(*) OVER()::bigint AS total
      `
    : Prisma.sql`o.*`;

  return prisma.$queryRaw<RawSearchRow[]>`
    WITH matched AS (
      ${matchedSql}
    ),
    ranked AS (
      SELECT DISTINCT ON (m."shikimoriId")
        m."shikimoriId",
        COALESCE(m."materialData"->>'anime_title', m.title) AS title,
        NULLIF(m."titleOrig", '') AS "titleOriginal",
        m.year,
        NULLIF(m."materialData"->>'anime_poster_url', '') AS "posterFromMaterial",
        NULLIF(m."materialData"->>'poster_url', '') AS "posterUrlFromMaterial",
        NULLIF(m."materialData"->>'worldart_poster_url', '') AS "worldartPosterFromMaterial",
        NULLIF(m."materialData"->>'worldart_link', '') AS "worldartLinkFromMaterial",
        m."materialData"->>'anime_status' AS status,
        m."materialData"->>'anime_kind' AS kind,
        m."episodesCount" AS episodes,
        m."materialData"->'screenshots' AS "animeScreenshots",
        m."kodikUpdatedAt"
      FROM matched m
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
        r."animeScreenshots"
        ${orderSql}
      FROM ranked r
      LEFT JOIN LATERAL (
        SELECT rel."posterUrl"
        FROM "KodikEpisodeRelease" rel
        WHERE rel."shikimoriId" = r."shikimoriId"
        ORDER BY rel."releasedAt" DESC
        LIMIT 1
      ) rp ON TRUE
    )
    SELECT
      ${selectFields}
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
  animeScreenshots: unknown;
  total?: bigint;
};

function escapeIlikePattern(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
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

  const matchedSql = Prisma.sql`
    SELECT m.*
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
      AND (
        m.title ILIKE ${pattern}
        OR COALESCE(m."titleOrig", '') ILIKE ${pattern}
        OR COALESCE(m."otherTitle", '') ILIKE ${pattern}
        OR COALESCE(m."materialData"->>'anime_title', '') ILIKE ${pattern}
        ${shikimoriFilter}
      )
  `;

  const orderSql = Prisma.sql`
    , CASE
        WHEN lower(r.title) = lower(${trimmed}) THEN 0
        WHEN r.title ILIKE ${prefixPattern} THEN 1
        WHEN COALESCE(r."titleOriginal", '') ILIKE ${prefixPattern} THEN 2
        ELSE 3
      END AS rank
  `;

  const rows = await fetchSearchRows(matchedSql, orderSql, safePageSize, offset, includeTotal);

  return finalizeSearchPage(
    buildSearchPage(rows, safePage, safePageSize, includeTotal, offset, trimmed, null),
  );
}

export async function searchAnimesByGenre(
  genre: string,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
  options?: { includeTotal?: boolean },
): Promise<SearchPage> {
  const includeTotal = options?.includeTotal ?? true;
  const trimmed = genre.trim();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : SEARCH_PAGE_SIZE;

  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    return emptySearchPage(safePage, safePageSize, "", trimmed);
  }

  const offset = (safePage - 1) * safePageSize;
  const pattern = `%${escapeIlikePattern(trimmed)}%`;

  const matchedSql = Prisma.sql`
    SELECT m.*
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${GENRES_JSON}) AS genre(name)
        WHERE lower(genre.name) = lower(${trimmed})
          OR genre.name ILIKE ${pattern}
      )
  `;

  const orderSql = Prisma.sql`
    , CASE
        WHEN lower(r.title) ILIKE ${pattern} THEN 1
        ELSE 0
      END AS rank
  `;

  const rows = await fetchSearchRows(matchedSql, orderSql, safePageSize, offset, includeTotal);

  return finalizeSearchPage(
    buildSearchPage(rows, safePage, safePageSize, includeTotal, offset, "", trimmed),
  );
}
