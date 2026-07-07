import { buildHistoryNewNotificationPayload } from "@/lib/notifications/payload";
import { prisma } from "@/lib/prisma";

export async function rebuildNotificationPayloadForDelivery(input: {
  userId: string;
  materialId: string;
  seasonNumber: number;
  episodeNumber: number;
}) {
  const [material, progress] = await Promise.all([
    prisma.kodikMaterial.findUnique({
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
    }),
    prisma.userWatchProgress.findFirst({
      where: { userId: input.userId, kodikId: input.materialId },
      select: {
        seasonNumber: true,
        episodeNumber: true,
      },
    }),
  ]);

  if (!material || !progress) return null;

  return await buildHistoryNewNotificationPayload({
    material,
    seasonNumber: input.seasonNumber,
    episodeNumber: input.episodeNumber,
    watchedSeasonNumber: progress.seasonNumber,
    watchedEpisodeNumber: progress.episodeNumber,
  });
}
