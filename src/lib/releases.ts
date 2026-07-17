import { unstable_cache } from "next/cache";
import { toDate, toIsoString } from "@/lib/dates";
import { resolveMaterialPosterUrl } from "@/lib/material-poster";
import { prisma } from "@/lib/prisma";
import { pickScreenshotUrl } from "@/lib/screenshots";

export type ReleaseItem = {
  /** Shikimori ID тайтла (или materialId, если shikimori нет) */
  id: string;
  animeTitle: string;
  posterUrl: string | null;
  screenshotUrl: string | null;
  seasonNumber: number;
  episodeNumber: number;
  translationName: string;
  playerLink: string | null;
  shikimoriId: number | null;
  releasedAt: Date;
  description: string | null;
  genres: string[];
  status: string | null;
  score: string | null;
  kind: string | null;
};

/** Для передачи на клиент / в JSON */
export type ReleaseItemDto = Omit<ReleaseItem, "releasedAt"> & {
  releasedAt: string;
};

/** Курсор для постраничной подгрузки ленты */
export type ReleasesCursor = {
  /** releases — реальные новинки из KodikEpisodeRelease; catalog — каталог по shikimoriId */
  phase: "releases" | "catalog";
  releasedAt: string;
  id: string;
};

function normalizePlayerLink(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("//")) return `https:${link}`;
  return link;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
}

function mapReleaseRow(row: RawReleaseRow): ReleaseItem {
  return {
    id: row.id,
    animeTitle: row.animeTitle,
    posterUrl: resolveMaterialPosterUrl({
      anime_poster_url: row.posterUrl,
      worldart_link: row.worldartLinkFromMaterial,
    }),
    screenshotUrl: pickScreenshotUrl([row.animeScreenshots, row.episodeScreenshots], row.id),
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    translationName: row.translationName,
    playerLink: row.playerLink,
    shikimoriId: row.shikimoriId,
    releasedAt: toDate(row.releasedAt),
    description: row.description ? stripHtml(row.description) : null,
    genres: parseGenres(row.genres),
    status: row.status,
    score: row.score,
    kind: row.kind,
  };
}

export function serializeRelease(item: ReleaseItem): ReleaseItemDto {
  return {
    ...item,
    playerLink: normalizePlayerLink(item.playerLink),
    releasedAt: toIsoString(item.releasedAt),
  };
}

function toCursor(phase: ReleasesCursor["phase"], item: ReleaseItem): ReleasesCursor {
  return {
    phase,
    releasedAt: toIsoString(item.releasedAt),
    id: item.id,
  };
}

function parseCursorAfter(cursor?: ReleasesCursor | null) {
  if (!cursor?.releasedAt || !cursor.id) return undefined;
  return { releasedAt: new Date(cursor.releasedAt), id: cursor.id };
}

function resolveFeedPhase(cursor?: ReleasesCursor | null): ReleasesCursor["phase"] {
  if (!cursor) return "releases";
  return cursor.phase ?? "catalog";
}

type RawReleaseRow = {
  id: string;
  animeTitle: string;
  posterUrl: string | null;
  worldartLinkFromMaterial: string | null;
  animeScreenshots: unknown;
  episodeScreenshots: unknown;
  seasonNumber: number;
  episodeNumber: number;
  translationName: string;
  playerLink: string | null;
  shikimoriId: number | null;
  releasedAt: Date;
  description: string | null;
  genres: unknown;
  status: string | null;
  score: string | null;
  kind: string | null;
};

const CATALOG_QUERY_BATCH_FACTOR = 4;
const CATALOG_QUERY_MIN_BATCH = 96;
const CATALOG_QUERY_MAX_BATCHES = 8;
export const RELEASES_FEED_CACHE_SECONDS = 60 * 60;
export const RELEASES_FEED_STALE_WHILE_REVALIDATE_SECONDS = 10 * 60;

/** title_key тайтлов, у которых есть KodikEpisodeRelease (для исключения из каталога) */
function releaseTitleKeysCte() {
  return `
    release_title_keys AS (
      SELECT DISTINCT
        CASE
          WHEN COALESCE(m."shikimoriId", r."shikimoriId") IS NOT NULL
            THEN COALESCE(m."shikimoriId", r."shikimoriId")::text
          ELSE r."materialId"
        END AS title_key
      FROM "KodikEpisodeRelease" r
      INNER JOIN "KodikMaterial" m ON m."kodikId" = r."materialId"
    )
  `;
}

/**
 * Фаза 1: одна карточка на тайтл с реальным релизом (KodikEpisodeRelease).
 * Последняя серия ищется среди всех озвучек с тем же shikimoriId.
 */
async function queryFreshReleasesPerTitle(
  limit: number,
  after?: { releasedAt: Date; id: string },
): Promise<ReleaseItem[]> {
  const afterReleasedAt = after?.releasedAt ?? null;
  const afterId = after?.id ?? null;

  const rows = await prisma.$queryRaw<RawReleaseRow[]>`
    WITH latest_release AS (
      SELECT DISTINCT ON (title_key)
        title_key AS id,
        "animeTitle",
        "posterUrl",
        "worldartLinkFromMaterial",
        "seasonNumber",
        "episodeNumber",
        "translationName",
        "playerLink",
        "shikimoriId",
        "releasedAt",
        description,
        genres,
        status,
        score,
        kind,
        "animeScreenshots",
        "episodeScreenshots"
      FROM (
        SELECT
          CASE
            WHEN COALESCE(m."shikimoriId", r."shikimoriId") IS NOT NULL
              THEN COALESCE(m."shikimoriId", r."shikimoriId")::text
            ELSE r."materialId"
          END AS title_key,
          r."animeTitle",
          COALESCE(
            NULLIF(r."posterUrl", ''),
            NULLIF(m."materialData"->>'anime_poster_url', ''),
            NULLIF(m."materialData"->>'poster_url', ''),
            NULLIF(m."materialData"->>'worldart_poster_url', '')
          ) AS "posterUrl",
          m."materialData"->>'worldart_link' AS "worldartLinkFromMaterial",
          r."seasonNumber",
          r."episodeNumber",
          r."translationName",
          COALESCE(r."playerLink", e."playerLink", m."playerLink") AS "playerLink",
          COALESCE(m."shikimoriId", r."shikimoriId") AS "shikimoriId",
          r."releasedAt",
          COALESCE(
            m."materialData"->>'anime_description',
            m."materialData"->>'description'
          ) AS description,
          COALESCE(
            m."materialData"->'anime_genres',
            m."materialData"->'all_genres',
            m."materialData"->'genres',
            '[]'::jsonb
          ) AS genres,
          NULLIF(m."materialData"->>'anime_status', '') AS status,
          NULLIF(TRIM(COALESCE(
            m."materialData"->>'shikimori_rating',
            m."materialData"->>'shikimori_score'
          )), '') AS score,
          NULLIF(TRIM(COALESCE(
            m."materialData"->>'anime_kind',
            m."materialData"->'anime_full'->>'kind'
          )), '') AS kind,
          m."materialData"->'screenshots' AS "animeScreenshots",
          e."screenshots" AS "episodeScreenshots"
        FROM "KodikEpisodeRelease" r
        INNER JOIN "KodikMaterial" m ON m."kodikId" = r."materialId"
        LEFT JOIN "KodikEpisode" e ON e."materialId" = r."materialId"
          AND e."seasonNumber" = r."seasonNumber"
          AND e."episodeNumber" = r."episodeNumber"
      ) release_rows
      ORDER BY
        title_key,
        "seasonNumber" DESC,
        "episodeNumber" DESC,
        "releasedAt" DESC
    )
    SELECT *
    FROM latest_release
    WHERE (
      ${afterReleasedAt}::timestamptz IS NULL
      OR ("releasedAt", id) < (${afterReleasedAt}::timestamptz, ${afterId})
    )
    ORDER BY "releasedAt" DESC, id ASC
    LIMIT ${limit}
  `;

  return rows.map(mapReleaseRow);
}

/**
 * Фаза 2: каталог по shikimoriId, без тайтлов из фазы релизов.
 */
async function queryCatalogReleasesPerTitle(
  limit: number,
  after?: { releasedAt: Date; id: string },
): Promise<ReleaseItem[]> {
  const items: ReleaseItem[] = [];
  const seenIds = new Set<string>();
  let scanAfter = after;

  for (let batch = 0; batch < CATALOG_QUERY_MAX_BATCHES && items.length < limit; batch += 1) {
    const rows = await queryCatalogReleaseCandidates(
      Math.max(CATALOG_QUERY_MIN_BATCH, limit * CATALOG_QUERY_BATCH_FACTOR),
      scanAfter,
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      scanAfter = { releasedAt: toDate(row.releasedAt), id: row.id };

      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      items.push(mapReleaseRow(row));

      if (items.length >= limit) break;
    }

    if (rows.length < Math.max(CATALOG_QUERY_MIN_BATCH, limit * CATALOG_QUERY_BATCH_FACTOR)) break;
  }

  return items;
}

async function queryCatalogReleaseCandidates(
  limit: number,
  after?: { releasedAt: Date; id: string },
): Promise<RawReleaseRow[]> {
  const afterReleasedAt = after?.releasedAt ?? null;
  const afterId = after?.id ?? null;

  const rows = await prisma.$queryRawUnsafe<RawReleaseRow[]>(
    `
    WITH catalog_candidates AS (
      SELECT
        CASE
          WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
          ELSE m."kodikId"
        END AS id,
        COALESCE(
          NULLIF(m."materialData"->>'anime_title', ''),
          m."title"
        ) AS "animeTitle",
        COALESCE(
          NULLIF(m."materialData"->>'anime_poster_url', ''),
          NULLIF(m."materialData"->>'poster_url', ''),
          NULLIF(m."materialData"->>'worldart_poster_url', '')
        ) AS "posterUrl",
        m."materialData"->>'worldart_link' AS "worldartLinkFromMaterial",
        COALESCE(m."lastSeason", 1) AS "seasonNumber",
        m."lastEpisode" AS "episodeNumber",
        m."translationTitle" AS "translationName",
        COALESCE(e."playerLink", m."playerLink") AS "playerLink",
        m."shikimoriId",
        m."kodikUpdatedAt" AS "releasedAt",
        COALESCE(
          m."materialData"->>'anime_description',
          m."materialData"->>'description'
        ) AS description,
        COALESCE(
          m."materialData"->'anime_genres',
          m."materialData"->'all_genres',
          m."materialData"->'genres',
          '[]'::jsonb
        ) AS genres,
        NULLIF(m."materialData"->>'anime_status', '') AS status,
        NULLIF(TRIM(COALESCE(
          m."materialData"->>'shikimori_rating',
          m."materialData"->>'shikimori_score'
        )), '') AS score,
        NULLIF(TRIM(COALESCE(
          m."materialData"->>'anime_kind',
          m."materialData"->'anime_full'->>'kind'
        )), '') AS kind,
        m."materialData"->'screenshots' AS "animeScreenshots",
        e."screenshots" AS "episodeScreenshots"
      FROM "KodikMaterial" m
      LEFT JOIN "KodikEpisode" e ON e."materialId" = m."kodikId"
        AND e."seasonNumber" = COALESCE(m."lastSeason", 1)
        AND e."episodeNumber" = m."lastEpisode"
      WHERE m."episodesLoaded" = true
        AND m."lastEpisode" IS NOT NULL
        AND m."lastEpisode" > 0
        AND m."kodikUpdatedAt" IS NOT NULL
        AND (
          $2::timestamptz IS NULL
          OR (
            m."kodikUpdatedAt",
            CASE
              WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
              ELSE m."kodikId"
            END
          ) < ($2::timestamptz, $3)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "KodikEpisodeRelease" r
          LEFT JOIN "KodikMaterial" rm ON rm."kodikId" = r."materialId"
          WHERE CASE
            WHEN COALESCE(rm."shikimoriId", r."shikimoriId") IS NOT NULL
              THEN COALESCE(rm."shikimoriId", r."shikimoriId")::text
            ELSE r."materialId"
          END = CASE
            WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
            ELSE m."kodikId"
          END
        )
      ORDER BY
        m."kodikUpdatedAt" DESC,
        CASE
          WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
          ELSE m."kodikId"
        END ASC,
        m."kodikId" ASC
      LIMIT $1
    )
    SELECT *
    FROM catalog_candidates
    ORDER BY "releasedAt" DESC, id ASC
    `,
    limit,
    afterReleasedAt,
    afterId,
  );

  return rows;
}

async function countFreshReleasesPerTitle(): Promise<number> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH latest_release AS (
      SELECT DISTINCT ON (title_key)
        title_key
      FROM (
        SELECT
          CASE
            WHEN COALESCE(m."shikimoriId", r."shikimoriId") IS NOT NULL
              THEN COALESCE(m."shikimoriId", r."shikimoriId")::text
            ELSE r."materialId"
          END AS title_key,
          r."releasedAt"
        FROM "KodikEpisodeRelease" r
        INNER JOIN "KodikMaterial" m ON m."kodikId" = r."materialId"
      ) release_rows
      ORDER BY
        title_key,
        "releasedAt" DESC
    )
    SELECT COUNT(*)::bigint AS count
    FROM latest_release
  `;

  return Number(result[0]?.count ?? 0);
}

async function countCatalogReleasesPerTitle(): Promise<number> {
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `
    WITH ${releaseTitleKeysCte()},
    titled_materials AS (
      SELECT
        m."kodikId",
        m."kodikUpdatedAt",
        m."lastEpisode",
        CASE
          WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
          ELSE m."kodikId"
        END AS title_key
      FROM "KodikMaterial" m
      WHERE m."episodesLoaded" = true
      AND CASE
        WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
        ELSE m."kodikId"
      END NOT IN (SELECT title_key FROM release_title_keys)
    ),
    best_material AS (
      SELECT DISTINCT ON (tm.title_key)
        tm.title_key,
        tm."lastEpisode"
      FROM titled_materials tm
      ORDER BY tm.title_key, tm."kodikUpdatedAt" DESC NULLS LAST, tm."kodikId"
    )
    SELECT COUNT(*)::bigint AS count
    FROM best_material bm

    `,
  );

  return Number(result[0]?.count ?? 0);
}

async function getRecentReleasesPageUncached(pageSize: number, cursor?: ReleasesCursor | null) {
  const phase = resolveFeedPhase(cursor);
  const after = parseCursorAfter(cursor);

  if (phase === "releases") {
    const rows = await queryFreshReleasesPerTitle(pageSize + 1, after);
    const hasMoreReleases = rows.length > pageSize;
    const items = hasMoreReleases ? rows.slice(0, pageSize) : rows;
    const lastItem = items.at(-1);

    if (hasMoreReleases && lastItem) {
      return {
        items,
        hasMore: true,
        nextCursor: toCursor("releases", lastItem),
      };
    }

    return {
      items,
      hasMore: true,
      nextCursor: { phase: "catalog", releasedAt: "", id: "" } satisfies ReleasesCursor,
    };
  }

  const rows = await queryCatalogReleasesPerTitle(pageSize + 1, after);
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const lastItem = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem ? toCursor("catalog", lastItem) : null,
  };
}

export async function getRecentReleases(limit = 48): Promise<ReleaseItem[]> {
  const fresh = await queryFreshReleasesPerTitle(limit);
  if (fresh.length >= limit) return fresh;
  const catalog = await queryCatalogReleasesPerTitle(limit - fresh.length);
  return [...fresh, ...catalog];
}

export async function getRecentReleasesPage(pageSize: number, cursor?: ReleasesCursor | null) {
  const cacheKey = cursor ? JSON.stringify(cursor) : "initial";

  return unstable_cache(
    async () => getRecentReleasesPageUncached(pageSize, cursor ?? null),
    ["recent-releases-page", String(pageSize), cacheKey],
    { revalidate: RELEASES_FEED_CACHE_SECONDS, tags: ["releases"] },
  )();
}

/** Свежие данные для API и клиентского polling (без unstable_cache). */
export async function getRecentReleasesPageLive(pageSize: number, cursor?: ReleasesCursor | null) {
  return getRecentReleasesPageUncached(pageSize, cursor);
}

export async function getReleaseStats() {
  const [freshTitles, catalogTitles, materials, episodes] = await Promise.all([
    countFreshReleasesPerTitle(),
    countCatalogReleasesPerTitle(),
    prisma.kodikMaterial.count(),
    prisma.kodikEpisode.count(),
  ]);

  return {
    releases: freshTitles + catalogTitles,
    freshReleases: freshTitles,
    catalogTitles,
    materials,
    episodes,
  };
}

