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
};

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
  const afterReleasedAt = after?.releasedAt ?? null;
  const afterId = after?.id ?? null;

  const rows = await prisma.$queryRawUnsafe<RawReleaseRow[]>(
    `
    WITH ${releaseTitleKeysCte()},
    titled_materials AS (
      SELECT
        m."kodikId",
        m."shikimoriId",
        m."kodikUpdatedAt",
        m."lastSeason",
        m."lastEpisode",
        CASE
          WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
          ELSE m."kodikId"
        END AS title_key
      FROM "KodikMaterial" m
      WHERE (
        COALESCE(m."lastEpisode", 0) > 0
        OR m."episodesLoaded" = true
      )
      AND CASE
        WHEN m."shikimoriId" IS NOT NULL THEN m."shikimoriId"::text
        ELSE m."kodikId"
      END NOT IN (SELECT title_key FROM release_title_keys)
    ),
    best_material AS (
      SELECT DISTINCT ON (tm.title_key)
        tm.title_key,
        tm."kodikId",
        tm."shikimoriId",
        tm."lastSeason",
        tm."lastEpisode"
      FROM titled_materials tm
      ORDER BY tm.title_key, tm."kodikUpdatedAt" DESC NULLS LAST, tm."kodikId"
    ),
    catalog_row AS (
      SELECT DISTINCT ON (bm.title_key)
        bm.title_key AS id,
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
        COALESCE(bm."lastSeason", 1) AS "seasonNumber",
        bm."lastEpisode" AS "episodeNumber",
        m."translationTitle" AS "translationName",
        COALESCE(e."playerLink", m."playerLink") AS "playerLink",
        bm."shikimoriId",
        COALESCE(m."kodikUpdatedAt", m."updatedAt") AS "releasedAt",
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
        m."materialData"->'screenshots' AS "animeScreenshots",
        e."screenshots" AS "episodeScreenshots"
      FROM best_material bm
      INNER JOIN "KodikMaterial" m ON m."kodikId" = bm."kodikId"
      LEFT JOIN "KodikEpisode" e ON e."materialId" = bm."kodikId"
        AND e."seasonNumber" = COALESCE(bm."lastSeason", 1)
        AND e."episodeNumber" = bm."lastEpisode"
      WHERE bm."lastEpisode" IS NOT NULL AND bm."lastEpisode" > 0
      ORDER BY bm.title_key
    )
    SELECT *
    FROM catalog_row
    WHERE (
      $2::timestamptz IS NULL
      OR ("releasedAt", id) < ($2::timestamptz, $3)
    )
    ORDER BY "releasedAt" DESC, id ASC
    LIMIT $1
    `,
    limit,
    afterReleasedAt,
    afterId,
  );

  return rows.map(mapReleaseRow);
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
      WHERE (
        COALESCE(m."lastEpisode", 0) > 0
        OR m."episodesLoaded" = true
      )
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
    WHERE bm."lastEpisode" IS NOT NULL AND bm."lastEpisode" > 0
    `,
  );

  return Number(result[0]?.count ?? 0);
}

async function catalogHasMore(after?: { releasedAt: Date; id: string }): Promise<boolean> {
  const rows = await queryCatalogReleasesPerTitle(1, after);
  return rows.length > 0;
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

    const hasCatalog = await catalogHasMore();
    return {
      items,
      hasMore: hasCatalog,
      nextCursor: hasCatalog ? ({ phase: "catalog", releasedAt: "", id: "" } satisfies ReleasesCursor) : null,
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
  if (!cursor) {
    return unstable_cache(
      async () => getRecentReleasesPageUncached(pageSize, null),
      ["recent-releases-page", String(pageSize), "initial"],
      { revalidate: 300, tags: ["releases"] },
    )();
  }

  return getRecentReleasesPageUncached(pageSize, cursor);
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
