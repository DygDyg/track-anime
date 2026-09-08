"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { InAppNotificationItem } from "@/lib/notifications/in-app-feed";
import {
  IN_APP_NOTIFY_PREFS_EVENT,
  IN_APP_POLL_INTERVAL_MS,
  emitNotificationToast,
  initInAppNotifySince,
  readInAppNotifySince,
  showInAppBrowserNotification,
  writeInAppNotifySince,
} from "@/lib/notifications/in-app-client";
import { ensureBackgroundPushSubscription, hasActivePushSubscription } from "@/lib/notifications/browser-client";
import {
  ensureAndroidFcmSubscription,
  hasActiveAndroidFcmSubscription,
} from "@/lib/notifications/fcm-client";

type InAppResponse = {
  enabled: boolean;
  items: InAppNotificationItem[];
  latestAt: string | null;
};

const shownTags = new Set<string>();

function markShown(item: InAppNotificationItem): void {
  shownTags.add(`${item.materialId}:${item.seasonNumber}:${item.episodeNumber}`);
}

function wasShown(item: InAppNotificationItem): boolean {
  return shownTags.has(`${item.materialId}:${item.seasonNumber}:${item.episodeNumber}`);
}

async function pollInAppNotifications(pushActive: boolean): Promise<void> {
  const since = readInAppNotifySince() ?? initInAppNotifySince();
  const url = new URL("/api/notifications/in-app", window.location.origin);
  url.searchParams.set("since", since);

  let response: Response;
  try {
    response = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return;
  }
  if (response.status === 401) return;
  if (!response.ok) return;

  const data = (await response.json()) as InAppResponse;
  if (!data.enabled || data.items.length === 0) {
    if (data.latestAt) writeInAppNotifySince(data.latestAt);
    return;
  }

  let latest = since;

  for (const item of data.items) {
    if (wasShown(item)) continue;
    markShown(item);
    if (pushActive) {
      // OS-уведомление доставляет service worker; только двигаем курсор опроса.
    } else if (showInAppBrowserNotification(item)) {
      /* fallback: page Notification при открытой вкладке без push */
    } else {
      emitNotificationToast(item);
    }
    if (item.notifiedAt > latest) latest = item.notifiedAt;
  }

  const cursor = data.latestAt ?? latest;
  if (cursor) writeInAppNotifySince(cursor);
}

export function InAppNotificationsListener() {
  const { user, loading } = useAuth();
  const pollingRef = useRef(false);
  const visibleRef = useRef(true);
  const pushActiveRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (loading || !user) return;

    initInAppNotifySince();
    void ensureBackgroundPushSubscription();
    void ensureAndroidFcmSubscription();

    const onVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (visibleRef.current) {
        void runPoll();
      }
    };

    const runPoll = async () => {
      if (!visibleRef.current || pollingRef.current) return;
      pollingRef.current = true;
      try {
        if (pushActiveRef.current === null) {
          const [browserPush, androidFcm] = await Promise.all([
            hasActivePushSubscription(),
            hasActiveAndroidFcmSubscription(),
          ]);
          pushActiveRef.current = browserPush || androidFcm;
        }
        await pollInAppNotifications(pushActiveRef.current);
      } finally {
        pollingRef.current = false;
      }
    };

    const onPrefsChanged = () => {
      initInAppNotifySince();
      pushActiveRef.current = null;
      void ensureBackgroundPushSubscription();
      void ensureAndroidFcmSubscription();
      void runPoll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(IN_APP_NOTIFY_PREFS_EVENT, onPrefsChanged);

    void runPoll();
    const timer = window.setInterval(() => {
      void runPoll();
    }, IN_APP_POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(IN_APP_NOTIFY_PREFS_EVENT, onPrefsChanged);
      window.clearInterval(timer);
    };
  }, [user, loading]);

  return null;
}
