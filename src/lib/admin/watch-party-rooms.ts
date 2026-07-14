import "server-only";

import { prisma } from "@/lib/prisma";

export type WatchPartyRoomPlaybackStateDto = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  isPlaying: boolean;
  updatedAt: number;
  title: string | null;
  translationTitle: string | null;
};

export type WatchPartyRoomParticipantDto = {
  id: string;
  userId: string;
  nickname: string;
  avatar: string | null;
  isMaster: boolean;
  state?: WatchPartyRoomPlaybackStateDto;
};

export type WatchPartyRoomDto = {
  id: string;
  createdAt: string;
  masterParticipantId: string;
  allowParticipantControls: boolean;
  allowParticipantSeeking: boolean;
  allowParticipantEpisodeSelection: boolean;
  allowParticipantTranslationSelection: boolean;
  syncTranslations: boolean;
  state: WatchPartyRoomPlaybackStateDto;
  participants: WatchPartyRoomParticipantDto[];
};

export type WatchPartyRoomsDto = {
  generatedAt: string | null;
  rooms: WatchPartyRoomDto[];
  error: string | null;
};

type RawPlaybackState = Omit<WatchPartyRoomPlaybackStateDto, "title" | "translationTitle">;

type RawParticipant = Omit<WatchPartyRoomParticipantDto, "state"> & {
  state?: RawPlaybackState;
};

type RawRoom = Omit<WatchPartyRoomDto, "state" | "participants"> & {
  state: RawPlaybackState;
  participants: RawParticipant[];
};

type RawRoomsResponse = {
  generatedAt?: string;
  rooms?: RawRoom[];
  error?: string;
};

function getWatchPartyRoomsUrls(): string[] {
  const configured = process.env.WATCH_PARTY_ROOMS_URL ?? process.env.WATCH_PARTY_INTERNAL_URL;
  if (configured) return [configured];

  const ports = [process.env.WATCH_PARTY_PORT ?? "3002", "3002", "3001"];
  return [...new Set(ports)].map((port) => `http://127.0.0.1:${port}/watch-party-rooms`);
}

async function fetchRoomsSnapshot(): Promise<RawRoomsResponse> {
  let lastError = "Не удалось получить список комнат";

  for (const url of getWatchPartyRoomsUrls()) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2_500);

    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `${url}: HTTP ${res.status}`;
        continue;
      }
      return (await res.json()) as RawRoomsResponse;
    } catch (error) {
      lastError = error instanceof Error ? `${url}: ${error.message}` : `${url}: ошибка сети`;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    rooms: [],
    error: lastError,
  };
}

export async function getWatchPartyRoomsDto(): Promise<WatchPartyRoomsDto> {
  const snapshot = await fetchRoomsSnapshot();
  const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
  const kodikIds = new Set<string>();

  for (const room of rooms) {
    if (room.state?.kodikId) kodikIds.add(room.state.kodikId);
    for (const participant of room.participants ?? []) {
      if (participant.state?.kodikId) kodikIds.add(participant.state.kodikId);
    }
  }

  const materials =
    kodikIds.size > 0
      ? await prisma.kodikMaterial.findMany({
          where: { kodikId: { in: [...kodikIds] } },
          select: {
            kodikId: true,
            title: true,
            translationTitle: true,
          },
        })
      : [];
  const materialByKodikId = new Map(materials.map((material) => [material.kodikId, material]));

  function enrichState(state: RawPlaybackState): WatchPartyRoomPlaybackStateDto {
    const material = materialByKodikId.get(state.kodikId);
    return {
      ...state,
      title: material?.title ?? null,
      translationTitle: material?.translationTitle ?? null,
    };
  }

  return {
    generatedAt: snapshot.generatedAt ?? null,
    error: snapshot.error ?? null,
    rooms: rooms.map((room) => ({
      ...room,
      state: enrichState(room.state),
      participants: room.participants.map((participant) => ({
        ...participant,
        state: participant.state ? enrichState(participant.state) : undefined,
      })),
    })),
  };
}
