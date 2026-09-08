"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isTrackAnimeAndroidApp } from "@/lib/android-app";

function detectPwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function detectTv(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: tv)").matches) return true;
  } catch {
    /* ignore */
  }
  // Android TV shell still reports TrackAnimeAndroid; coarse width heuristic only as hint
  return false;
}

export function SiteAnalyticsBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const payload = {
      path: pathname,
      isPwa: detectPwa() && !isTrackAnimeAndroidApp(),
      isTv: detectTv(),
    };

    const send = () => {
      void fetch("/api/analytics/beacon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    };

    // Defer slightly so navigation paint isn't blocked
    const t = window.setTimeout(send, 50);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
