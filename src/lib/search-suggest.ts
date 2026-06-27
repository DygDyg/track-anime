import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SearchFieldId } from "@/lib/search-fields";
import { escapeIlikePattern } from "@/lib/search-shared";

const SUGGEST_MIN_LENGTH = 1;
const SUGGEST_DEFAULT_LIMIT = 12;
const SUGGEST_MAX_LIMIT = 20;
const SUGGEST_GENRE_ALL_LIMIT = 500;

async function suggestAllGenres(query: string, limit: number): Promise<string[]> {
  const trimmed = query.trim();
  const rows =
    trimmed.length > 0
      ? await prisma.$queryRaw<Array<{ value: string }>>`
          SELECT DISTINCT value
          FROM (
            SELECT jsonb_array_elements_text(${GENRES_JSON}) AS value
            FROM "KodikMaterial" m
            WHERE m."shikimoriId" IS NOT NULL
          ) items
          WHERE value ILIKE ${containsPattern(trimmed)}
          ORDER BY value
          LIMIT ${limit}
        `
      : await prisma.$queryRaw<Array<{ value: string }>>`
          SELECT DISTINCT value
          FROM (
            SELECT jsonb_array_elements_text(${GENRES_JSON}) AS value
            FROM "KodikMaterial" m
            WHERE m."shikimoriId" IS NOT NULL
          ) items
          WHERE value IS NOT NULL
            AND value <> ''
          ORDER BY value
          LIMIT ${limit}
        `;
  return rows.map((row) => row.value);
}

const GENRES_JSON = Prisma.sql`
  COALESCE(
    m."materialData"->'anime_genres',
    m."materialData"->'all_genres',
    m."materialData"->'genres',
    '[]'::jsonb
  )
`;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return SUGGEST_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), SUGGEST_MAX_LIMIT);
}

function prefixPattern(query: string): string {
  return `${escapeIlikePattern(query.trim())}%`;
}

function containsPattern(query: string): string {
  return `%${escapeIlikePattern(query.trim())}%`;
}

async function suggestDistinctText(columnSql: Prisma.Sql, query: string, limit: number): Promise<string[]> {
  const pattern = prefixPattern(query);
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT DISTINCT ${columnSql} AS value
    FROM "KodikMaterial" m
    WHERE m."shikimoriId" IS NOT NULL
      AND ${columnSql} IS NOT NULL
      AND ${columnSql} <> ''
      AND ${columnSql} ILIKE ${pattern}
    ORDER BY value
    LIMIT ${limit}
  `;
  return rows.map((row) => row.value);
}

async function suggestJsonTextArray(jsonPath: Prisma.Sql, query: string, limit: number): Promise<string[]> {
  const pattern = containsPattern(query);
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT DISTINCT value
    FROM (
      SELECT jsonb_array_elements_text(${jsonPath}) AS value
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
    ) items
    WHERE value ILIKE ${pattern}
    ORDER BY value
    LIMIT ${limit}
  `;
  return rows.map((row) => row.value);
}

async function suggestGenres(query: string, limit: number): Promise<string[]> {
  return suggestAllGenres(query, limit);
}

async function suggestStudios(query: string, limit: number): Promise<string[]> {
  return suggestJsonTextArray(
    Prisma.sql`COALESCE(m."materialData"->'anime_studios', '[]'::jsonb)`,
    query,
    limit,
  );
}

async function suggestTitles(query: string, limit: number): Promise<string[]> {
  const pattern = prefixPattern(query);
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT DISTINCT value
    FROM (
      SELECT m.title AS value
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
        AND m.title IS NOT NULL
        AND m.title <> ''
      UNION ALL
      SELECT m."titleOrig" AS value
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
        AND m."titleOrig" IS NOT NULL
        AND m."titleOrig" <> ''
      UNION ALL
      SELECT m."otherTitle" AS value
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
        AND m."otherTitle" IS NOT NULL
        AND m."otherTitle" <> ''
    ) titles
    WHERE value ILIKE ${pattern}
    ORDER BY value
    LIMIT ${limit}
  `;
  return rows.map((row) => row.value);
}

export async function suggestSearchFieldValues(
  field: SearchFieldId,
  query: string,
  limit?: number,
): Promise<string[]> {
  const trimmed = query.trim();
  const isGenreAll = field === "genre" && trimmed.length === 0;
  if (!isGenreAll && trimmed.length < SUGGEST_MIN_LENGTH) return [];

  const safeLimit =
    field === "genre"
      ? Math.min(SUGGEST_GENRE_ALL_LIMIT, Math.max(1, limit ?? SUGGEST_GENRE_ALL_LIMIT))
      : normalizeLimit(limit);

  switch (field) {
    case "title":
      return suggestTitles(trimmed, safeLimit);
    case "animeTitle":
      return suggestDistinctText(
        Prisma.sql`NULLIF(TRIM(m."materialData"->>'anime_title'), '')`,
        trimmed,
        safeLimit,
      );
    case "genre":
      return suggestGenres(trimmed, safeLimit);
    case "studio":
      return suggestStudios(trimmed, safeLimit);
    case "kind":
    case "status":
    case "description":
      return [];
    default:
      return [];
  }
}
