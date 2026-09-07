import { isEpisodeNewer } from "@/lib/history-new-match";
import { buildHistoryNewNotificationPayload } from "@/lib/notifications/payload";
import { prisma } from "@/lib/prisma";
import { isWatchHistoryBookmark } from "@/lib/watch-history";

export async function rebuildNotificationPayloadForDelivery(input: {
  userId: string;
  materialId: string;
  seasonNumber: number;
  episodeNumber: number;
}) {
  const material = await prisma.kodikMaterial.findUnique({
    where: { kodikId: input.materialId },
    select: {
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
    },
  });

  if (!material) return null;

  const progress =
    material.shikimoriId != null
      ? await prisma.userWatchProgress.findUnique({
          where: {
            userId_shikimoriId: {
              userId: input.userId,
              shikimoriId: material.shikimoriId,
            },
          },
          select: {
            seasonNumber: true,
            episodeNumber: true,
            positionSeconds: true,
          },
        })
      : await prisma.userWatchProgress.findFirst({
          where: { userId: input.userId, kodikId: input.materialId },
          select: {
            seasonNumber: true,
            episodeNumber: true,
            positionSeconds: true,
          },
        });

  if (!progress) return null;

  // Уже догнали или прошли эту серию на любом устройстве — не доставлять повторно.
  if (
    !isWatchHistoryBookmark(progress) &&
    !isEpisodeNewer(
      progress.seasonNumber,
      progress.episodeNumber,
      input.seasonNumber,
      input.episodeNumber,
    )
  ) {
    return null;
  }

  return await buildHistoryNewNotificationPayload({
    material,
    seasonNumber: input.seasonNumber,
    episodeNumber: input.episodeNumber,
    watchedSeasonNumber: progress.seasonNumber,
    watchedEpisodeNumber: progress.episodeNumber,
  });
}
