import "server-only";

import { prisma } from "@/lib/prisma";

export type WatchPartyHistoryParticipantDto = {
  userId: string;
  nickname: string;
  avatar: string | null;
  isCreator: boolean;
  wasMaster: boolean;
  joinedAt: string;
  leftAt: string | null;
};

export type WatchPartyHistorySessionDto = {
  id: string;
  roomKey: string;
  createdAt: string;
  endedAt: string | null;
  active: boolean;
  creatorUserId: string | null;
  creatorNickname: string;
  creatorAvatar: string | null;
  shikimoriId: number;
  kodikId: string;
  animeTitle: string | null;
  translationTitle: string | null;
  seasonNumber: number;
  episodeNumber: number;
  allowParticipantControls: boolean;
  allowParticipantSeeking: boolean;
  allowParticipantEpisodeSelection: boolean;
  allowParticipantTranslationSelection: boolean;
  syncTranslations: boolean;
  siteAllowGuests: boolean;
  siteEnabled: boolean;
  maxParticipants: number;
  participants: WatchPartyHistoryParticipantDto[];
};

export type WatchPartyHistoryDto = {
  sessions: WatchPartyHistorySessionDto[];
};

export async function getWatchPartyHistoryDto(limit = 50): Promise<WatchPartyHistoryDto> {
  const rows = await prisma.watchPartySession.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
    include: {
      participants: {
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  return {
    sessions: rows.map((row) => ({
      id: row.id,
      roomKey: row.roomKey,
      createdAt: row.createdAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      active: row.endedAt == null,
      creatorUserId: row.creatorUserId,
      creatorNickname: row.creatorNickname,
      creatorAvatar: row.creatorAvatar,
      shikimoriId: row.shikimoriId,
      kodikId: row.kodikId,
      animeTitle: row.animeTitle,
      translationTitle: row.translationTitle,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      allowParticipantControls: row.allowParticipantControls,
      allowParticipantSeeking: row.allowParticipantSeeking,
      allowParticipantEpisodeSelection: row.allowParticipantEpisodeSelection,
      allowParticipantTranslationSelection: row.allowParticipantTranslationSelection,
      syncTranslations: row.syncTranslations,
      siteAllowGuests: row.siteAllowGuests,
      siteEnabled: row.siteEnabled,
      maxParticipants: row.maxParticipants,
      participants: row.participants.map((p) => ({
        userId: p.userId,
        nickname: p.nickname,
        avatar: p.avatar,
        isCreator: p.isCreator,
        wasMaster: p.wasMaster,
        joinedAt: p.joinedAt.toISOString(),
        leftAt: p.leftAt?.toISOString() ?? null,
      })),
    })),
  };
}
