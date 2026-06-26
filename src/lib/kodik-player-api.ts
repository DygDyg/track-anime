export type KodikCurrentEpisode = {
  episode: number | null;
  season: number | null;
  translation: {
    id: number;
    title: string;
  };
};

export type KodikPlayerEvent =
  | { key: "kodik_player_time_update"; value: number }
  | { key: "kodik_player_current_episode"; value: KodikCurrentEpisode }
  | { key: "kodik_player_video_ended"; value: undefined }
  | { key: "kodik_player_time"; value: number }
  | { key: string; value: unknown };

export type KodikPlayerCommand =
  | { method: "play" }
  | { method: "pause" }
  | { method: "seek"; seconds: number }
  | { method: "change_episode"; season?: number; episode: number };

export function isKodikPlayerMessage(data: unknown): data is KodikPlayerEvent {
  if (!data || typeof data !== "object") return false;
  return typeof (data as KodikPlayerEvent).key === "string";
}

export function sendKodikCommand(iframe: HTMLIFrameElement, command: KodikPlayerCommand): void {
  iframe.contentWindow?.postMessage({ key: "kodik_player_api", value: command }, "*");
}
