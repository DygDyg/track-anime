import {
  getTrackAnimeAndroidBridge,
  isTrackAnimeAndroidApp,
  type TrackAnimeAndroidBridge,
} from "@/lib/android-app";

export const ANDROID_FCM_ENABLED_KEY = "track-anime-android-fcm-enabled";
/** One-time first-run prompt in Android WebView shell (localStorage). */
export const ANDROID_FCM_PROMPT_DISMISSED_KEY = "ta:android-fcm-prompt-dismissed";

export function readAndroidFcmEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ANDROID_FCM_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAndroidFcmEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) localStorage.setItem(ANDROID_FCM_ENABLED_KEY, "1");
    else localStorage.removeItem(ANDROID_FCM_ENABLED_KEY);
  } catch {
    /* ignore */
  }
}

export function readAndroidFcmPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ANDROID_FCM_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAndroidFcmPromptDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ANDROID_FCM_PROMPT_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

function bridgeWithFcm(): (TrackAnimeAndroidBridge & {
  hasFcmSupport?: () => boolean;
  areNotificationsEnabled?: () => boolean;
  requestNotificationPermission?: () => void;
  requestFcmToken?: () => void;
}) | null {
  if (!isTrackAnimeAndroidApp()) return null;
  return getTrackAnimeAndroidBridge();
}

export function isAndroidFcmBridgeAvailable(): boolean {
  const bridge = bridgeWithFcm();
  if (!bridge) return false;
  try {
    if (typeof bridge.hasFcmSupport === "function") return Boolean(bridge.hasFcmSupport());
  } catch {
    return false;
  }
  return typeof bridge.requestFcmToken === "function";
}

function waitForNotificationPermission(timeoutMs = 60_000): Promise<boolean> {
  return new Promise((resolve) => {
    const bridge = bridgeWithFcm();
    if (!bridge?.requestNotificationPermission) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };

    const previous = (window as Window & { __taOnNotificationPermission?: (ok: boolean) => void })
      .__taOnNotificationPermission;
    (window as Window & { __taOnNotificationPermission?: (ok: boolean) => void }).__taOnNotificationPermission = (
      ok: boolean,
    ) => {
      try {
        previous?.(ok);
      } catch {
        /* ignore */
      }
      finish(Boolean(ok));
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);

    try {
      bridge.requestNotificationPermission();
    } catch {
      finish(false);
    }
  });
}

function waitForFcmToken(timeoutMs = 20_000): Promise<string | null> {
  return new Promise((resolve) => {
    const bridge = bridgeWithFcm();
    if (!bridge?.requestFcmToken) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };

    const previous = (window as Window & { __taOnFcmToken?: (token: string | null) => void }).__taOnFcmToken;
    (window as Window & { __taOnFcmToken?: (token: string | null) => void }).__taOnFcmToken = (
      token: string | null,
    ) => {
      try {
        previous?.(token);
      } catch {
        /* ignore */
      }
      finish(typeof token === "string" && token.trim() ? token.trim() : null);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);

    try {
      bridge.requestFcmToken();
    } catch {
      finish(null);
    }
  });
}

export async function hasActiveAndroidFcmSubscription(): Promise<boolean> {
  if (!isAndroidFcmBridgeAvailable() || !readAndroidFcmEnabled()) return false;
  const bridge = bridgeWithFcm();
  try {
    if (typeof bridge?.areNotificationsEnabled === "function" && !bridge.areNotificationsEnabled()) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

export async function subscribeAndroidFcm(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAndroidFcmBridgeAvailable()) {
    return { ok: false, error: "FCM недоступен в этой оболочке" };
  }

  const permitted = await waitForNotificationPermission();
  if (!permitted) {
    return { ok: false, error: "Нужно разрешение на уведомления" };
  }

  const token = await waitForFcmToken();
  if (!token) {
    return { ok: false, error: "Не удалось получить FCM-токен (проверьте google-services.json)" };
  }

  const response = await fetch("/api/notifications/fcm-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    return { ok: false, error: "Не удалось сохранить подписку на сервере" };
  }

  writeAndroidFcmEnabled(true);
  writeAndroidFcmPromptDismissed();
  return { ok: true };
}

export async function unsubscribeAndroidFcm(): Promise<void> {
  const token = isAndroidFcmBridgeAvailable() ? await waitForFcmToken() : null;
  try {
    await fetch("/api/notifications/fcm-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token ? { token } : {}),
    });
  } catch {
    /* ignore */
  }
  writeAndroidFcmEnabled(false);
}

/** Re-register token after login / app resume when user already enabled Android FCM. */
export async function ensureAndroidFcmSubscription(): Promise<void> {
  if (!readAndroidFcmEnabled() || !isAndroidFcmBridgeAvailable()) return;
  try {
    await subscribeAndroidFcm();
  } catch {
    /* ignore */
  }
}
