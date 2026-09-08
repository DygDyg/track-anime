import {
  historyNewCutoffDate,
  historyNewEpisodeKey,
  isEpisodeNewer,
  isHistoryNewReleaseFresh,
  type HistoryNewMaterialRow,
  type HistoryNewProgressRow,
} from "@/lib/history-new-match";
import { sendBrowserPushNotification } from "@/lib/notifications/channels/browser";
import { sendFcmPushNotification } from "@/lib/notifications/channels/fcm";
import { buildHistoryNewNotificationPayload, resolveNotificationAnimeMeta } from "@/lib/notifications/payload";
import { prisma } from "@/lib/prisma";
import { isWatchHistoryBookmark } from "@/lib/watch-history";
import { isHomeTranslationVisible, normalizeSiteSettings } from "@/lib/site-settings";
import type { HistoryNewNotificationPayload, NotificationChannelId } from "@/lib/notifications/types";

const MATERIAL_SELECT = {
  shikimoriId: true,
  kodikId: true,
  title: true,
  lastSeason: true,
  lastEpisode: true,
  episodesCount: true,
  kodikUpdatedAt: true,
  updatedAt: true,
  translationTitle: true,
  playerLink: true,
  materialData: true,
} as const;

type MatchResult = {
  progress: HistoryNewProgressRow;
  material: HistoryNewMaterialRow;
  payload: HistoryNewNotificationPayload;
};

export async function findHistoryNewMatchesForRelease(input: {
  materialId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<MatchResult[]> {
  const material = await prisma.kodikMaterial.findUnique({
    where: { kodikId: input.materialId },
    select: MATERIAL_SELECT,
  });

  if (!material?.lastEpisode) return [];

  const progressRows = await prisma.userWatchProgress.findMany({
    where: { kodikId: input.materialId },
    select: {
      userId: true,
      shikimoriId: true,
      seasonNumber: true,
      episodeNumber: true,
      kodikId: true,
    },
  });

  if (progressRows.length === 0) return [];

  const [episode, release] = await Promise.all([
    prisma.kodikEpisode.findUnique({
      where: {
        materialId_seasonNumber_episodeNumber: {
          materialId: input.materialId,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
        },
      },
      select: { firstSeenAt: true },
    }),
    prisma.kodikEpisodeRelease.findUnique({
      where: {
        materialId_seasonNumber_episodeNumber: {
          materialId: input.materialId,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
        },
      },
      select: { releasedAt: true },
    }),
  ]);

  const cutoff = historyNewCutoffDate();
  if (
    !isHistoryNewReleaseFresh(
      material,
      input.seasonNumber,
      input.episodeNumber,
      release?.releasedAt,
      episode?.firstSeenAt,
      cutoff,
    )
  ) {
    return [];
  }

  const matches: MatchResult[] = [];
  const animeMeta = material.shikimoriId
    ? await resolveNotificationAnimeMeta(material.shikimoriId, material.materialData)
    : null;

  for (const progress of progressRows) {
    if (isWatchHistoryBookmark(progress)) continue;
    if (
      !isEpisodeNewer(
        progress.seasonNumber,
        progress.episodeNumber,
        input.seasonNumber,
        input.episodeNumber,
      )
    ) {
      continue;
    }

    const payload = await buildHistoryNewNotificationPayload({
      material,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      watchedSeasonNumber: progress.seasonNumber,
      watchedEpisodeNumber: progress.episodeNumber,
      animeMeta: animeMeta ?? undefined,
    });

    if (!payload) continue;

    matches.push({ progress, material, payload });
  }

  return matches;
}

async function isUserEligibleForNotification(userId: string, translationName: string): Promise<{
  eligible: boolean;
  channels: NotificationChannelId[];
}> {
  const [prefs, user, pushCount, fcmCount] = await Promise.all([
    prisma.userNotificationPreferences.findUnique({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { siteSettings: true },
    }),
    prisma.pushSubscription.count({ where: { userId } }),
    prisma.fcmDeviceToken.count({ where: { userId } }),
  ]);

  if (!prefs?.historyNewEnabled) {
    return { eligible: false, channels: [] };
  }

  const siteSettings = normalizeSiteSettings(user?.siteSettings);
  if (!isHomeTranslationVisible(translationName, siteSettings.homeTranslationFilter)) {
    return { eligible: false, channels: [] };
  }

  const channels: NotificationChannelId[] = [];
  if (pushCount > 0) channels.push("browser");
  if (fcmCount > 0) channels.push("fcm");
  if (prefs.telegramEnabled) channels.push("telegram");
  if (prefs.vkEnabled) channels.push("vk");
  if (prefs.discordEnabled) channels.push("discord");

  return { eligible: channels.length > 0, channels };
}

async function recordNotificationSent(input: {
  userId: string;
  materialId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<boolean> {
  try {
    await prisma.historyNewNotification.create({
      data: {
        userId: input.userId,
        materialId: input.materialId,
        seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber,
      },
    });
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

async function enqueueExternalDelivery(input: {
  userId: string;
  channel: NotificationChannelId;
  materialId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<void> {
  if (input.channel === "browser" || input.channel === "fcm") return;

  await prisma.notificationDelivery.create({
    data: {
      userId: input.userId,
      channel: input.channel,
      materialId: input.materialId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      status: "pending",
    },
  });
}

async function deliverToChannel(
  channel: NotificationChannelId,
  userId: string,
  payload: HistoryNewNotificationPayload,
): Promise<boolean> {
  switch (channel) {
    case "browser": {
      const result = await sendBrowserPushNotification(userId, payload);
      return result.sent > 0;
    }
    case "fcm": {
      const result = await sendFcmPushNotification(userId, payload);
      return result.sent > 0;
    }
    case "telegram":
    case "vk":
    case "discord":
      await enqueueExternalDelivery({
        userId,
        channel,
        materialId: payload.materialId,
        seasonNumber: payload.seasonNumber,
        episodeNumber: payload.episodeNumber,
      });
      return true;
    default:
      return false;
  }
}

export async function dispatchHistoryNewEpisodeRelease(input: {
  materialId: string;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<void> {
  const matches = await findHistoryNewMatchesForRelease(input);
  if (matches.length === 0) return;

  const key = historyNewEpisodeKey(input.materialId, input.seasonNumber, input.episodeNumber);

  for (const match of matches) {
    const { progress, payload } = match;

    const { eligible, channels } = await isUserEligibleForNotification(
      progress.userId,
      payload.translationName,
    );

    if (!eligible) continue;

    const recorded = await recordNotificationSent({
      userId: progress.userId,
      materialId: payload.materialId,
      seasonNumber: payload.seasonNumber,
      episodeNumber: payload.episodeNumber,
    });

    if (!recorded) continue;

    for (const channel of channels) {
      try {
        await deliverToChannel(channel, progress.userId, payload);
      } catch (error) {
        console.error("[notifications] channel delivery failed", {
          channel,
          userId: progress.userId,
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
