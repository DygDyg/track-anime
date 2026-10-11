"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** How long to wait between confirmation polls after a new fingerprint appears. */
const CONFIRM_GAP_MS = 4_000;
const CONFIRM_NEEDED = 2;
const RELOAD_POLL_MS = 1_500;
const RELOAD_TIMEOUT_MS = 90_000;

type Props = {
  initialFingerprint: string | null;
};

async function fetchFingerprint(): Promise<string | null> {
  const response = await fetch("/api/site-build", { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { fingerprint?: unknown };
  return typeof data.fingerprint === "string" ? data.fingerprint : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function ClientUpdateGuard({ initialFingerprint }: Props) {
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const confirmCountRef = useRef(0);
  const candidateRef = useRef<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current != null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!initialFingerprint || document.visibilityState === "hidden" || updateReady) return;

    try {
      const fingerprint = await fetchFingerprint();
      if (!fingerprint || fingerprint === initialFingerprint) {
        candidateRef.current = null;
        confirmCountRef.current = 0;
        clearConfirmTimer();
        return;
      }

      if (candidateRef.current !== fingerprint) {
        candidateRef.current = fingerprint;
        confirmCountRef.current = 1;
        clearConfirmTimer();
        confirmTimerRef.current = window.setTimeout(() => {
          void checkForUpdate();
        }, CONFIRM_GAP_MS);
        return;
      }

      confirmCountRef.current += 1;
      if (confirmCountRef.current >= CONFIRM_NEEDED) {
        clearConfirmTimer();
        setUpdateReady(true);
        return;
      }

      clearConfirmTimer();
      confirmTimerRef.current = window.setTimeout(() => {
        void checkForUpdate();
      }, CONFIRM_GAP_MS);
    } catch {
      // A failed check must not interrupt viewing — also resets confirm so we
      // only show the banner after the new process is stably answering.
      candidateRef.current = null;
      confirmCountRef.current = 0;
      clearConfirmTimer();
    }
  }, [clearConfirmTimer, initialFingerprint, updateReady]);

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
      clearConfirmTimer();
    };
  }, [checkForUpdate, clearConfirmTimer]);

  const handleReload = useCallback(async () => {
    if (reloading) return;
    setReloading(true);
    const deadline = Date.now() + RELOAD_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const fingerprint = await fetchFingerprint();
        if (fingerprint && fingerprint !== initialFingerprint) {
          window.location.reload();
          return;
        }
      } catch {
        // server still down / restarting
      }
      await sleep(RELOAD_POLL_MS);
    }

    // Last resort: user waited long enough.
    window.location.reload();
  }, [initialFingerprint, reloading]);

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
          disabled={reloading}
          className="shrink-0 rounded-lg bg-amber-400 px-3.5 py-2 text-sm font-bold text-amber-950 shadow-md shadow-amber-900/40 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-950 disabled:cursor-wait disabled:opacity-80"
          onClick={() => void handleReload()}
        >
          {reloading ? "Ждём сервер…" : "Обновить"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
