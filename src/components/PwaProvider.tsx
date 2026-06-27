"use client";

import { useEffect, type ReactNode } from "react";

const SW_URL = "/serwist/sw.js";

export function PwaProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register(SW_URL, {
        scope: "/",
        type: "classic",
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        console.error("[pwa] service worker registration failed", error);
      });
  }, []);

  return children;
}
