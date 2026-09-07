"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

type Props = {
  initialFingerprint: string | null;
};

export function ClientUpdateGuard({ initialFingerprint }: Props) {
  const [updateReady, setUpdateReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!initialFingerprint || document.visibilityState === "hidden") return;

    try {
      const response = await fetch("/api/site-build", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { fingerprint?: unknown };
      if (typeof data.fingerprint === "string" && data.fingerprint !== initialFingerprint) {
        setUpdateReady(true);
      }
    } catch {
      // A failed check must not interrupt viewing.
    }
  }, [initialFingerprint]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void checkForUpdate();
    const intervalId = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate]);

  if (!updateReady || !mounted) return null;

  return createPortal(
    <div
      role="status"
      aria-live="assertive"
      className="client-update-banner pointer-events-none fixed inset-x-3 z-[500] mx-auto flex max-w-xl justify-center"
    >
      <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border-2 border-amber-400/80 bg-amber-950/95 p-3.5 text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(251,191,36,0.35)] ring-4 ring-amber-400/25 backdrop-blur-md">
        <p className="text-sm font-semibold leading-snug sm:text-[0.9375rem]">
          Сайт обновился. Перезагрузите страницу перед совместным просмотром.
        </p>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-amber-400 px-3.5 py-2 text-sm font-bold text-amber-950 shadow-md shadow-amber-900/40 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-950"
          onClick={() => window.location.reload()}
        >
          Обновить
        </button>
      </div>
    </div>,
    document.body,
  );
}
