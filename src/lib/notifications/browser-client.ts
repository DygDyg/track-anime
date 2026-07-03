"use client";

const SW_URL = "/serwist/sw.js";
export const BROWSER_PUSH_ENABLED_KEY = "track-anime-browser-push-enabled";

export function readBrowserPushEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BROWSER_PUSH_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeBrowserPushEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem(BROWSER_PUSH_ENABLED_KEY, "1");
    } else {
      localStorage.removeItem(BROWSER_PUSH_ENABLED_KEY);
    }
  } catch {
    /* ignore */
  }
}

function isOurServiceWorkerScript(scriptUrl: string | undefined): boolean {
  return Boolean(scriptUrl?.includes("/serwist/sw.js"));
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerSerwistServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(SW_URL, {
    scope: "/",
    type: "classic",
    updateViaCache: "none",
  });
}

export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    let registration = await navigator.serviceWorker.getRegistration("/");
    const scriptUrl =
      registration?.active?.scriptURL ??
      registration?.installing?.scriptURL ??
      registration?.waiting?.scriptURL;

    if (!registration || !isOurServiceWorkerScript(scriptUrl)) {
      if (registration) {
        await registration.unregister();
      }
      registration = await registerSerwistServiceWorker();
    }

    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

export async function syncPushSubscriptionToServer(
  subscription: PushSubscription,
): Promise<boolean> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return false;
  }

  const saveRes = await fetch("/api/notifications/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    }),
  });

  return saveRes.ok;
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export async function subscribeBrowserPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!("Notification" in window) || !("PushManager" in window)) {
    return { ok: false, error: "Браузер не поддерживает push-уведомления" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Разрешение на уведомления не выдано" };
  }

  const vapidRes = await fetch("/api/notifications/vapid-public-key");
  if (!vapidRes.ok) {
    return { ok: false, error: "Не удалось получить ключи push" };
  }

  const vapidData = (await vapidRes.json()) as { configured?: boolean; publicKey?: string | null };
  if (!vapidData.configured || !vapidData.publicKey) {
    return { ok: false, error: "Push-уведомления не настроены на сервере" };
  }

  const registration = await registerPwaServiceWorker();
  if (!registration) {
    return { ok: false, error: "Service worker недоступен" };
  }

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
    });
  }

  const saved = await syncPushSubscriptionToServer(subscription);
  if (!saved) {
    return { ok: false, error: "Не удалось сохранить подписку" };
  }

  writeBrowserPushEnabled(true);
  return { ok: true };
}

/** После выдачи разрешения — подписать push в этом браузере (настройка локальная). */
export async function activateBrowserPushFromPermission(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return subscribeBrowserPush();
}

export async function unsubscribeBrowserPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await fetch("/api/notifications/push-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  }

  writeBrowserPushEnabled(false);
}

export async function ensureBackgroundPushSubscription(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    const registration = await registerPwaServiceWorker();
    if (!registration) return;

    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    if (!readBrowserPushEnabled()) {
      if (existing) {
        await unsubscribeBrowserPush();
      }
      return;
    }

    const prefsRes = await fetch("/api/user/notification-preferences", { cache: "no-store" });
    if (!prefsRes.ok) return;
    const data = (await prefsRes.json()) as {
      preferences?: { historyNewEnabled?: boolean };
    };
    if (!data.preferences?.historyNewEnabled) return;

    if (existing) {
      await syncPushSubscriptionToServer(existing);
      return;
    }

    await subscribeBrowserPush();
  } catch {
    /* ignore */
  }
}
