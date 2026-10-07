"use client";

import { collectAnalyticsClientHints } from "@/lib/analytics/client-hints";
import type { AnalyticsPlayerKind } from "@/lib/analytics/ua";

const lastPlayByKey = new Map<string, number>();
const CLIENT_PLAY_THROTTLE_MS = 60 * 60 * 1000;
const PLAY_THROTTLE_STORAGE_PREFIX = "ta.play.";

function playThrottleKey(shikimoriId: number, player: AnalyticsPlayerKind): string {
  return `${player}:${shikimoriId}`;
}

function readStoredPlayAt(shikimoriId: number, player: AnalyticsPlayerKind): number {
  try {
    const raw = sessionStorage.getItem(
      `${PLAY_THROTTLE_STORAGE_PREFIX}${playThrottleKey(shikimoriId, player)}`,
    );
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredPlayAt(shikimoriId: number, player: AnalyticsPlayerKind, at: number): void {
  try {
    sessionStorage.setItem(
      `${PLAY_THROTTLE_STORAGE_PREFIX}${playThrottleKey(shikimoriId, player)}`,
      String(at),
    );
  } catch {
    // private mode / quota — in-memory map still works
  }
}

/** Сообщить админ-аналитике о реальном старте воспроизведения. */
export function reportAnimePlay(
  shikimoriId: number,
  player: AnalyticsPlayerKind = "kodik",
): void {
  if (!Number.isInteger(shikimoriId) || shikimoriId <= 0) return;
  if (typeof window === "undefined") return;

  const kind: AnalyticsPlayerKind = player === "cvh" ? "cvh" : "kodik";
  const key = playThrottleKey(shikimoriId, kind);
  const now = Date.now();
  const prev = Math.max(lastPlayByKey.get(key) ?? 0, readStoredPlayAt(shikimoriId, kind));
  if (now - prev < CLIENT_PLAY_THROTTLE_MS) return;
  lastPlayByKey.set(key, now);
  writeStoredPlayAt(shikimoriId, kind, now);

  void (async () => {
    const hints = await collectAnalyticsClientHints();
    await fetch("/api/analytics/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shikimoriId,
        player: kind,
        ...hints,
      }),
      credentials: "same-origin",
      keepalive: true,
    });
  })().catch(() => undefined);
}

export type ReportAnimeWatchShareInput = {
  shikimoriId: number;
  animeTitle: string;
  player: AnalyticsPlayerKind | "kodik" | "cvh";
  seasonNumber: number;
  episodeNumber: number;
  translationId?: number | null;
  translationTitle?: string | null;
  positionSeconds?: number | null;
  nosave?: boolean;
  shareUrl: string;
};

/** Лог копирования deep-link ссылки на серию (кнопка-цепочка). */
export function reportAnimeWatchShare(input: ReportAnimeWatchShareInput): void {
  if (!Number.isInteger(input.shikimoriId) || input.shikimoriId <= 0) return;
  if (typeof window === "undefined") return;

  const player = input.player === "cvh" ? "cvh" : "kodik";
  void fetch("/api/analytics/watch-share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shikimoriId: input.shikimoriId,
      animeTitle: input.animeTitle,
      player,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      translationId: input.translationId ?? null,
      translationTitle: input.translationTitle ?? null,
      positionSeconds: input.positionSeconds ?? 0,
      nosave: input.nosave !== false,
      shareUrl: input.shareUrl,
    }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}
