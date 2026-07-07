import { getShikimoriAnime } from "@/lib/shikimori/animes";
import type { ShikimoriVideo } from "@/lib/shikimori/types";

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:embed\/|watch\?v=|v\/|shorts\/)|youtu\.be\/|img\.youtube\.com\/vi\/)([a-zA-Z0-9_-]{11})/;

function isYoutubeVideo(video: ShikimoriVideo): boolean {
  if (video.hosting?.toLowerCase() === "youtube") return true;
  return [video.player_url, video.url, video.image_url].some((value) =>
    /youtube|youtu\.be/i.test(value ?? ""),
  );
}

export function extractYoutubeVideoId(video: ShikimoriVideo): string | null {
  if (!isYoutubeVideo(video)) return null;

  for (const candidate of [video.player_url, video.url, video.image_url]) {
    if (!candidate) continue;
    const match = candidate.match(YOUTUBE_ID_RE);
    if (match) return match[1];
  }

  return null;
}

function trailerRank(video: ShikimoriVideo): number {
  if (!extractYoutubeVideoId(video)) return 100;
  const kind = video.kind?.toLowerCase() ?? "";
  if (kind === "pv" || kind === "promo") return 0;
  if (kind === "op" || kind === "ed") return 2;
  return 1;
}

export function pickYoutubeTrailerId(videos: ShikimoriVideo[] | null | undefined): string | null {
  if (!videos?.length) return null;

  const ranked = [...videos].sort((a, b) => trailerRank(a) - trailerRank(b));
  for (const video of ranked) {
    const id = extractYoutubeVideoId(video);
    if (id) return id;
  }

  return null;
}

export async function getYoutubeTrailerId(shikimoriId: number): Promise<string | null> {
  const anime = await getShikimoriAnime(shikimoriId);
  return pickYoutubeTrailerId(anime?.videos);
}

export function youtubeTrailerEmbedUrl(
  youtubeId: string,
  options: { muted?: boolean; origin?: string; controls?: boolean } = {},
): string {
  const muted = options.muted !== false;
  const showControls = options.controls === true;
  const params = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    controls: showControls ? "1" : "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    loop: "0",
    enablejsapi: "1",
    disablekb: showControls ? "0" : "1",
    fs: showControls ? "1" : "0",
    iv_load_policy: "3",
    cc_load_policy: "0",
  });

  if (options.origin) {
    params.set("origin", options.origin);
  }

  return `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
}

export function sendYoutubePlayerCommand(
  iframe: HTMLIFrameElement,
  func: string,
  args: unknown[] = [],
): void {
  iframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

export const YOUTUBE_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

const YOUTUBE_EMBED_ORIGIN_RE = /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com)$/;

export function isYoutubeEmbedOrigin(origin: string): boolean {
  return YOUTUBE_EMBED_ORIGIN_RE.test(origin);
}

export function parseYoutubePlayerMessage(data: unknown): { event: string; info?: unknown } | null {
  let parsed: unknown = data;

  if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  if (typeof record.event !== "string") return null;

  return { event: record.event, info: record.info };
}

function normalizeYoutubePlayerState(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isYoutubePlaybackStartedMessage(message: { event: string; info?: unknown }): boolean {
  if (message.event === "onStateChange") {
    const state = normalizeYoutubePlayerState(message.info);
    return (
      state === YOUTUBE_PLAYER_STATE.PLAYING || state === YOUTUBE_PLAYER_STATE.BUFFERING
    );
  }

  if (message.event === "infoDelivery" && message.info && typeof message.info === "object") {
    const playerState = normalizeYoutubePlayerState(
      (message.info as Record<string, unknown>).playerState,
    );
    return (
      playerState === YOUTUBE_PLAYER_STATE.PLAYING ||
      playerState === YOUTUBE_PLAYER_STATE.BUFFERING
    );
  }

  return false;
}

export function isYoutubePlaybackEndedMessage(message: { event: string; info?: unknown }): boolean {
  if (message.event === "onStateChange") {
    return normalizeYoutubePlayerState(message.info) === YOUTUBE_PLAYER_STATE.ENDED;
  }

  if (message.event === "infoDelivery" && message.info && typeof message.info === "object") {
    const playerState = normalizeYoutubePlayerState(
      (message.info as Record<string, unknown>).playerState,
    );
    return playerState === YOUTUBE_PLAYER_STATE.ENDED;
  }

  return false;
}

function readYoutubePlayerState(message: { event: string; info?: unknown }): number | null {
  if (message.event === "onStateChange") {
    return normalizeYoutubePlayerState(message.info);
  }

  if (message.event === "infoDelivery" && message.info && typeof message.info === "object") {
    return normalizeYoutubePlayerState((message.info as Record<string, unknown>).playerState);
  }

  return null;
}

export function isYoutubePlaybackPausedMessage(message: { event: string; info?: unknown }): boolean {
  return readYoutubePlayerState(message) === YOUTUBE_PLAYER_STATE.PAUSED;
}

export type YoutubePlayerEventHandlers = {
  onPlaying?: () => void;
  onPaused?: () => void;
  onEnded?: () => void;
};

export function subscribeYoutubePlayerEvents(handlers: YoutubePlayerEventHandlers): () => void {
  const handler = (event: MessageEvent) => {
    if (!isYoutubeEmbedOrigin(event.origin)) return;

    const message = parseYoutubePlayerMessage(event.data);
    if (!message) return;

    if (handlers.onPlaying && isYoutubePlaybackStartedMessage(message)) {
      handlers.onPlaying();
    }

    if (handlers.onPaused && isYoutubePlaybackPausedMessage(message)) {
      handlers.onPaused();
    }

    if (handlers.onEnded && isYoutubePlaybackEndedMessage(message)) {
      handlers.onEnded();
    }
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export function startYoutubePlayerListening(iframe: HTMLIFrameElement): void {
  const payload = JSON.stringify({
    event: "listening",
    id: iframe.id || undefined,
  });

  iframe.contentWindow?.postMessage(payload, "*");
}

export function subscribeYoutubePlayerPlaying(onPlaying: () => void): () => void {
  return subscribeYoutubePlayerEvents({ onPlaying });
}
