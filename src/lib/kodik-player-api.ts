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
  | { method: "change_episode"; season?: number; episode: number }
  | { method: "volume"; volume: number }
  | { method: "mute" }
  | { method: "unmute" }
  | { method: "get_time" };

export function isKodikPlayerMessage(data: unknown): data is KodikPlayerEvent {
  if (!data || typeof data !== "object") return false;
  return typeof (data as KodikPlayerEvent).key === "string";
}

export function sendKodikCommand(iframe: HTMLIFrameElement, command: KodikPlayerCommand): void {
  iframe.contentWindow?.postMessage({ key: "kodik_player_api", value: command }, "*");
}

const KODIK_DEBUG_STORAGE_KEY = "ta:kodik-debug";

/**
 * Kodik postMessage debug — только `next dev` / NODE_ENV=development.
 * В production-сборке (retail deploy) всегда выключен, даже с localStorage / ?kodikDebug=1.
 * Dev enable: localStorage.setItem('ta:kodik-debug','1') or ?kodikDebug=1
 */
export function isKodikPlayerDebugEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(KODIK_DEBUG_STORAGE_KEY) === "1") return true;
  } catch {
    /* private mode */
  }
  try {
    return new URLSearchParams(window.location.search).get("kodikDebug") === "1";
  } catch {
    return false;
  }
}

/** Logs Kodik postMessage traffic when debug is on. Skips spammy time_update by default. */
export function logKodikPlayerDebugMessage(data: unknown, source = "message"): void {
  if (!isKodikPlayerDebugEnabled()) return;
  if (!data || typeof data !== "object") return;
  const key = (data as { key?: unknown }).key;
  if (typeof key !== "string") return;
  if (!key.startsWith("kodik_")) return;
  if (key === "kodik_player_time_update") return;
  console.log(`[kodik-debug:${source}]`, key, (data as { value?: unknown }).value);
}
