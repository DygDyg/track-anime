"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { collectAnalyticsClientHints } from "@/lib/analytics/client-hints";

export function SiteAnalyticsBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    let cancelled = false;

    const send = async () => {
      const hints = await collectAnalyticsClientHints();
      if (cancelled) return;
      void fetch("/api/analytics/beacon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          ...hints,
        }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    };

    const t = window.setTimeout(() => {
      void send();
    }, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pathname]);

  return null;
}
