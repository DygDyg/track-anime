"use client";

import { useCallback, useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

type Props = {
  initialFingerprint: string | null;
};

export function ClientUpdateGuard({ initialFingerprint }: Props) {
  const [updateReady, setUpdateReady] = useState(false);

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

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-xl sm:bottom-5">
      <p className="text-sm text-foreground">Сайт обновился. Перезагрузите страницу перед совместным просмотром.</p>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        onClick={() => window.location.reload()}
      >
        Обновить
      </button>
    </div>
  );
}
