import { unstable_cache } from "next/cache";
import { toDate } from "@/lib/dates";
import { resolveMaterialPosterUrl } from "@/lib/material-poster";
import { prisma } from "@/lib/prisma";
import type { ReleaseItem } from "@/lib/releases";
import { pickScreenshotUrl } from "@/lib/screenshots";

export const HOME_NOVELTIES_CACHE_TAG = "home-novelties";
export const HOME_NOVELTIES_CACHE_SECONDS = 24 * 60 * 60;
export const HOME_NOVELTIES_MAX_EPISODES = 5;
export const HOME_NOVELTIES_MAX_AGE_DAYS = 30;
const DEFAULT_LIMIT = 48;

type RawNoveltyRow = {
  id: string;
  materialId: string;
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

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
}

function mapNoveltyRow(row: RawNoveltyRow): ReleaseItem {
  return {
    id: row.id,
    materialId: row.materialId,
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

/**
 * Ранние тайтлы для блока «Новинки» на главной:
 * сезон 1, ≤5 серий, последний релиз не старше 30 дней.
 */
async function queryHomeNoveltiesUncached(limit: number): Promise<ReleaseItem[]> {
  const cutoff = new Date(Date.now() - HOME_NOVELTIES_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const maxEpisodes = HOME_NOVELTIES_MAX_EPISODES;

  const rows = await prisma.$queryRaw<RawNoveltyRow[]>`
    WITH latest_release AS (
      SELECT DISTINCT ON (title_key)
        title_key AS id,
        "materialId",
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
        "episodeScreenshots",
        episodes_aired_proxy
      FROM (
        SELECT
          CASE
            WHEN COALESCE(m."shikimoriId", r."shikimoriId") IS NOT NULL
              THEN COALESCE(m."shikimoriId", r."shikimoriId")::text
            ELSE r."materialId"
          END AS title_key,
          r."materialId",
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
          r."releasedAt" AS "releasedAt",
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
          e."screenshots" AS "episodeScreenshots",
          COALESCE(
            CASE
              WHEN (m."materialData"->>'episodes_aired') ~ '^[0-9]+$'
                THEN NULLIF((m."materialData"->>'episodes_aired')::int, 0)
              ELSE NULL
            END,
            CASE
              WHEN (m."materialData"->'anime_full'->>'episodes_aired') ~ '^[0-9]+$'
                THEN NULLIF((m."materialData"->'anime_full'->>'episodes_aired')::int, 0)
              ELSE NULL
            END,
            r."episodeNumber"
          ) AS episodes_aired_proxy
        FROM "KodikEpisodeRelease" r
        INNER JOIN "KodikMaterial" m ON m."kodikId" = r."materialId"
        LEFT JOIN "KodikEpisode" e ON e."materialId" = r."materialId"
          AND e."seasonNumber" = r."seasonNumber"
          AND e."episodeNumber" = r."episodeNumber"
        WHERE r."seasonNumber" <= 1
      ) release_rows
      ORDER BY
        title_key,
        "seasonNumber" DESC,
        "episodeNumber" DESC,
        "releasedAt" DESC
    )
    SELECT
      id,
      "materialId",
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
    FROM latest_release
    WHERE "releasedAt" >= ${cutoff}
      AND episodes_aired_proxy <= ${maxEpisodes}
      AND (kind IS NULL OR LOWER(kind) <> 'movie')
    ORDER BY "releasedAt" DESC, id ASC
    LIMIT ${limit}
  `;

  return rows.map(mapNoveltyRow);
}

/** Общий список «Новинки» для главной (кеш 24 ч, tag home-novelties). */
export async function getHomeNovelties(limit = DEFAULT_LIMIT): Promise<ReleaseItem[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 96) : DEFAULT_LIMIT;
  return unstable_cache(
    async () => queryHomeNoveltiesUncached(safeLimit),
    ["home-novelties", String(safeLimit)],
    { revalidate: HOME_NOVELTIES_CACHE_SECONDS, tags: [HOME_NOVELTIES_CACHE_TAG] },
  )();
}
