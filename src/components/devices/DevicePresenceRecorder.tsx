"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { postDevicePresence } from "@/lib/device-presence-client";

const DEBOUNCE_MS = 1500;

function shouldRecordPath(pathname: string): boolean {
  return /^\/anime\/\d+$/.test(pathname);
}

export function DevicePresenceRecorder() {
  const { user } = useAuth();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;
    if (!shouldRecordPath(pathname)) return;

    const pathWithSearch = search ? `${pathname}?${search}` : pathname;

    const send = () => {
      if (lastSentRef.current === pathWithSearch) return;
      lastSentRef.current = pathWithSearch;
      const title =
        typeof document !== "undefined" && document.title.trim()
          ? document.title.trim()
          : null;
      void postDevicePresence(pathWithSearch, title).catch(() => {
        lastSentRef.current = "";
      });
    };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(send, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, pathname, search]);

  useEffect(() => {
    if (!user) return;

    const onFocus = () => {
      if (!shouldRecordPath(pathname)) return;
      const pathWithSearch = search ? `${pathname}?${search}` : pathname;
      lastSentRef.current = "";
      const title =
        typeof document !== "undefined" && document.title.trim()
          ? document.title.trim()
          : null;
      void postDevicePresence(pathWithSearch, title).catch(() => {
        /* ignore */
      });
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, pathname, search]);

  return null;
}
