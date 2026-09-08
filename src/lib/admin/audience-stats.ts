import "server-only";

import { prisma } from "@/lib/prisma";
import { analyticsConfig } from "@/lib/analytics/config";
import { utcDayStart, type ContentSection } from "@/lib/analytics/ua";

export type AudienceCountRow = {
  key: string;
  label: string;
  count: number;
};

export type AudienceDayPoint = {
  day: string;
  identities: number;
  hits: number;
};

export type AudienceTitleRow = {
  shikimoriId: number;
  title: string;
  hits: number;
  uniques: number;
};

export type AudienceSectionRow = {
  section: string;
  label: string;
  hits: number;
  uniques: number;
};

export type AudienceStats = {
  totalIdentities: number;
  registeredIdentities: number;
  guestIdentities: number;
  activeNow: number;
  dau: number;
  wau: number;
  mau: number;
  days: AudienceDayPoint[];
  byClientKind: AudienceCountRow[];
  byOs: AudienceCountRow[];
  byBrowser: AudienceCountRow[];
  topSections: AudienceSectionRow[];
  topTitles: AudienceTitleRow[];
};

const SECTION_LABELS: Record<ContentSection | string, string> = {
  home: "Главная",
  anime: "Страницы аниме",
  favorites: "Избранное",
  history: "История",
  search: "Поиск",
  calendar: "Календарь",
  login: "Вход",
  app: "Приложения",
  other: "Прочее",
};

const CLIENT_KIND_LABELS: Record<string, string> = {
  web: "Браузер",
  pwa: "PWA",
  android_apk: "Android APK",
  windows_app: "Windows app",
  android_tv: "Android TV",
};

function daysAgoUtc(n: number, from = new Date()): Date {
  const base = utcDayStart(from);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - n));
}

function toDayIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function aggregateCounts(
  rows: { key: string; count: number }[],
  labelFn: (key: string) => string,
  limit = 12,
): AudienceCountRow[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.key, (map.get(row.key) ?? 0) + row.count);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: labelFn(key), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getAudienceStats(options?: { chartDays?: number }): Promise<AudienceStats> {
  const chartDays = options?.chartDays ?? 30;
  const now = new Date();
  const today = utcDayStart(now);
  const day7 = daysAgoUtc(6, now);
  const day30 = daysAgoUtc(29, now);
  const chartFrom = daysAgoUtc(chartDays - 1, now);
  // Always load ≥30 days so DAU/WAU/MAU stay correct even when chartDays is smaller.
  const visitFrom = chartFrom < day30 ? chartFrom : day30;
  const activeSince = new Date(now.getTime() - analyticsConfig.activeWindowMs);

  const [
    totalVisitors,
    linkedVisitors,
    activeNow,
    visitDays,
    contentRows,
    titleRows,
  ] = await Promise.all([
    prisma.siteVisitor.count(),
    prisma.siteVisitor.count({ where: { userId: { not: null } } }),
    prisma.siteVisitor.count({ where: { lastSeenAt: { gte: activeSince } } }),
    prisma.siteVisitDay.findMany({
      where: { day: { gte: visitFrom } },
      select: {
        day: true,
        identityKey: true,
        hitCount: true,
        clientKind: true,
        os: true,
        browser: true,
        userId: true,
      },
    }),
    prisma.siteContentDay.findMany({
      where: { day: { gte: day30 }, shikimoriId: 0 },
      select: { section: true, hitCount: true, uniqueCount: true },
    }),
    prisma.siteContentDay.findMany({
      where: {
        day: { gte: day30 },
        section: "anime",
        shikimoriId: { gt: 0 },
      },
      select: { shikimoriId: true, hitCount: true, uniqueCount: true },
      orderBy: { hitCount: "desc" },
      take: 200,
    }),
  ]);

  const identitiesToday = new Set<string>();
  const identitiesWeek = new Set<string>();
  const identitiesMonth = new Set<string>();
  const registeredKeys = new Set<string>();
  const guestKeys = new Set<string>();

  const perDay = new Map<string, { identities: Set<string>; hits: number }>();
  for (let i = 0; i < chartDays; i++) {
    const d = daysAgoUtc(chartDays - 1 - i, now);
    perDay.set(toDayIso(d), { identities: new Set(), hits: 0 });
  }

  const kindRows: { key: string; count: number }[] = [];
  const osRows: { key: string; count: number }[] = [];
  const browserRows: { key: string; count: number }[] = [];

  for (const row of visitDays) {
    const dayIso = toDayIso(row.day);
    const bucket = perDay.get(dayIso);
    if (bucket) {
      bucket.identities.add(row.identityKey);
      bucket.hits += row.hitCount;
    }

    if (row.day >= today) identitiesToday.add(row.identityKey);
    if (row.day >= day7) identitiesWeek.add(row.identityKey);
    if (row.day >= day30) identitiesMonth.add(row.identityKey);

    if (row.identityKey.startsWith("u:") || row.userId) registeredKeys.add(row.identityKey);
    else guestKeys.add(row.identityKey);

    if (row.day >= day30) {
      kindRows.push({ key: row.clientKind || "web", count: 1 });
      osRows.push({ key: row.os || "unknown", count: 1 });
      browserRows.push({ key: row.browser || "unknown", count: 1 });
    }
  }

  // Prefer visitor-table totals for "all time" guest/registered when history is short
  const registeredIdentities = Math.max(linkedVisitors, registeredKeys.size);
  const guestIdentities = Math.max(0, totalVisitors - linkedVisitors);

  const sectionMap = new Map<string, { hits: number; uniques: number }>();
  for (const row of contentRows) {
    const prev = sectionMap.get(row.section) ?? { hits: 0, uniques: 0 };
    prev.hits += row.hitCount;
    prev.uniques += row.uniqueCount;
    sectionMap.set(row.section, prev);
  }

  const titleAgg = new Map<number, { hits: number; uniques: number }>();
  for (const row of titleRows) {
    const prev = titleAgg.get(row.shikimoriId) ?? { hits: 0, uniques: 0 };
    prev.hits += row.hitCount;
    prev.uniques += row.uniqueCount;
    titleAgg.set(row.shikimoriId, prev);
  }

  const topTitleIds = [...titleAgg.entries()]
    .sort((a, b) => b[1].hits - a[1].hits)
    .slice(0, 15)
    .map(([id]) => id);

  const titleNames = topTitleIds.length
    ? await prisma.kodikMaterial.findMany({
        where: { shikimoriId: { in: topTitleIds } },
        select: { shikimoriId: true, title: true },
        distinct: ["shikimoriId"],
      })
    : [];

  const titleById = new Map<number, string>();
  for (const m of titleNames) {
    if (m.shikimoriId != null && !titleById.has(m.shikimoriId)) {
      titleById.set(m.shikimoriId, m.title);
    }
  }

  return {
    totalIdentities: Math.max(totalVisitors, identitiesMonth.size),
    registeredIdentities,
    guestIdentities,
    activeNow,
    dau: identitiesToday.size,
    wau: identitiesWeek.size,
    mau: identitiesMonth.size,
    days: [...perDay.entries()].map(([day, v]) => ({
      day,
      identities: v.identities.size,
      hits: v.hits,
    })),
    byClientKind: aggregateCounts(kindRows, (k) => CLIENT_KIND_LABELS[k] ?? k),
    byOs: aggregateCounts(osRows, (k) => k),
    byBrowser: aggregateCounts(browserRows, (k) => k),
    topSections: [...sectionMap.entries()]
      .map(([section, v]) => ({
        section,
        label: SECTION_LABELS[section] ?? section,
        hits: v.hits,
        uniques: v.uniques,
      }))
      .sort((a, b) => b.hits - a.hits),
    topTitles: topTitleIds.map((id) => {
      const agg = titleAgg.get(id)!;
      return {
        shikimoriId: id,
        title: titleById.get(id) ?? `Аниме #${id}`,
        hits: agg.hits,
        uniques: agg.uniques,
      };
    }),
  };
}

export async function getAudienceSummary(): Promise<{
  dau: number;
  activeNow: number;
  mau: number;
}> {
  const stats = await getAudienceStats({ chartDays: 1 });
  return { dau: stats.dau, activeNow: stats.activeNow, mau: stats.mau };
}
