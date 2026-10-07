import "server-only";

import { prisma } from "@/lib/prisma";
import { formatWatchPosition } from "@/lib/watch-history";

export type AnimeWatchShareLogItemDto = {
  id: string;
  createdAt: string;
  userId: string | null;
  nickname: string;
  avatar: string | null;
  shikimoriId: number;
  animeTitle: string;
  player: "kodik" | "cvh";
  playerLabel: string;
  seasonNumber: number;
  episodeNumber: number;
  translationId: number | null;
  translationTitle: string | null;
  positionSeconds: number;
  positionLabel: string;
  nosave: boolean;
  shareUrl: string | null;
};

export type AnimeWatchShareLogDto = {
  items: AnimeWatchShareLogItemDto[];
};

export async function getAnimeWatchShareLogDto(limit = 50): Promise<AnimeWatchShareLogDto> {
  const take = Math.min(200, Math.max(1, limit));
  const rows = await prisma.animeWatchShareEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userId: row.userId,
      nickname: row.nickname,
      avatar: row.avatar,
      shikimoriId: row.shikimoriId,
      animeTitle: row.animeTitle,
      player: row.player === "cvh" ? "cvh" : "kodik",
      playerLabel: row.player === "cvh" ? "VideoHUB" : "TA",
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      translationId: row.translationId,
      translationTitle: row.translationTitle,
      positionSeconds: row.positionSeconds,
      positionLabel: formatWatchPosition(row.positionSeconds),
      nosave: row.nosave,
      shareUrl: row.shareUrl,
    })),
  };
}
