"use client";

import { useEffect, useRef } from "react";

export type UseVisiblePollOptions = {
  /** Вызывается только при видимой вкладке (и с учётом stale-on-resume). */
  onPoll: () => void | Promise<void>;
  /** Интервал poll, пока вкладка visible. */
  intervalMs: number;
  /**
   * Минимальный возраст с последнего успешного poll, чтобы дернуть сеть
   * при возврате на вкладку (защита от закликивания).
   */
  minStaleOnResumeMs: number;
  /** Задержка до первого poll после mount (только если вкладка сразу visible). */
  startDelayMs?: number;
  enabled?: boolean;
};

/**
 * Poll только на видимой вкладке: interval снимается в hidden;
 * при visibility → visible — poll только если прошло ≥ minStaleOnResumeMs.
 */
export function useVisiblePoll({
  onPoll,
  intervalMs,
  minStaleOnResumeMs,
  startDelayMs = 0,
  enabled = true,
}: UseVisiblePollOptions): void {
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const lastSuccessAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    // SSR/гидрация считаются свежими — не дёргать сеть при быстром alt-tab сразу после открытия.
    lastSuccessAtRef.current = Date.now();

    let intervalId: number | undefined;
    let startTimeoutId: number | undefined;
    let cancelled = false;

    const clearTick = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const runPoll = (opts: { respectStaleGate: boolean }) => {
      if (cancelled || document.hidden || inFlightRef.current) return;

      if (opts.respectStaleGate && lastSuccessAtRef.current > 0) {
        if (Date.now() - lastSuccessAtRef.current < minStaleOnResumeMs) return;
      }

      inFlightRef.current = true;
      void Promise.resolve()
        .then(() => onPollRef.current())
        .then(() => {
          if (!cancelled) lastSuccessAtRef.current = Date.now();
        })
        .catch(() => {
          /* ошибки глотает caller; lastSuccessAt не двигаем */
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const startInterval = () => {
      clearTick();
      if (document.hidden) return;
      intervalId = window.setInterval(() => {
        runPoll({ respectStaleGate: false });
      }, intervalMs);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTick();
        return;
      }
      runPoll({ respectStaleGate: true });
      startInterval();
    };

    const boot = () => {
      if (document.hidden) return;
      runPoll({ respectStaleGate: false });
      startInterval();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    if (startDelayMs > 0) {
      startTimeoutId = window.setTimeout(boot, startDelayMs);
    } else {
      boot();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(startTimeoutId);
      clearTick();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, minStaleOnResumeMs, startDelayMs]);
}
