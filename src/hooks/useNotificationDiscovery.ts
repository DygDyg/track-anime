"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  readNotificationsCtaDismissed,
  readNotificationsTabSeen,
  writeNotificationsCtaDismissed,
  writeNotificationsTabSeen,
  NOTIFICATIONS_DISCOVERY_CHANGED_EVENT,
} from "@/lib/notifications/discovery";
import { IN_APP_NOTIFY_PREFS_EVENT } from "@/lib/notifications/in-app-client";

type DiscoveryState = {
  ready: boolean;
  historyNewEnabled: boolean | null;
  tabSeen: boolean;
  ctaDismissed: boolean;
  shouldShowGearDot: boolean;
  shouldShowCta: boolean;
  markTabSeen: () => void;
  dismissCta: () => void;
  openNotificationsSettings: () => void;
  refreshPrefs: () => Promise<void>;
};

async function fetchHistoryNewEnabled(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/user/notification-preferences", { cache: "no-store" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences?: { historyNewEnabled?: boolean } };
    return Boolean(data.preferences?.historyNewEnabled);
  } catch {
    return null;
  }
}

export function useNotificationDiscovery(): DiscoveryState {
  const { user, loading: authLoading } = useAuth();
  const { openSettings } = useSiteSettings();
  const [ready, setReady] = useState(false);
  const [historyNewEnabled, setHistoryNewEnabled] = useState<boolean | null>(null);
  const [tabSeen, setTabSeen] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);

  const refreshPrefs = useCallback(async () => {
    if (!user) {
      setHistoryNewEnabled(null);
      return;
    }
    const enabled = await fetchHistoryNewEnabled();
    setHistoryNewEnabled(enabled);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;

    setTabSeen(readNotificationsTabSeen());
    setCtaDismissed(readNotificationsCtaDismissed());

    if (!user) {
      setHistoryNewEnabled(null);
      setReady(true);
      return;
    }

    let cancelled = false;
    void fetchHistoryNewEnabled().then((enabled) => {
      if (!cancelled) {
        setHistoryNewEnabled(enabled);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    const onDiscoveryChanged = () => {
      setTabSeen(readNotificationsTabSeen());
      setCtaDismissed(readNotificationsCtaDismissed());
    };

    const onPrefsChanged = () => {
      void refreshPrefs();
    };

    window.addEventListener(NOTIFICATIONS_DISCOVERY_CHANGED_EVENT, onDiscoveryChanged);
    window.addEventListener(IN_APP_NOTIFY_PREFS_EVENT, onPrefsChanged);
    window.addEventListener("ta:notifications-prefs-changed", onPrefsChanged);

    return () => {
      window.removeEventListener(NOTIFICATIONS_DISCOVERY_CHANGED_EVENT, onDiscoveryChanged);
      window.removeEventListener(IN_APP_NOTIFY_PREFS_EVENT, onPrefsChanged);
      window.removeEventListener("ta:notifications-prefs-changed", onPrefsChanged);
    };
  }, [refreshPrefs]);

  const markTabSeen = useCallback(() => {
    writeNotificationsTabSeen();
    setTabSeen(true);
  }, []);

  const dismissCta = useCallback(() => {
    writeNotificationsCtaDismissed();
    setCtaDismissed(true);
  }, []);

  const openNotificationsSettings = useCallback(() => {
    openSettings("notifications");
  }, [openSettings]);

  const notificationsOff = historyNewEnabled === false;
  const shouldShowGearDot = Boolean(user) && ready && !tabSeen && notificationsOff;
  const shouldShowCta = Boolean(user) && ready && notificationsOff && !ctaDismissed;

  return {
    ready,
    historyNewEnabled,
    tabSeen,
    ctaDismissed,
    shouldShowGearDot,
    shouldShowCta,
    markTabSeen,
    dismissCta,
    openNotificationsSettings,
    refreshPrefs,
  };
}
