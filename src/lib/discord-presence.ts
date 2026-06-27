export type DiscordPresencePayload = {
  active: boolean;
  applicationId?: string | null;
  largeImageKey?: string | null;
  animeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  positionSeconds?: number;
  paused?: boolean;
  /** browse = раздел сайта без просмотра */
  mode?: "watch" | "browse";
  sitePageLabel?: string;
  pageUrl?: string;
  openButtonEnabled?: boolean;
};

export function getDiscordBridgeUrl(): string {
  return process.env.NEXT_PUBLIC_DISCORD_RPC_BRIDGE_URL ?? "http://127.0.0.1:6738";
}

export function formatDiscordEpisodeState(
  episodeNumber: number,
  paused: boolean,
  sitePageLabel?: string | null,
): string {
  const icon = paused ? "⏸" : "▶";
  let state = `Серия: ${episodeNumber} | ${icon}`;
  if (sitePageLabel) {
    state = `${state} · ${sitePageLabel}`;
  }
  return state.slice(0, 128);
}

export function formatDiscordBrowseState(sitePageLabel: string): string {
  return `На сайте: ${sitePageLabel}`.slice(0, 128);
}

export async function pingDiscordBridge(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const res = await fetch(`${getDiscordBridgeUrl()}/health`, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendDiscordPresence(payload: DiscordPresencePayload): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const res = await fetch(`${getDiscordBridgeUrl()}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearDiscordPresence(input?: {
  applicationId?: string | null;
  largeImageKey?: string | null;
}): Promise<void> {
  if (!input?.applicationId) return;
  await sendDiscordPresence({
    active: false,
    applicationId: input.applicationId,
    largeImageKey: input.largeImageKey,
  });
}
