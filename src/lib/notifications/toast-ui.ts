import type { InAppNotificationItem } from "@/lib/notifications/in-app-feed";
import {
  formatHistoryNewNotificationBody,
  formatHistoryNewNotificationTitle,
} from "@/lib/notifications/payload";
import { DEFAULT_TEST_SHIKIMORI_ID } from "@/lib/notifications/types";

export const NOTIFICATION_TOAST_EVENT = "ta:notification-toast";
export const NOTIFICATION_TOAST_MS = 12_000;

export type NotificationToastKind = "history-new" | "digest";

export type NotificationToastItem = {
  id: string;
  kind: NotificationToastKind;
  title: string;
  body: string;
  url: string;
  posterUrl: string | null;
  shikimoriId?: number;
  animeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  translationName?: string;
};

function resolveToastPosterUrl(detail: InAppNotificationItem): string | null {
  if (detail.posterUrl?.trim()) {
    const url = detail.posterUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
      return url;
    }
  }
  if (detail.shikimoriId > 0) {
    return `/api/cover?id=${detail.shikimoriId}`;
  }
  return null;
}

export function toastItemFromNotification(detail: InAppNotificationItem): NotificationToastItem {
  return {
    id: `${detail.materialId}:${detail.seasonNumber}:${detail.episodeNumber}:${Date.now()}`,
    kind: "history-new",
    title: formatHistoryNewNotificationTitle(detail),
    body: formatHistoryNewNotificationBody(detail),
    url: detail.pageUrl,
    posterUrl: resolveToastPosterUrl(detail),
    shikimoriId: detail.shikimoriId,
    animeTitle: detail.animeTitle,
    seasonNumber: detail.seasonNumber,
    episodeNumber: detail.episodeNumber,
    translationName: detail.translationName,
  };
}

export function emitToast(item: NotificationToastItem): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_TOAST_EVENT, { detail: item }));
}

export function formatMoscowWeekdayTime(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
  }).format(now);
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${weekday} ${time}`;
}

export function formatTodayScheduleBody(count: number): string {
  if (count <= 0) return "";
  return `сегодня выйдет ${count} аниме`;
}

export function moscowDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function emitDigestToast(input: {
  title: string;
  body: string;
  url?: string;
}): void {
  emitToast({
    id: `digest:${Date.now()}`,
    kind: "digest",
    title: input.title,
    body: input.body,
    url: input.url ?? "/calendar",
    posterUrl: null,
  });
}

/** Rich sample payload for local UI checks (bubble / corner toast). */
export function buildTestNotificationItem(
  overrides: Partial<InAppNotificationItem> = {},
): InAppNotificationItem {
  const shikimoriId = overrides.shikimoriId ?? DEFAULT_TEST_SHIKIMORI_ID;
  return {
    id: `test-${Date.now()}`,
    materialId: "test-material",
    animeTitle: "Sousou no Frieren",
    seasonNumber: 1,
    episodeNumber: 12,
    translationName: "AniLibria",
    watchedSeasonNumber: 1,
    watchedEpisodeNumber: 11,
    duration: "28 мин.",
    releaseSeason: "осень 2023",
    rating: "9.0",
    ageRating: "PG-13",
    description: "После похорон своего учителя Фрирен отправляется в новое путешествие.",
    screenshot1: "",
    screenshot2: "",
    screenshot3: "",
    screenshot4: "",
    notifiedAt: new Date().toISOString(),
    ...overrides,
    shikimoriId,
    posterUrl: overrides.posterUrl ?? `/api/cover?id=${shikimoriId}`,
    pageUrl: overrides.pageUrl ?? `/anime/${shikimoriId}`,
  };
}

export function emitTestNotificationToast(
  overrides: Partial<InAppNotificationItem> = {},
): void {
  emitToast(toastItemFromNotification(buildTestNotificationItem(overrides)));
}

export function emitTestDigestToast(count = 5): void {
  emitDigestToast({
    title: formatMoscowWeekdayTime(),
    body: formatTodayScheduleBody(count),
  });
}
