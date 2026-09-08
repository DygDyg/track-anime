"use client";

import { useCallback, useEffect, useState } from "react";
import { NotificationToastBody } from "@/components/NotificationToastBody";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  activateBrowserPushFromPermission,
  hasActivePushSubscription,
  readBrowserPushEnabled,
} from "@/lib/notifications/browser-client";
import {
  hasActiveAndroidFcmSubscription,
  isAndroidFcmBridgeAvailable,
  readAndroidFcmEnabled,
  readAndroidFcmPromptDismissed,
  subscribeAndroidFcm,
  writeAndroidFcmPromptDismissed,
} from "@/lib/notifications/fcm-client";
import {
  emitNotificationsPrefsChanged,
  resetInAppNotifySince,
} from "@/lib/notifications/in-app-client";
import {
  NOTIFICATION_TOAST_EVENT,
  NOTIFICATION_TOAST_MS,
  type NotificationToastItem,
} from "@/lib/notifications/toast-ui";

export {
  NOTIFICATION_TOAST_EVENT,
  type NotificationToastItem,
} from "@/lib/notifications/toast-ui";

export const NOTIFICATION_BANNER_DISMISS_KEY = "ta:notify-banner-dismissed";

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
  const { settings } = useSiteSettings();
  const [toasts, setToasts] = useState<NotificationToastItem[]>([]);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerDenied, setBannerDenied] = useState(false);
  const [androidBannerVisible, setAndroidBannerVisible] = useState(false);
  const [androidError, setAndroidError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [desktop, setDesktop] = useState(false);

  const companionBubbleMode = settings.companionEnabled && desktop;

  const COMPANION_PERMISSION_EVENT = "ta:companion-permission-prompt";
  const COMPANION_PERMISSION_ACTION_EVENT = "ta:companion-permission-prompt-action";

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const checkAndroidBanner = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!isAndroidFcmBridgeAvailable()) {
      setAndroidBannerVisible(false);
      return;
    }
    if (readAndroidFcmPromptDismissed()) {
      setAndroidBannerVisible(false);
      return;
    }
    if (readAndroidFcmEnabled() && (await hasActiveAndroidFcmSubscription())) {
      setAndroidBannerVisible(false);
      return;
    }

    try {
      const res = await fetch("/api/user/notification-preferences", { cache: "no-store" });
      if (res.status === 401) {
        setAndroidBannerVisible(false);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        preferences?: { fcmConfigured?: boolean };
      };
      if (!data.preferences?.fcmConfigured) {
        setAndroidBannerVisible(false);
        return;
      }
      setAndroidBannerVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  const checkBanner = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Android shell uses FCM, not browser Notification / Web Push.
    if (isAndroidFcmBridgeAvailable()) {
      setBannerVisible(false);
      await checkAndroidBanner();
      return;
    }

    setAndroidBannerVisible(false);
    if (!("Notification" in window)) return;

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
  }, [checkAndroidBanner]);

  useEffect(() => {
    void checkBanner();

    const onToast = (event: Event) => {
      if (companionBubbleMode) return;
      const detail = (event as CustomEvent<NotificationToastItem>).detail;
      if (!detail?.id) return;

      setToasts((prev) => [...prev, detail]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== detail.id));
      }, NOTIFICATION_TOAST_MS);
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
  }, [checkBanner, companionBubbleMode]);

  useEffect(() => {
    if (companionBubbleMode) setToasts([]);
  }, [companionBubbleMode]);

  const requestPermission = useCallback(async () => {
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
  }, []);

  const enableAndroidNotifications = useCallback(async () => {
    setRequesting(true);
    setAndroidError(null);
    try {
      const prefsRes = await fetch("/api/user/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyNewEnabled: true }),
      });
      if (!prefsRes.ok) {
        setAndroidError("Не удалось включить уведомления о новых сериях");
        return;
      }

      const result = await subscribeAndroidFcm();
      if (!result.ok) {
        setAndroidError(result.error);
        return;
      }

      writeAndroidFcmPromptDismissed();
      setAndroidBannerVisible(false);
      resetInAppNotifySince();
      emitNotificationsPrefsChanged();
    } finally {
      setRequesting(false);
    }
  }, []);

  // Sync permission banner state into companion bubble (desktop+).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(COMPANION_PERMISSION_EVENT, {
        detail: {
          open: companionBubbleMode && bannerVisible,
          denied: bannerDenied,
          requesting,
        },
      }),
    );
  }, [COMPANION_PERMISSION_EVENT, companionBubbleMode, bannerVisible, bannerDenied, requesting]);

  // Handle clicks from companion bubble buttons.
  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      if (!detail?.action) return;

      if (detail.action === "allow") {
        void requestPermission();
        return;
      }

      if (detail.action === "hide") {
        writeDismissed();
        setBannerVisible(false);
      }
    };

    window.addEventListener(
      COMPANION_PERMISSION_ACTION_EVENT,
      onAction as EventListener,
    );
    return () => {
      window.removeEventListener(
        COMPANION_PERMISSION_ACTION_EVENT,
        onAction as EventListener,
      );
    };
  }, [COMPANION_PERMISSION_ACTION_EVENT, requestPermission]);

  return (
    <>
      {androidBannerVisible && !companionBubbleMode ? (
        <div className="fixed bottom-20 left-3 right-3 z-[90] mx-auto max-w-lg sm:bottom-6 sm:left-auto sm:right-6">
          <div className="rounded-xl border border-accent/30 bg-card px-4 py-3 shadow-lg shadow-black/30">
            <p className="text-sm font-medium text-foreground">Уведомления Android</p>
            <p className="mt-1 text-xs text-muted">
              Включите системные уведомления — сообщим о новой серии из истории, даже когда приложение закрыто.
            </p>
            {androidError ? <p className="mt-2 text-xs text-rose-400">{androidError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={requesting}
                onClick={() => void enableAndroidNotifications()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {requesting ? "Включение…" : "Включить"}
              </button>
              <button
                type="button"
                disabled={requesting}
                onClick={() => {
                  writeAndroidFcmPromptDismissed();
                  setAndroidBannerVisible(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
              >
                Позже
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bannerVisible && !companionBubbleMode ? (
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

      {!companionBubbleMode ? (
        <div className="pointer-events-none fixed right-3 top-20 z-[90] flex w-[min(100%,22rem)] flex-col gap-2 sm:top-24">
          {toasts.map((toast) => (
            <NotificationToastBody
              key={toast.id}
              toast={toast}
              className={[
                "pointer-events-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg shadow-black/25 backdrop-blur-sm transition hover:border-accent/40",
                toast.kind === "history-new" ? "flex gap-3" : "block",
              ].join(" ")}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
