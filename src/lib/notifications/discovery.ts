export const NOTIFICATIONS_TAB_SEEN_KEY = "ta:notifications-tab-seen";
export const NOTIFICATIONS_CTA_DISMISSED_KEY = "ta:notifications-cta-dismissed";
export const NOTIFICATIONS_DISCOVERY_CHANGED_EVENT = "ta:notifications-discovery-changed";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export function readNotificationsTabSeen(): boolean {
  return readFlag(NOTIFICATIONS_TAB_SEEN_KEY);
}

export function writeNotificationsTabSeen(): void {
  writeFlag(NOTIFICATIONS_TAB_SEEN_KEY);
  emitNotificationsDiscoveryChanged();
}

export function readNotificationsCtaDismissed(): boolean {
  return readFlag(NOTIFICATIONS_CTA_DISMISSED_KEY);
}

export function writeNotificationsCtaDismissed(): void {
  writeFlag(NOTIFICATIONS_CTA_DISMISSED_KEY);
  emitNotificationsDiscoveryChanged();
}

export function emitNotificationsDiscoveryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_DISCOVERY_CHANGED_EVENT));
}
