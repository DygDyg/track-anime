export type WatchPartyParticipant = {
  id: string;
  userId: string;
  nickname: string;
  avatar: string | null;
  isMaster: boolean;
};

export type WatchPartyPlaybackState = {
  shikimoriId: number;
  kodikId: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  isPlaying: boolean;
  updatedAt: number;
};

export type WatchPartyCommand =
  | { type: "play"; state: WatchPartyPlaybackState }
  | { type: "pause"; state: WatchPartyPlaybackState }
  | { type: "seek"; state: WatchPartyPlaybackState }
  | { type: "episode"; state: WatchPartyPlaybackState }
  | { type: "translation"; state: WatchPartyPlaybackState }
  | { type: "state-sync"; state: WatchPartyPlaybackState };

export type WatchPartyClientMessage =
  | {
      type: "join";
      roomId: string | null;
      participant: {
        userId: string;
        nickname: string;
        avatar: string | null;
      };
      state: WatchPartyPlaybackState;
    }
  | { type: "leave" }
  | {
      type: "set-permissions";
      allowParticipantControls: boolean;
      allowParticipantSeeking: boolean;
    }
  | WatchPartyCommand;

export type WatchPartyServerMessage =
  | {
      type: "room-state";
      roomId: string;
      participantId: string;
      masterParticipantId: string;
      allowParticipantControls: boolean;
      allowParticipantSeeking: boolean;
      participants: WatchPartyParticipant[];
      state: WatchPartyPlaybackState;
    }
  | { type: "command"; fromParticipantId: string; command: WatchPartyCommand }
  | { type: "error"; message: string };
