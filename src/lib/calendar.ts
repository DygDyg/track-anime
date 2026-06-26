import { unstable_cache } from "next/cache";
import { toDate, toIsoString } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import type { ReleaseItemDto } from "@/lib/releases";

export type CalendarScheduleSource = "next_episode" | "first_dub";

export type CalendarItem = {
  shikimoriId: number;
  animeTitle: string;
  posterUrl: string | null;
  screenshotUrl: string | null;
  seasonNumber: number;
  episodeNumber: number;
  translationName: string;
  playerLink: string | null;
  description: string | null;
  genres: string[];
  scheduleAt: Date;
  scheduleSource: CalendarScheduleSource;
  dayOfWeek: number;
  status: string | null;
};

export type CalendarItemDto = Omit<CalendarItem, "scheduleAt"> & {
  scheduleAt: string;
};

export type CalendarDay = {
  dayOfWeek: number;
  label: string;
  shortLabel: string;
  items: CalendarItemDto[];
};

const DAY_LABELS: { label: string; shortLabel: string }[] = [
  { label: "", shortLabel: "" },
  { label: "Понедельник", shortLabel: "Пн" },
  { label: "Вторник", shortLabel: "Вт" },
  { label: "Среда", shortLabel: "Ср" },
  { label: "Четверг", shortLabel: "Чт" },
  { label: "Пятница", shortLabel: "Пт" },
  { label: "Суббота", shortLabel: "Сб" },
  { label: "Воскресенье", shortLabel: "Вс" },
];

type RawCalendarRow = {
  shikimoriId: number;
  animeTitle: string;
  posterUrl: string | null;
  posterFromMaterial: string | null;
  posterUrlFromMaterial: string | null;
  worldartPosterFromMaterial: string | null;
  worldartLinkFromMaterial: string | null;
  animeScreenshots: unknown;
  episodeScreenshots: unknown;
  seasonNumber: number;
  episodeNumber: number;
  translationName: string | null;
  playerLink: string | null;
  description: string | null;
  genres: unknown;
  scheduleAt: Date;
  scheduleSource: CalendarScheduleSource;
  dayOfWeek: number;
  status: string | null;
};

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
}

function normalizePlayerLink(link: string | null): string | null {
  if (!link) return null;
  if (link.startsWith("//")) return `https:${link}`;
  return link;
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

function mapCalendarRow(row: RawCalendarRow): CalendarItem {
  return {
    shikimoriId: row.shikimoriId,
    animeTitle: row.animeTitle,
    posterUrl:
      row.posterUrl ??
      posterFromMaterialParts(row),
    screenshotUrl: pickScreenshotUrl(
      [row.animeScreenshots, row.episodeScreenshots],
      String(row.shikimoriId),
    ),
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    translationName: row.translationName ?? "—",
    playerLink: normalizePlayerLink(row.playerLink),
    description: row.description ? stripHtml(row.description) : null,
    genres: parseGenres(row.genres),
    scheduleAt: toDate(row.scheduleAt),
    scheduleSource: row.scheduleSource,
    dayOfWeek: row.dayOfWeek,
    status: row.status ?? "ongoing",
  };
}

export function calendarItemToReleaseDto(item: CalendarItemDto): ReleaseItemDto {
  return {
    id: String(item.shikimoriId),
    animeTitle: item.animeTitle,
    posterUrl: item.posterUrl,
    screenshotUrl: item.screenshotUrl,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    translationName: item.translationName,
    playerLink: item.playerLink,
    shikimoriId: item.shikimoriId,
    releasedAt: item.scheduleAt,
    description: item.description,
    genres: item.genres,
    status: item.status,
  };
}

export function serializeCalendarItem(item: CalendarItem): CalendarItemDto {
  return {
    ...item,
    scheduleAt: toIsoString(item.scheduleAt),
  };
}

export function getMoscowDayOfWeek(date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    weekday: "short",
  }).format(date);

  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return map[weekday] ?? 1;
}

export async function getOngoingCalendarItems(): Promise<CalendarItem[]> {
  const rows = await prisma.$queryRaw<RawCalendarRow[]>`
    WITH ongoing_meta AS (
      SELECT DISTINCT ON (m."shikimoriId")
        m."shikimoriId",
        m."lastSeason",
        m."lastEpisode",
        COALESCE(m."materialData"->>'anime_title', m.title) AS "animeTitle",
        NULLIF(m."materialData"->>'anime_poster_url', '') AS "posterFromMaterial",
        NULLIF(m."materialData"->>'poster_url', '') AS "posterUrlFromMaterial",
        NULLIF(m."materialData"->>'worldart_poster_url', '') AS "worldartPosterFromMaterial",
        NULLIF(m."materialData"->>'worldart_link', '') AS "worldartLinkFromMaterial",
        (m."materialData"->>'next_episode_at')::timestamptz AS "nextEpisodeAt"
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" IS NOT NULL
        AND m."materialData"->>'anime_status' = 'ongoing'
      ORDER BY m."shikimoriId", m."kodikUpdatedAt" DESC NULLS LAST
    ),
    release_poster AS (
      SELECT DISTINCT ON (r."shikimoriId")
        r."shikimoriId",
        r."posterUrl"
      FROM "KodikEpisodeRelease" r
      INNER JOIN ongoing_meta om ON om."shikimoriId" = r."shikimoriId"
      ORDER BY
        r."shikimoriId",
        r."seasonNumber" DESC,
        r."episodeNumber" DESC,
        r."releasedAt" DESC
    ),
    first_kodik AS (
      SELECT
        om."shikimoriId",
        MIN(m."kodikUpdatedAt") AS "firstKodikAt"
      FROM ongoing_meta om
      INNER JOIN "KodikMaterial" m ON m."shikimoriId" = om."shikimoriId"
        AND COALESCE(m."lastSeason", 1) = COALESCE(om."lastSeason", 1)
        AND m."lastEpisode" = om."lastEpisode"
      WHERE m."kodikUpdatedAt" IS NOT NULL
      GROUP BY om."shikimoriId"
    ),
    first_dub_release AS (
      SELECT DISTINCT ON (om."shikimoriId")
        om."shikimoriId",
        r."translationName",
        r."playerLink"
      FROM ongoing_meta om
      INNER JOIN "KodikEpisodeRelease" r ON r."shikimoriId" = om."shikimoriId"
        AND r."seasonNumber" = COALESCE(om."lastSeason", 1)
        AND r."episodeNumber" = om."lastEpisode"
      ORDER BY om."shikimoriId", r."releasedAt" ASC
    ),
    material_meta AS (
      SELECT DISTINCT ON (m."shikimoriId")
        m."shikimoriId",
        COALESCE(
          m."materialData"->>'anime_description',
          m."materialData"->>'description'
        ) AS description,
        COALESCE(
          m."materialData"->'anime_genres',
          m."materialData"->'all_genres',
          m."materialData"->'genres',
          '[]'::jsonb
        ) AS genres
      FROM "KodikMaterial" m
      WHERE m."materialData"->>'anime_status' = 'ongoing'
      ORDER BY m."shikimoriId", m."kodikUpdatedAt" DESC NULLS LAST
    ),
    calendar_rows AS (
      SELECT
        om."shikimoriId",
        om."animeTitle",
        rp."posterUrl",
        om."posterFromMaterial",
        om."posterUrlFromMaterial",
        om."worldartPosterFromMaterial",
        om."worldartLinkFromMaterial",
        COALESCE(om."lastSeason", 1) AS "seasonNumber",
        om."lastEpisode" AS "episodeNumber",
        fdr."translationName",
        fdr."playerLink",
        mm.description,
        mm.genres,
        COALESCE(om."nextEpisodeAt", fk."firstKodikAt") AS "scheduleAt",
        CASE
          WHEN om."nextEpisodeAt" IS NOT NULL THEN 'next_episode'::text
          ELSE 'first_dub'::text
        END AS "scheduleSource",
        'ongoing'::text AS status
      FROM ongoing_meta om
      LEFT JOIN first_kodik fk ON fk."shikimoriId" = om."shikimoriId"
      LEFT JOIN release_poster rp ON rp."shikimoriId" = om."shikimoriId"
      LEFT JOIN first_dub_release fdr ON fdr."shikimoriId" = om."shikimoriId"
      LEFT JOIN material_meta mm ON mm."shikimoriId" = om."shikimoriId"
      WHERE om."lastEpisode" IS NOT NULL
        AND COALESCE(om."nextEpisodeAt", fk."firstKodikAt") IS NOT NULL
    )
    SELECT
      cr."shikimoriId",
      cr."animeTitle",
      cr."posterUrl",
      cr."posterFromMaterial",
      cr."seasonNumber",
      cr."episodeNumber",
      cr."translationName",
      cr."playerLink",
      cr.description,
      cr.genres,
      cr."scheduleAt",
      cr."scheduleSource",
      cr.status,
      EXTRACT(ISODOW FROM cr."scheduleAt" AT TIME ZONE 'Europe/Moscow')::int AS "dayOfWeek",
      mat."animeScreenshots",
      ep."episodeScreenshots"
    FROM calendar_rows cr
    LEFT JOIN LATERAL (
      SELECT m."materialData"->'screenshots' AS "animeScreenshots"
      FROM "KodikMaterial" m
      WHERE m."shikimoriId" = cr."shikimoriId"
        AND m."materialData"->>'anime_status' = 'ongoing'
      ORDER BY m."kodikUpdatedAt" DESC NULLS LAST
      LIMIT 1
    ) mat ON TRUE
    LEFT JOIN LATERAL (
      SELECT e."screenshots" AS "episodeScreenshots"
      FROM "KodikEpisode" e
      INNER JOIN "KodikMaterial" m ON m."kodikId" = e."materialId"
      WHERE m."shikimoriId" = cr."shikimoriId"
        AND e."seasonNumber" = cr."seasonNumber"
        AND e."episodeNumber" = cr."episodeNumber"
      ORDER BY e."updatedAt" DESC
      LIMIT 1
    ) ep ON TRUE
    ORDER BY "dayOfWeek", cr."animeTitle"
  `;

  return rows.map(mapCalendarRow);
}

export function groupCalendarByDay(items: CalendarItem[]): CalendarDay[] {
  const grouped = new Map<number, CalendarItemDto[]>();

  for (const item of items) {
    const bucket = grouped.get(item.dayOfWeek) ?? [];
    bucket.push(serializeCalendarItem(item));
    grouped.set(item.dayOfWeek, bucket);
  }

  return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
    dayOfWeek,
    label: DAY_LABELS[dayOfWeek]?.label ?? "",
    shortLabel: DAY_LABELS[dayOfWeek]?.shortLabel ?? "",
    items: grouped.get(dayOfWeek) ?? [],
  }));
}

export async function getOngoingCalendar(): Promise<CalendarDay[]> {
  return unstable_cache(
    async () => {
      const items = await getOngoingCalendarItems();
      return groupCalendarByDay(items);
    },
    ["ongoing-calendar"],
    { revalidate: 300, tags: ["calendar"] },
  )();
}
