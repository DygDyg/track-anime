import { getTrackAnimeAndroidBridge, isTrackAnimeAndroidApp } from "@/lib/android-app";
import { coverCacheUrl } from "@/lib/poster";
import { isWatchHistoryBookmark } from "@/lib/watch-history";

const DEFAULT_EPISODE_SECONDS = 24 * 60;
const BULK_SYNC_LIMIT = 10;

export type AndroidWatchNextPublishInput = {
  shikimoriId: number;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  pageUrl?: string | null;
  description?: string | null;
};

function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch {
    return pathOrUrl;
  }
}

function bridgePublish(): ((json: string) => void) | null {
  if (!isTrackAnimeAndroidApp()) return null;
  const bridge = getTrackAnimeAndroidBridge();
  const fn = bridge?.publishWatchNext;
  if (fn == null) return null;
  return (json: string) => {
    try {
      (fn as (json: string) => void).call(bridge, json);
    } catch {
      /* ignore */
    }
  };
}

function bridgeRemove(): ((shikimoriId: number) => void) | null {
  if (!isTrackAnimeAndroidApp()) return null;
  const bridge = getTrackAnimeAndroidBridge();
  const fn = bridge?.removeWatchNext;
  if (fn == null) return null;
  return (shikimoriId: number) => {
    try {
      (fn as (shikimoriId: number) => void).call(bridge, shikimoriId);
    } catch {
      /* ignore */
    }
  };
}

function bridgeClear(): (() => void) | null {
  if (!isTrackAnimeAndroidApp()) return null;
  const bridge = getTrackAnimeAndroidBridge();
  const fn = bridge?.clearWatchNext;
  if (fn == null) return null;
  return () => {
    try {
      (fn as () => void).call(bridge);
    } catch {
      /* ignore */
    }
  };
}

/** Publish or update a Continue-watching tile (TV shell only; phone bridge no-ops). */
export function publishAndroidWatchNext(input: AndroidWatchNextPublishInput): void {
  if (isWatchHistoryBookmark(input)) return;
  if (input.shikimoriId <= 0 || !input.title.trim()) return;

  const publish = bridgePublish();
  if (!publish) return;

  const durationSeconds =
    input.durationSeconds != null && input.durationSeconds > 0
      ? input.durationSeconds
      : DEFAULT_EPISODE_SECONDS;

  const posterRaw = input.posterUrl?.trim() || coverCacheUrl(input.shikimoriId);
  const pageRaw = input.pageUrl?.trim() || `/anime/${input.shikimoriId}`;

  const payload = {
    shikimoriId: input.shikimoriId,
    title: input.title.trim(),
    description:
      input.description?.trim() ||
      `Сезон ${Math.max(1, input.seasonNumber)} · серия ${Math.max(0, input.episodeNumber)}`,
    posterUrl: absoluteUrl(posterRaw),
    pageUrl: absoluteUrl(pageRaw),
    seasonNumber: Math.max(1, input.seasonNumber),
    episodeNumber: Math.max(0, input.episodeNumber),
    positionSeconds: Math.max(0, input.positionSeconds),
    durationSeconds,
  };

  try {
    publish(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function removeAndroidWatchNext(shikimoriId: number): void {
  if (shikimoriId <= 0) return;
  const remove = bridgeRemove();
  if (!remove) return;
  remove(shikimoriId);
}

export function clearAndroidWatchNext(): void {
  const clear = bridgeClear();
  if (!clear) return;
  clear();
}

type WatchHistoryListItem = {
  shikimoriId: number;
  animeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  episodeDurationSeconds?: number;
  posterUrl?: string | null;
  isBookmark?: boolean;
};

let bulkSyncStarted = false;

/**
 * Once per page session: push recent watch-history into Watch Next (Android TV shell).
 * Safe to call when TV nav is on; no-ops outside the Android bridge.
 */
export function syncAndroidWatchNextFromHistory(): void {
  if (bulkSyncStarted) return;
  if (!bridgePublish()) return;
  bulkSyncStarted = true;

  void (async () => {
    try {
      const res = await fetch("/api/user/watch-history", { cache: "no-store" });
      if (!res.ok) {
        bulkSyncStarted = false;
        return;
      }
      const data = (await res.json()) as { items?: WatchHistoryListItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      let published = 0;
      for (const item of items) {
        if (published >= BULK_SYNC_LIMIT) break;
        if (!item || item.isBookmark) continue;
        if (isWatchHistoryBookmark(item)) continue;
        publishAndroidWatchNext({
          shikimoriId: item.shikimoriId,
          title: item.animeTitle,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.episodeDurationSeconds,
          posterUrl: item.posterUrl,
        });
        published += 1;
      }
    } catch {
      bulkSyncStarted = false;
    }
  })();
}
