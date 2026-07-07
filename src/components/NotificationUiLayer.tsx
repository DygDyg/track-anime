"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { InAppNotificationItem } from "@/lib/notifications/in-app-feed";
import { activateBrowserPushFromPermission, hasActivePushSubscription, readBrowserPushEnabled } from "@/lib/notifications/browser-client";
import {
  emitNotificationsPrefsChanged,
  resetInAppNotifySince,
} from "@/lib/notifications/in-app-client";
import {
  formatHistoryNewNotificationBody,
  formatHistoryNewNotificationTitle,
} from "@/lib/notifications/payload";

export const NOTIFICATION_TOAST_EVENT = "ta:notification-toast";
export const NOTIFICATION_BANNER_DISMISS_KEY = "ta:notify-banner-dismissed";

type ToastItem = {
  id: string;
  title: string;
  body: string;
  url: string;
};

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(NOTIFICATION_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(NOTIFICATION_BANNER_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function NotificationUiLayer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerDenied, setBannerDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const checkBanner = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "granted") {
      setBannerVisible(false);
      try {
        const res = await fetch("/api/user/notification-preferences", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            preferences?: { historyNewEnabled?: boolean; browserPushConfigured?: boolean };
          };
          const pushActive = await hasActivePushSubscription();
          if (
            data.preferences?.historyNewEnabled &&
            data.preferences.browserPushConfigured &&
            readBrowserPushEnabled() &&
            !pushActive
          ) {
            const activated = await activateBrowserPushFromPermission();
            if (activated.ok) {
              emitNotificationsPrefsChanged();
              resetInAppNotifySince();
            }
          }
        }
      } catch {
        /* ignore */
      }
      return;
    }

    if (readDismissed()) return;

    try {
      const res = await fetch("/api/user/notification-preferences", { cache: "no-store" });
      if (res.status === 401) return;
      if (!res.ok) return;
      const data = (await res.json()) as {
        preferences?: { historyNewEnabled?: boolean };
      };
      if (!data.preferences?.historyNewEnabled) return;

      setBannerDenied(Notification.permission === "denied");
      setBannerVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void checkBanner();

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<InAppNotificationItem>).detail;
      if (!detail) return;

      const id = `${detail.materialId}:${detail.seasonNumber}:${detail.episodeNumber}:${Date.now()}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          title: formatHistoryNewNotificationTitle(detail),
          body: formatHistoryNewNotificationBody(detail),
          url: detail.pageUrl,
        },
      ]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 12_000);
    };

    const onPrefs = () => {
      void checkBanner();
    };

    window.addEventListener(NOTIFICATION_TOAST_EVENT, onToast as EventListener);
    window.addEventListener("ta:notifications-prefs-changed", onPrefs);

    return () => {
      window.removeEventListener(NOTIFICATION_TOAST_EVENT, onToast as EventListener);
      window.removeEventListener("ta:notifications-prefs-changed", onPrefs);
    };
  }, [checkBanner]);

  async function requestPermission() {
    if (!("Notification" in window)) return;
    setRequesting(true);
    try {
      const result = await activateBrowserPushFromPermission();
      if (result.ok) {
        setBannerVisible(false);
        emitNotificationsPrefsChanged();
        resetInAppNotifySince();
      } else if (Notification.permission === "denied") {
        setBannerDenied(true);
      }
    } finally {
      setRequesting(false);
    }
  }

  return (
    <>
      {bannerVisible ? (
        <div className="fixed bottom-20 left-3 right-3 z-[90] mx-auto max-w-lg sm:bottom-6 sm:left-auto sm:right-6">
          <div className="rounded-xl border border-accent/30 bg-card px-4 py-3 shadow-lg shadow-black/30">
            <p className="text-sm font-medium text-foreground">Уведомления о новых сериях</p>
            <p className="mt-1 text-xs text-muted">
              {bannerDenied
                ? "Браузер заблокировал уведомления. Разрешите их в настройках сайта в адресной строке."
                : "Разрешите уведомления — подключится push для фона и PWA (нужна production-сборка)."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!bannerDenied ? (
                <button
                  type="button"
                  disabled={requesting}
                  onClick={() => void requestPermission()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {requesting ? "Запрос…" : "Разрешить"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  writeDismissed();
                  setBannerVisible(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                Скрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed right-3 top-20 z-[90] flex w-[min(100%,22rem)] flex-col gap-2 sm:top-24">
        {toasts.map((toast) => (
          <Link
            key={toast.id}
            href={toast.url}
            className="pointer-events-auto block rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg shadow-black/25 backdrop-blur-sm transition hover:border-accent/40"
          >
            <p className="text-sm font-semibold text-foreground">{toast.title}</p>
            <p className="mt-0.5 text-xs text-muted">{toast.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
