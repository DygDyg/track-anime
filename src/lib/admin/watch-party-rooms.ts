import { prisma } from "@/lib/prisma";

export type WatchPartyRoomParticipantDto = {
  id: string;
  userId: string;
  nickname: string;
  avatar: string | null;
  isMaster: boolean;
  state: WatchPartyRoomStateDto | null;
  animeTitle: string | null;
  translationTitle: string | null;
};

export type WatchPartyRoomStateDto = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  isPlaying: boolean;
  updatedAt: number;
};

export type WatchPartyRoomDto = {
  id: string;
  masterParticipantId: string;
  participantCount: number;
  state: WatchPartyRoomStateDto;
  animeTitle: string | null;
  translationTitle: string | null;
  participants: WatchPartyRoomParticipantDto[];
};

export type WatchPartyRoomsDto = {
  rooms: WatchPartyRoomDto[];
  unavailable: boolean;
  error: string | null;
};

type RawWatchPartyRoom = {
  id?: unknown;
  masterParticipantId?: unknown;
  state?: unknown;
  participants?: unknown;
};

type RawWatchPartyParticipant = {
  id?: unknown;
  userId?: unknown;
  nickname?: unknown;
  avatar?: unknown;
  isMaster?: unknown;
  state?: unknown;
};

type RawRoomsResponse = {
  rooms?: unknown;
};

function deriveRoomsUrlFromPublicWsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = url.pathname.replace(/\/watch-party-ws\/?$/, "/watch-party-rooms");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function watchPartyRoomUrls(): string[] {
  const urls = new Set<string>();
  const configured = process.env.WATCH_PARTY_ROOMS_URL;
  if (configured) urls.add(configured);

  const port = process.env.WATCH_PARTY_PORT ?? "3001";
  urls.add(`http://127.0.0.1:${port}/watch-party-rooms`);

  if (port !== "3001") {
    urls.add("http://127.0.0.1:3001/watch-party-rooms");
  }

  if (port !== "3002") {
    urls.add("http://127.0.0.1:3002/watch-party-rooms");
  }

  const fromPublicWs = deriveRoomsUrlFromPublicWsUrl(process.env.NEXT_PUBLIC_WATCH_PARTY_WS_URL);
  if (fromPublicWs) urls.add(fromPublicWs);

  return [...urls];
}

function normalizeState(value: unknown): WatchPartyRoomStateDto | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const shikimoriId = Number(input.shikimoriId);
  const seasonNumber = Number(input.seasonNumber);
  const episodeNumber = Number(input.episodeNumber);
  const positionSeconds = Number(input.positionSeconds);
  const updatedAt = Number(input.updatedAt);
  const kodikId = typeof input.kodikId === "string" ? input.kodikId : "";

  if (
    !Number.isInteger(shikimoriId) ||
    shikimoriId <= 0 ||
    !kodikId ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber) ||
    !Number.isFinite(positionSeconds)
  ) {
    return null;
  }

  return {
    shikimoriId,
    kodikId,
    seasonNumber,
    episodeNumber,
    positionSeconds: Math.max(0, positionSeconds),
    isPlaying: input.isPlaying === true,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

function normalizeParticipant(value: unknown): RawWatchPartyParticipant | null {
  if (!value || typeof value !== "object") return null;
  return value as RawWatchPartyParticipant;
}

function normalizeRoom(value: unknown): RawWatchPartyRoom | null {
  if (!value || typeof value !== "object") return null;
  return value as RawWatchPartyRoom;
}

function titleFromMaterial(material: {
  title: string;
  titleOrig: string | null;
  otherTitle: string | null;
}): string {
  return material.title || material.otherTitle || material.titleOrig || "Без названия";
}

function formatFetchError(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось получить список комнат";
}

export async function getWatchPartyRoomsDto(): Promise<WatchPartyRoomsDto> {
  const errors: string[] = [];

  for (const url of watchPartyRoomUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as RawRoomsResponse;
      return enrichRawRooms(data);
    } catch (error) {
      errors.push(`${url}: ${formatFetchError(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    rooms: [],
    unavailable: true,
    error: errors.join("; ") || "Не удалось получить список комнат",
  };
}

async function enrichRawRooms(data: RawRoomsResponse): Promise<WatchPartyRoomsDto> {
  const rawRooms = Array.isArray(data.rooms) ? data.rooms : [];
  const rooms = rawRooms
    .map(normalizeRoom)
    .filter((room): room is RawWatchPartyRoom => room != null)
    .map((room) => {
      const state = normalizeState(room.state);
      if (!state) return null;

      const participants = Array.isArray(room.participants)
        ? room.participants
            .map(normalizeParticipant)
            .filter((participant): participant is RawWatchPartyParticipant => participant != null)
        : [];

      return {
        id: typeof room.id === "string" ? room.id : "",
        masterParticipantId:
          typeof room.masterParticipantId === "string" ? room.masterParticipantId : "",
        state,
        participants,
      };
    })
    .filter((room): room is NonNullable<typeof room> => room != null && room.id !== "");

  const kodikIds = new Set<string>();
  for (const room of rooms) {
    kodikIds.add(room.state.kodikId);
    for (const participant of room.participants) {
      const state = normalizeState(participant.state);
      if (state) kodikIds.add(state.kodikId);
    }
  }

  const materials = await prisma.kodikMaterial.findMany({
    where: { kodikId: { in: [...kodikIds] } },
    select: {
      kodikId: true,
      title: true,
      titleOrig: true,
      otherTitle: true,
      translationTitle: true,
    },
  });
  const materialByKodikId = new Map(materials.map((material) => [material.kodikId, material]));

  return {
    unavailable: false,
    error: null,
    rooms: rooms.map((room) => {
      const roomMaterial = materialByKodikId.get(room.state.kodikId);
      const participants = room.participants.map((participant) => {
        const state = normalizeState(participant.state);
        const material = state ? materialByKodikId.get(state.kodikId) : null;
        return {
          id: typeof participant.id === "string" ? participant.id : "",
          userId: typeof participant.userId === "string" ? participant.userId : "",
          nickname: typeof participant.nickname === "string" ? participant.nickname : "Участник",
          avatar: typeof participant.avatar === "string" ? participant.avatar : null,
          isMaster:
            participant.isMaster === true ||
            (typeof participant.id === "string" &&
              participant.id === room.masterParticipantId),
          state,
          animeTitle: material ? titleFromMaterial(material) : null,
          translationTitle: material?.translationTitle ?? null,
        };
      });

      return {
        id: room.id,
        masterParticipantId: room.masterParticipantId,
        participantCount: participants.length,
        state: room.state,
        animeTitle: roomMaterial ? titleFromMaterial(roomMaterial) : null,
        translationTitle: roomMaterial?.translationTitle ?? null,
        participants,
      };
    }),
  };
}
