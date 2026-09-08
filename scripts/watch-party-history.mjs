import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** @type {Map<string, string>} roomKey -> sessionId */
const roomSessionIds = new Map();
/** @type {Map<string, Promise<string | null>>} */
const roomSessionPromises = new Map();

async function resolveSessionId(roomKey) {
  const existing = roomSessionIds.get(roomKey);
  if (existing) return existing;
  const pending = roomSessionPromises.get(roomKey);
  if (!pending) return null;
  return pending;
}

function titleFromMaterial(material) {
  if (!material) return null;
  return material.title || material.otherTitle || material.titleOrig || null;
}

async function lookupMaterial(kodikId) {
  if (!kodikId) return { animeTitle: null, translationTitle: null };
  try {
    const material = await prisma.kodikMaterial.findUnique({
      where: { kodikId },
      select: { title: true, titleOrig: true, otherTitle: true, translationTitle: true },
    });
    return {
      animeTitle: titleFromMaterial(material),
      translationTitle: material?.translationTitle ?? null,
    };
  } catch (error) {
    console.warn("[watch-party-history] material lookup failed:", error);
    return { animeTitle: null, translationTitle: null };
  }
}

async function siteSettingsSnapshot() {
  try {
    const row = await prisma.watchPartySettings.findUnique({ where: { id: "default" } });
    return {
      siteAllowGuests: row?.allowGuests ?? true,
      siteEnabled: row?.enabled ?? true,
    };
  } catch {
    return { siteAllowGuests: true, siteEnabled: true };
  }
}

export async function closeOrphanWatchPartySessions() {
  try {
    const result = await prisma.watchPartySession.updateMany({
      where: { endedAt: null },
      data: { endedAt: new Date() },
    });
    if (result.count > 0) {
      console.log(`[watch-party-history] closed ${result.count} orphan session(s)`);
    }
  } catch (error) {
    console.warn("[watch-party-history] orphan close failed:", error);
  }
}

/**
 * @param {{
 *   roomKey: string,
 *   creator: { clientId: string, userId: string, nickname: string, avatar: string | null },
 *   state: { shikimoriId: number, kodikId: string, seasonNumber: number, episodeNumber: number },
 *   permissions: {
 *     allowParticipantControls: boolean,
 *     allowParticipantSeeking: boolean,
 *     allowParticipantEpisodeSelection: boolean,
 *     allowParticipantTranslationSelection: boolean,
 *     syncTranslations: boolean,
 *   },
 * }} input
 */
export async function recordWatchPartySessionCreated(input) {
  const createPromise = (async () => {
    try {
      const [titles, site] = await Promise.all([
        lookupMaterial(input.state.kodikId),
        siteSettingsSnapshot(),
      ]);

      const session = await prisma.watchPartySession.create({
        data: {
          roomKey: input.roomKey,
          creatorUserId: input.creator.userId,
          creatorNickname: input.creator.nickname,
          creatorAvatar: input.creator.avatar,
          shikimoriId: input.state.shikimoriId,
          kodikId: input.state.kodikId,
          animeTitle: titles.animeTitle,
          translationTitle: titles.translationTitle,
          seasonNumber: input.state.seasonNumber,
          episodeNumber: input.state.episodeNumber,
          allowParticipantControls: input.permissions.allowParticipantControls,
          allowParticipantSeeking: input.permissions.allowParticipantSeeking,
          allowParticipantEpisodeSelection: input.permissions.allowParticipantEpisodeSelection,
          allowParticipantTranslationSelection: input.permissions.allowParticipantTranslationSelection,
          syncTranslations: input.permissions.syncTranslations,
          siteAllowGuests: site.siteAllowGuests,
          siteEnabled: site.siteEnabled,
          maxParticipants: 1,
          participants: {
            create: {
              clientId: input.creator.clientId,
              userId: input.creator.userId,
              nickname: input.creator.nickname,
              avatar: input.creator.avatar,
              isCreator: true,
              wasMaster: true,
              joinedAt: new Date(),
            },
          },
        },
      });

      roomSessionIds.set(input.roomKey, session.id);
      return session.id;
    } catch (error) {
      console.warn("[watch-party-history] create failed:", error);
      return null;
    } finally {
      roomSessionPromises.delete(input.roomKey);
    }
  })();

  roomSessionPromises.set(input.roomKey, createPromise);
  return createPromise;
}

/**
 * @param {{
 *   roomKey: string,
 *   participant: { clientId: string, userId: string, nickname: string, avatar: string | null },
 *   isMaster: boolean,
 *   participantCount: number,
 * }} input
 */
export async function recordWatchPartyParticipantJoined(input) {
  const sessionId = await resolveSessionId(input.roomKey);
  if (!sessionId) return;

  try {
    await prisma.watchPartySessionParticipant.upsert({
      where: {
        sessionId_clientId: {
          sessionId,
          clientId: input.participant.clientId,
        },
      },
      create: {
        sessionId,
        clientId: input.participant.clientId,
        userId: input.participant.userId,
        nickname: input.participant.nickname,
        avatar: input.participant.avatar,
        isCreator: false,
        wasMaster: input.isMaster,
        joinedAt: new Date(),
      },
      update: {
        nickname: input.participant.nickname,
        avatar: input.participant.avatar,
        leftAt: null,
        ...(input.isMaster ? { wasMaster: true } : {}),
      },
    });

    const current = await prisma.watchPartySession.findUnique({
      where: { id: sessionId },
      select: { maxParticipants: true },
    });
    const nextMax = Math.max(current?.maxParticipants ?? 1, input.participantCount);
    await prisma.watchPartySession.update({
      where: { id: sessionId },
      data: { maxParticipants: nextMax },
    });
  } catch (error) {
    console.warn("[watch-party-history] join failed:", error);
  }
}

/**
 * @param {{ roomKey: string, clientId: string, nextMasterClientId?: string | null }} input
 */
export async function recordWatchPartyParticipantLeft(input) {
  const sessionId = await resolveSessionId(input.roomKey);
  if (!sessionId) return;

  try {
    await prisma.watchPartySessionParticipant.updateMany({
      where: { sessionId, clientId: input.clientId, leftAt: null },
      data: { leftAt: new Date() },
    });

    if (input.nextMasterClientId) {
      await prisma.watchPartySessionParticipant.updateMany({
        where: { sessionId, clientId: input.nextMasterClientId },
        data: { wasMaster: true },
      });
    }
  } catch (error) {
    console.warn("[watch-party-history] leave failed:", error);
  }
}

/**
 * @param {{
 *   roomKey: string,
 *   permissions: {
 *     allowParticipantControls: boolean,
 *     allowParticipantSeeking: boolean,
 *     allowParticipantEpisodeSelection: boolean,
 *     allowParticipantTranslationSelection: boolean,
 *     syncTranslations: boolean,
 *   },
 * }} input
 */
export async function recordWatchPartyPermissions(input) {
  const sessionId = await resolveSessionId(input.roomKey);
  if (!sessionId) return;

  try {
    await prisma.watchPartySession.update({
      where: { id: sessionId },
      data: {
        allowParticipantControls: input.permissions.allowParticipantControls,
        allowParticipantSeeking: input.permissions.allowParticipantSeeking,
        allowParticipantEpisodeSelection: input.permissions.allowParticipantEpisodeSelection,
        allowParticipantTranslationSelection: input.permissions.allowParticipantTranslationSelection,
        syncTranslations: input.permissions.syncTranslations,
      },
    });
  } catch (error) {
    console.warn("[watch-party-history] permissions failed:", error);
  }
}

/**
 * @param {{
 *   roomKey: string,
 *   state: { shikimoriId: number, kodikId: string, seasonNumber: number, episodeNumber: number },
 * }} input
 */
export async function recordWatchPartyPlayback(input) {
  const sessionId = await resolveSessionId(input.roomKey);
  if (!sessionId) return;

  try {
    const titles = await lookupMaterial(input.state.kodikId);
    await prisma.watchPartySession.update({
      where: { id: sessionId },
      data: {
        shikimoriId: input.state.shikimoriId,
        kodikId: input.state.kodikId,
        seasonNumber: input.state.seasonNumber,
        episodeNumber: input.state.episodeNumber,
        ...(titles.animeTitle ? { animeTitle: titles.animeTitle } : {}),
        ...(titles.translationTitle != null ? { translationTitle: titles.translationTitle } : {}),
      },
    });
  } catch (error) {
    console.warn("[watch-party-history] playback failed:", error);
  }
}

/**
 * @param {{ roomKey: string }} input
 */
export async function recordWatchPartySessionEnded(input) {
  const sessionId = await resolveSessionId(input.roomKey);
  if (!sessionId) return;

  try {
    const now = new Date();
    await prisma.watchPartySessionParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: now },
    });
    await prisma.watchPartySession.update({
      where: { id: sessionId },
      data: { endedAt: now },
    });
  } catch (error) {
    console.warn("[watch-party-history] end failed:", error);
  } finally {
    roomSessionIds.delete(input.roomKey);
  }
}

export async function disconnectWatchPartyHistory() {
  await prisma.$disconnect().catch(() => undefined);
}
