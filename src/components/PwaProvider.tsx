"use client";

import { useEffect, type ReactNode } from "react";
import { registerPwaServiceWorker } from "@/lib/notifications/browser-client";

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function PwaProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    const updateServiceWorker = async () => {
      const registration = await registerPwaServiceWorker();
      if (!registration || cancelled || document.visibilityState === "hidden") return;

      try {
        await registration.update();
      } catch {
        // A failed update check must not affect the open page.
      }
    };

    void updateServiceWorker();
    const intervalId = window.setInterval(() => void updateServiceWorker(), SERVICE_WORKER_UPDATE_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void updateServiceWorker();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return children;
}
