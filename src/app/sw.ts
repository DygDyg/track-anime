/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: {
    title?: string;
    body?: string;
    url?: string;
    icon?: string;
    image?: string;
    tag?: string;
  };

  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { title: "Track Anime", body: event.data.text() };
  }

  const title = payload.title ?? "Track Anime";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/api/brand/logo",
    image: payload.image ?? payload.icon,
    badge: "/api/brand/logo",
    tag: payload.tag,
    data: { url: payload.url ?? "/" },
  } satisfies NotificationOptions & { image?: string };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    typeof event.notification.data === "object" &&
    event.notification.data !== null &&
    "url" in event.notification.data &&
    typeof (event.notification.data as { url?: unknown }).url === "string"
      ? (event.notification.data as { url: string }).url
      : "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client && client.url.includes(self.location.origin)) {
            void client.focus();
            if ("navigate" in client && typeof client.navigate === "function") {
              void client.navigate(targetUrl);
            }
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
