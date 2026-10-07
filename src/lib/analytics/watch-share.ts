import "server-only";

import { prisma } from "@/lib/prisma";
import type { AnimeWatchPlayerParam } from "@/lib/anime-watch-share";

export type RecordAnimeWatchShareInput = {
  userId: string | null;
  nickname: string;
  avatar: string | null;
  shikimoriId: number;
  animeTitle: string;
  player: AnimeWatchPlayerParam;
  seasonNumber: number;
  episodeNumber: number;
  translationId: number | null;
  translationTitle: string | null;
  positionSeconds: number;
  nosave: boolean;
  shareUrl: string | null;
};

export async function recordAnimeWatchShareEvent(
  input: RecordAnimeWatchShareInput,
): Promise<{ id: string }> {
  const row = await prisma.animeWatchShareEvent.create({
    data: {
      userId: input.userId,
      nickname: input.nickname.slice(0, 120) || "Гость",
      avatar: input.avatar?.slice(0, 500) ?? null,
      shikimoriId: input.shikimoriId,
      animeTitle: input.animeTitle.slice(0, 300) || `Shikimori ${input.shikimoriId}`,
      player: input.player === "cvh" ? "cvh" : "kodik",
      seasonNumber: Math.trunc(input.seasonNumber),
      episodeNumber: Math.trunc(input.episodeNumber),
      translationId: input.translationId,
      translationTitle: input.translationTitle?.slice(0, 200) ?? null,
      positionSeconds: Math.max(0, input.positionSeconds),
      nosave: input.nosave,
      shareUrl: input.shareUrl?.slice(0, 2000) ?? null,
    },
    select: { id: true },
  });
  return row;
}
