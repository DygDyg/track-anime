import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { analyticsConfig } from "@/lib/analytics/config";
import {
  identityKeyFor,
  isAnalyticsBotUserAgent,
  parseAnalyticsPath,
  parseUserAgent,
  utcDayStart,
  analyticsPlaySectionForPlayer,
  type AnalyticsPlayerKind,
  type ClientHintsInput,
} from "@/lib/analytics/ua";

export type TrackPageViewInput = {
  visitorKey: string | null | undefined;
  userId: string | null | undefined;
  path: string;
  userAgent: string | null | undefined;
  clientHints?: ClientHintsInput;
};

export type TrackPageViewResult = {
  visitorKey: string;
  tracked: boolean;
  throttled: boolean;
};

function pageViewThrottleMs(section: string): number {
  if (section === "anime") return analyticsConfig.animePageThrottleMs;
  return analyticsConfig.pathThrottleMs;
}

async function pruneOldAggregates(now = new Date()): Promise<void> {
  const cutoff = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - analyticsConfig.aggregateRetentionDays,
    ),
  );

  // Fire-and-forget style: rare enough if called every track; keep cheap.
  // Only delete when day-of-month matches to avoid every-request load.
  if (now.getUTCMinutes() % 17 !== 0) return;

  await Promise.all([
    prisma.siteVisitDay.deleteMany({ where: { day: { lt: cutoff } } }),
    prisma.siteContentDay.deleteMany({ where: { day: { lt: cutoff } } }),
    prisma.siteContentIdentityDay.deleteMany({ where: { day: { lt: cutoff } } }),
  ]);
}

async function recordContentHit(params: {
  day: Date;
  section: string;
  shikimoriId: number;
  identityKey: string;
}): Promise<void> {
  let isNewIdentityForContent = false;
  try {
    await prisma.siteContentIdentityDay.create({
      data: {
        day: params.day,
        section: params.section,
        shikimoriId: params.shikimoriId,
        identityKey: params.identityKey,
      },
    });
    isNewIdentityForContent = true;
  } catch {
    // unique violation — already counted today
  }

  await prisma.siteContentDay.upsert({
    where: {
      day_section_shikimoriId: {
        day: params.day,
        section: params.section,
        shikimoriId: params.shikimoriId,
      },
    },
    create: {
      day: params.day,
      section: params.section,
      shikimoriId: params.shikimoriId,
      hitCount: 1,
      uniqueCount: isNewIdentityForContent ? 1 : 0,
    },
    update: {
      hitCount: { increment: 1 },
      ...(isNewIdentityForContent ? { uniqueCount: { increment: 1 } } : {}),
    },
  });
}

async function mergeGuestVisitDayIntoUser(params: {
  day: Date;
  visitorKey: string;
  visitorId: string;
  userId: string;
  clientKind: string;
  os: string;
  browser: string;
}): Promise<void> {
  const guestKey = identityKeyFor(null, params.visitorKey);
  const userKey = identityKeyFor(params.userId, params.visitorKey);

  const guestRow = await prisma.siteVisitDay.findUnique({
    where: { day_identityKey: { day: params.day, identityKey: guestKey } },
  });
  if (!guestRow) return;

  await prisma.$transaction(async (tx) => {
    await tx.siteVisitDay.upsert({
      where: { day_identityKey: { day: params.day, identityKey: userKey } },
      create: {
        day: params.day,
        identityKey: userKey,
        userId: params.userId,
        visitorId: params.visitorId,
        hitCount: guestRow.hitCount,
        clientKind: params.clientKind,
        os: params.os,
        browser: params.browser,
      },
      update: {
        userId: params.userId,
        visitorId: params.visitorId,
        hitCount: { increment: guestRow.hitCount },
        clientKind: params.clientKind,
        os: params.os,
        browser: params.browser,
      },
    });
    await tx.siteVisitDay.delete({ where: { id: guestRow.id } }).catch(() => undefined);
  });
}

export async function trackPageView(input: TrackPageViewInput): Promise<TrackPageViewResult> {
  const parsedPath = parseAnalyticsPath(input.path);
  const visitorKey = (input.visitorKey?.trim() || randomUUID()).slice(0, 64);
  const userId = input.userId?.trim() || null;

  if (!parsedPath.shouldTrack) {
    return { visitorKey, tracked: false, throttled: false };
  }

  // Авторизованных не режем по UA; ботов без сессии — да.
  if (!userId && isAnalyticsBotUserAgent(input.userAgent)) {
    return { visitorKey, tracked: false, throttled: false };
  }

  const parsedUa = parseUserAgent(input.userAgent, input.clientHints);
  const now = new Date();
  const day = utcDayStart(now);
  const identityKey = identityKeyFor(userId, visitorKey);

  const existing = await prisma.siteVisitor.findUnique({ where: { visitorKey } });
  const throttleMs = pageViewThrottleMs(parsedPath.section);

  const throttled =
    Boolean(existing?.lastPathAt) &&
    existing!.lastPath === input.path &&
    now.getTime() - existing!.lastPathAt!.getTime() < throttleMs;

  const visitor = await prisma.siteVisitor.upsert({
    where: { visitorKey },
    create: {
      visitorKey,
      userId,
      firstSeenAt: now,
      lastSeenAt: now,
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
      deviceLabel: parsedUa.deviceLabel,
      uaHash: parsedUa.uaHash,
      lastPath: input.path,
      lastPathAt: now,
    },
    update: {
      ...(userId ? { userId } : {}),
      lastSeenAt: now,
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
      deviceLabel: parsedUa.deviceLabel,
      uaHash: parsedUa.uaHash,
      ...(throttled
        ? {}
        : {
            lastPath: input.path,
            lastPathAt: now,
          }),
    },
  });

  if (userId && existing && !existing.userId) {
    await mergeGuestVisitDayIntoUser({
      day,
      visitorKey,
      visitorId: visitor.id,
      userId,
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
    });
  }

  if (throttled) {
    void pruneOldAggregates(now);
    return { visitorKey, tracked: true, throttled: true };
  }

  await prisma.siteVisitDay.upsert({
    where: { day_identityKey: { day, identityKey } },
    create: {
      day,
      identityKey,
      userId,
      visitorId: visitor.id,
      hitCount: 1,
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
    },
    update: {
      userId,
      visitorId: visitor.id,
      hitCount: { increment: 1 },
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
    },
  });

  await recordContentHit({
    day,
    section: parsedPath.section,
    shikimoriId: parsedPath.shikimoriId,
    identityKey,
  });

  void pruneOldAggregates(now);

  return { visitorKey, tracked: true, throttled: false };
}

export type TrackAnimePlayInput = {
  visitorKey: string | null | undefined;
  userId: string | null | undefined;
  shikimoriId: number;
  userAgent: string | null | undefined;
  clientHints?: ClientHintsInput;
  /** kodik/TA vs VideoHUB; default kodik for older clients */
  player?: AnalyticsPlayerKind;
};

/** Учёт реального воспроизведения серии (не просто открытие страницы). */
export async function trackAnimePlay(input: TrackAnimePlayInput): Promise<TrackPageViewResult> {
  const shikimoriId = Number(input.shikimoriId);
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) {
    return { visitorKey: input.visitorKey?.trim() || randomUUID(), tracked: false, throttled: false };
  }

  const player: AnalyticsPlayerKind = input.player === "cvh" ? "cvh" : "kodik";
  const visitorKey = (input.visitorKey?.trim() || randomUUID()).slice(0, 64);
  const userId = input.userId?.trim() || null;
  if (!userId && isAnalyticsBotUserAgent(input.userAgent)) {
    return { visitorKey, tracked: false, throttled: false };
  }

  const playPath = `play:${player}:/anime/${shikimoriId}`;
  const parsedUa = parseUserAgent(input.userAgent, input.clientHints);
  const now = new Date();
  const day = utcDayStart(now);
  const identityKey = identityKeyFor(userId, visitorKey);

  const existing = await prisma.siteVisitor.findUnique({ where: { visitorKey } });
  const throttled =
    Boolean(existing?.lastPlayAt) &&
    existing!.lastPlayPath === playPath &&
    now.getTime() - existing!.lastPlayAt!.getTime() < analyticsConfig.animePlayThrottleMs;

  await prisma.siteVisitor.upsert({
    where: { visitorKey },
    create: {
      visitorKey,
      userId,
      firstSeenAt: now,
      lastSeenAt: now,
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
      deviceLabel: parsedUa.deviceLabel,
      uaHash: parsedUa.uaHash,
      lastPlayPath: playPath,
      lastPlayAt: now,
    },
    update: {
      ...(userId ? { userId } : {}),
      lastSeenAt: now,
      clientKind: parsedUa.clientKind,
      os: parsedUa.os,
      browser: parsedUa.browser,
      deviceLabel: parsedUa.deviceLabel,
      uaHash: parsedUa.uaHash,
      ...(throttled ? {} : { lastPlayPath: playPath, lastPlayAt: now }),
    },
  });

  if (throttled) {
    return { visitorKey, tracked: true, throttled: true };
  }

  await recordContentHit({
    day,
    section: "anime_play",
    shikimoriId,
    identityKey,
  });
  await recordContentHit({
    day,
    section: analyticsPlaySectionForPlayer(player),
    shikimoriId,
    identityKey,
  });

  void pruneOldAggregates(now);
  return { visitorKey, tracked: true, throttled: false };
}

export function newVisitorKey(): string {
  return randomUUID();
}
