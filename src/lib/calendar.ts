import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { SHIKIMORI_CACHE_TRANSLATION_TYPE } from "@/db/save-shikimori-material";
import { toDate, toIsoString } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { resolveMaterialPosterUrl, type MaterialPosterSource } from "@/lib/material-poster";
import { pickScreenshotUrl } from "@/lib/screenshots";
import { fetchShikimoriCalendar } from "@/lib/shikimori/calendar-api";
import { animeBriefPosterUrl, animeBriefTitle } from "@/lib/shikimori/anime-brief";
import { SHIKIMORI_FULL_ANIME_KINDS } from "@/lib/shikimori/full-anime-kinds";
import type { ReleaseItemDto } from "@/lib/releases";

export type CalendarScheduleSource = "next_episode" | "premiere";

export type CalendarTab = "ongoing" | "anons";

export type CalendarOngoingSource = "kodik" | "shikimori";

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
  score: string | null;
  /** Для анонсов: false, если дата премьеры ещё неизвестна */
  hasScheduleDate?: boolean;
};

export type CalendarItemDto = Omit<CalendarItem, "scheduleAt"> & {
  scheduleAt: string;
  hasScheduleDate?: boolean;
};

export type CalendarDay = {
  dayOfWeek: number;
  label: string;
  shortLabel: string;
  items: CalendarItemDto[];
};

export type CalendarMonth = {
  year: number;
  month: number;
  label: string;
  items: CalendarItemDto[];
};

export const CALENDAR_UNKNOWN_MONTH = 0;
export const CALENDAR_UNKNOWN_YEAR = 0;

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
  score: string | null;
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
    score: row.score,
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
    releasedAt: item.hasScheduleDate === false ? "" : item.scheduleAt,
    description: item.description,
    genres: item.genres,
    status: item.status,
    score: item.score,
  };
}

export function serializeCalendarItem(item: CalendarItem): CalendarItemDto {
  return {
    ...item,
    scheduleAt: toIsoString(item.scheduleAt),
    hasScheduleDate: item.hasScheduleDate,
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

/** Полночь текущих суток по Москве (для сравнения дат анонсов). */
export function getMoscowDayStart(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return new Date(`${year}-${month}-${day}T00:00:00+03:00`);
}

export function isAnonsSchedulePast(item: CalendarItemDto, todayStartMsk: Date): boolean {
  if (item.hasScheduleDate === false) return false;
  return new Date(item.scheduleAt).getTime() < todayStartMsk.getTime();
}

export function isAnonsScheduleUnknown(item: CalendarItemDto): boolean {
  return item.hasScheduleDate === false;
}

export type SplitAnonsScheduleResult = {
  upcomingMonths: CalendarMonth[];
  pastMonths: CalendarMonth[];
  unknownItems: CalendarItemDto[];
  pastCount: number;
  unknownCount: number;
  upcomingCount: number;
};

export function splitAnonsMonthsBySchedule(
  months: CalendarMonth[],
  now = new Date(),
): SplitAnonsScheduleResult {
  const todayStartMsk = getMoscowDayStart(now);
  const upcomingBuckets = new Map<string, CalendarItemDto[]>();
  const pastBuckets = new Map<string, CalendarItemDto[]>();
  const unknownItems: CalendarItemDto[] = [];
  let pastCount = 0;
  let unknownCount = 0;
  let upcomingCount = 0;

  for (const month of months) {
    for (const item of month.items) {
      if (isAnonsScheduleUnknown(item)) {
        unknownItems.push(item);
        unknownCount += 1;
        continue;
      }

      const bucketKey = `${month.year}-${month.month}`;
      if (isAnonsSchedulePast(item, todayStartMsk)) {
        const bucket = pastBuckets.get(bucketKey) ?? [];
        bucket.push(item);
        pastBuckets.set(bucketKey, bucket);
        pastCount += 1;
        continue;
      }

      const bucket = upcomingBuckets.get(bucketKey) ?? [];
      bucket.push(item);
      upcomingBuckets.set(bucketKey, bucket);
      upcomingCount += 1;
    }
  }

  unknownItems.sort((a, b) => a.animeTitle.localeCompare(b.animeTitle, "ru"));

  const buildMonths = (buckets: Map<string, CalendarItemDto[]>, order: "asc" | "desc") =>
    [...buckets.entries()]
      .map(([key, items]) => {
        const [yearRaw, monthRaw] = key.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        return {
          year,
          month,
          label: formatCalendarMonthLabel(year, month),
          items,
          sortKey: year === CALENDAR_UNKNOWN_YEAR ? Number.MAX_SAFE_INTEGER : year * 100 + month,
        };
      })
      .sort((a, b) => {
        const diff = a.sortKey - b.sortKey;
        return (order === "asc" ? diff : -diff) || a.label.localeCompare(b.label, "ru");
      })
      .map(({ year, month, label, items }) => ({ year, month, label, items }));

  return {
    upcomingMonths: buildMonths(upcomingBuckets, "asc"),
    pastMonths: buildMonths(pastBuckets, "desc"),
    unknownItems,
    pastCount,
    unknownCount,
    upcomingCount,
  };
}

export function parseCalendarTab(raw?: string): CalendarTab {
  return raw === "anons" ? "anons" : "ongoing";
}

export function parseCalendarOngoingSource(raw?: string): CalendarOngoingSource {
  return raw === "shikimori" ? "shikimori" : "kodik";
}

export type CalendarPageData = {
  ongoingDays: CalendarDay[];
  anonsMonths: CalendarMonth[];
};

export function getMoscowYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return {
    year: Number.isFinite(year) ? year : CALENDAR_UNKNOWN_YEAR,
    month: Number.isFinite(month) ? month : CALENDAR_UNKNOWN_MONTH,
  };
}

export function formatCalendarMonthLabel(year: number, month: number): string {
  if (year === CALENDAR_UNKNOWN_YEAR || month === CALENDAR_UNKNOWN_MONTH) {
    return "Дата уточняется";
  }

  const labelDate = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(labelDate);
}

export async function getCalendarPageData(
  ongoingSource: CalendarOngoingSource = "kodik",
): Promise<CalendarPageData> {
  return unstable_cache(
    async () => {
      const ongoingPromise =
        ongoingSource === "shikimori"
          ? getShikimoriOngoingCalendarItems()
          : getOngoingCalendarItems();
      const [ongoingItems, anonsItems] = await Promise.all([
        ongoingPromise,
        getAnonsCalendarItems(),
      ]);
      return {
        ongoingDays: groupCalendarByDay(ongoingItems),
        anonsMonths: groupCalendarByMonth(anonsItems),
      };
    },
    ["calendar-page-v6", ongoingSource],
    { revalidate: 300, tags: ["calendar"] },
  )();
}

export async function getShikimoriOngoingCalendarItems(): Promise<CalendarItem[]> {
  const entries = await fetchShikimoriCalendar();

  return entries
    .map((entry): CalendarItem | null => {
      if (entry.anime.status !== "ongoing") return null;
      if (!entry.next_episode_at) return null;

      const scheduleAt = new Date(entry.next_episode_at);
      if (Number.isNaN(scheduleAt.getTime())) return null;

      return {
        shikimoriId: entry.anime.id,
        animeTitle: animeBriefTitle(entry.anime),
        posterUrl: animeBriefPosterUrl(entry.anime.image),
        screenshotUrl: null,
        seasonNumber: 1,
        episodeNumber: entry.next_episode,
        translationName: "Shikimori",
        playerLink: null,
        description: null,
        genres: [],
        scheduleAt,
        scheduleSource: "next_episode",
        dayOfWeek: getMoscowDayOfWeek(scheduleAt),
        status: entry.anime.status,
        score: entry.anime.score,
      };
    })
    .filter((item): item is CalendarItem => item != null)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.animeTitle.localeCompare(b.animeTitle, "ru"));
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
        (m."materialData"->>'next_episode_at')::timestamptz AS "nextEpisodeAt",
        NULLIF(TRIM(COALESCE(
          m."materialData"->>'shikimori_rating',
          m."materialData"->>'shikimori_score'
        )), '') AS score
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
        om.score,
        om."nextEpisodeAt" AS "scheduleAt",
        'next_episode'::text AS "scheduleSource",
        'ongoing'::text AS status
      FROM ongoing_meta om
      LEFT JOIN release_poster rp ON rp."shikimoriId" = om."shikimoriId"
      LEFT JOIN first_dub_release fdr ON fdr."shikimoriId" = om."shikimoriId"
      LEFT JOIN material_meta mm ON mm."shikimoriId" = om."shikimoriId"
      WHERE om."lastEpisode" IS NOT NULL
        AND om."nextEpisodeAt" IS NOT NULL
    )
    SELECT
      cr."shikimoriId",
      cr."animeTitle",
      cr."posterUrl",
      cr."posterFromMaterial",
      cr."posterUrlFromMaterial",
      cr."worldartPosterFromMaterial",
      cr."worldartLinkFromMaterial",
      cr."seasonNumber",
      cr."episodeNumber",
      cr."translationName",
      cr."playerLink",
      cr.description,
      cr.genres,
      cr."scheduleAt",
      cr."scheduleSource",
      cr.status,
      cr.score,
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

export async function getAnonsCalendarItems(): Promise<CalendarItem[]> {
  const rows = await prisma.$queryRaw<
    {
      shikimoriId: number;
      animeTitle: string;
      posterUrl: string | null;
      posterFromMaterial: string | null;
      posterUrlFromMaterial: string | null;
      worldartPosterFromMaterial: string | null;
      worldartLinkFromMaterial: string | null;
      animeScreenshots: unknown;
      scheduleAt: Date | null;
      scheduleSource: CalendarScheduleSource | null;
      score: string | null;
      playerLink: string | null;
      translationName: string | null;
      nextEpisode: number | null;
    }[]
  >`
    WITH anons_entries AS (
      SELECT
        e."shikimoriId",
        e."animeTitle",
        e."posterUrl",
        e."scheduleAt",
        e."scheduleSource",
        e.score,
        e."nextEpisode"
      FROM "ShikimoriAnonsEntry" e
      WHERE e.kind IN (${Prisma.join(SHIKIMORI_FULL_ANIME_KINDS)})
    ),
    kodik_meta AS (
      SELECT DISTINCT ON (m."shikimoriId")
        m."shikimoriId",
        NULLIF(m."materialData"->>'anime_poster_url', '') AS "posterFromMaterial",
        NULLIF(m."materialData"->>'poster_url', '') AS "posterUrlFromMaterial",
        NULLIF(m."materialData"->>'worldart_poster_url', '') AS "worldartPosterFromMaterial",
        NULLIF(m."materialData"->>'worldart_link', '') AS "worldartLinkFromMaterial",
        m."materialData"->'screenshots' AS "animeScreenshots",
        m."playerLink",
        m."translationTitle" AS "translationName"
      FROM "KodikMaterial" m
      INNER JOIN anons_entries ae ON ae."shikimoriId" = m."shikimoriId"
      WHERE m."translationType" <> ${SHIKIMORI_CACHE_TRANSLATION_TYPE}
      ORDER BY m."shikimoriId", m."kodikUpdatedAt" DESC NULLS LAST
    )
    SELECT
      ae."shikimoriId",
      ae."animeTitle",
      ae."posterUrl",
      km."posterFromMaterial",
      km."posterUrlFromMaterial",
      km."worldartPosterFromMaterial",
      km."worldartLinkFromMaterial",
      km."animeScreenshots",
      ae."scheduleAt",
      ae."scheduleSource",
      ae.score,
      km."playerLink",
      km."translationName",
      ae."nextEpisode"
    FROM anons_entries ae
    LEFT JOIN kodik_meta km ON km."shikimoriId" = ae."shikimoriId"
    ORDER BY ae."scheduleAt" ASC NULLS LAST, ae."animeTitle" ASC
  `;

  return rows.map((row) => {
    const scheduleAt = row.scheduleAt ? toDate(row.scheduleAt) : null;

    return {
      shikimoriId: row.shikimoriId,
      animeTitle: row.animeTitle,
      posterUrl:
        row.posterUrl ??
        posterFromMaterialParts({
          posterFromMaterial: row.posterFromMaterial,
          posterUrlFromMaterial: row.posterUrlFromMaterial,
          worldartPosterFromMaterial: row.worldartPosterFromMaterial,
          worldartLinkFromMaterial: row.worldartLinkFromMaterial,
        }),
      screenshotUrl: pickScreenshotUrl([row.animeScreenshots], String(row.shikimoriId)),
      seasonNumber: 1,
      episodeNumber: row.nextEpisode ?? 1,
      translationName: row.translationName ?? "—",
      playerLink: normalizePlayerLink(row.playerLink),
      description: null,
      genres: [],
      scheduleAt: scheduleAt ?? new Date(0),
      scheduleSource: row.scheduleSource ?? "premiere",
      dayOfWeek: 0,
      status: "anons",
      score: row.score,
      hasScheduleDate: scheduleAt != null,
    };
  });
}

export function groupCalendarByMonth(items: CalendarItem[]): CalendarMonth[] {
  const grouped = new Map<string, CalendarItemDto[]>();

  for (const item of items) {
    const { year, month } =
      item.hasScheduleDate === false
        ? { year: CALENDAR_UNKNOWN_YEAR, month: CALENDAR_UNKNOWN_MONTH }
        : getMoscowYearMonth(item.scheduleAt);

    const key = `${year}-${month}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(serializeCalendarItem(item));
    grouped.set(key, bucket);
  }

  const sections = [...grouped.entries()].map(([key, bucketItems]) => {
    const [yearRaw, monthRaw] = key.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);

    return {
      year,
      month,
      label: formatCalendarMonthLabel(year, month),
      items: bucketItems,
      sortKey: year === CALENDAR_UNKNOWN_YEAR ? Number.MAX_SAFE_INTEGER : year * 100 + month,
    };
  });

  sections.sort((a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label, "ru"));

  return sections.map(({ year, month, label, items: bucketItems }) => ({
    year,
    month,
    label,
    items: bucketItems,
  }));
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
  const data = await getCalendarPageData();
  return data.ongoingDays;
}
