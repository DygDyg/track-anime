import type { InAppNotificationItem } from "@/lib/notifications/in-app-feed";
import {
  formatHistoryNewNotificationBody,
  formatHistoryNewNotificationTitle,
} from "@/lib/notifications/payload";

export const IN_APP_NOTIFY_SINCE_KEY = "track-anime-in-app-notify-since";
export const IN_APP_NOTIFY_PREFS_EVENT = "ta:notifications-prefs-changed";

export const IN_APP_POLL_INTERVAL_MS = 30_000;

export function readInAppNotifySince(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(IN_APP_NOTIFY_SINCE_KEY);
  } catch {
    return null;
  }
}

export function writeInAppNotifySince(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IN_APP_NOTIFY_SINCE_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function initInAppNotifySince(): string {
  const existing = readInAppNotifySince();
  if (existing) return existing;

  const now = new Date().toISOString();
  writeInAppNotifySince(now);
  return now;
}

export function notificationTag(item: Pick<InAppNotificationItem, "materialId" | "seasonNumber" | "episodeNumber">): string {
  return `history-new:${item.materialId}:${item.seasonNumber}:${item.episodeNumber}`;
}

function resolveClientPosterUrl(item: InAppNotificationItem): string {
  if (item.posterUrl) {
    const url = item.posterUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url.replace(/^http:\/\//i, "https://");
    }
    if (url.startsWith("/")) return `${window.location.origin}${url}`;
    return url;
  }

  return `${window.location.origin}/api/cover?id=${item.shikimoriId}`;
}

export function showInAppBrowserNotification(item: InAppNotificationItem): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const posterUrl = resolveClientPosterUrl(item);
  const tag = notificationTag(item);
  const notification = new Notification(formatHistoryNewNotificationTitle(item), {
    body: formatHistoryNewNotificationBody(item),
    icon: posterUrl,
    image: posterUrl,
    tag,
    data: { url: item.pageUrl },
  } as NotificationOptions & { image?: string });

  notification.onclick = () => {
    window.focus();
    notification.close();
    window.location.assign(item.pageUrl);
  };

  return true;
}

export function resetInAppNotifySince(): void {
  writeInAppNotifySince(new Date().toISOString());
}

export function emitNotificationToast(item: InAppNotificationItem): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ta:notification-toast", { detail: item }));
}

export function emitNotificationsPrefsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(IN_APP_NOTIFY_PREFS_EVENT));
}
