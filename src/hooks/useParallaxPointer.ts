"use client";

import { useEffect, type RefObject } from "react";

type Options = {
  enabled?: boolean;
  /** Множитель наклона устройства (beta/gamma → −1…1). */
  tiltScale?: number;
  /** Доп. ключ, чтобы эффект перезапустился после появления DOM-узла. */
  enabledKey?: string | number | boolean | null;
};

/**
 * Пишет CSS-переменные `--mx`/`--my` (−1…1) и `--sy` (px) на элемент.
 * Источники: pointer + DeviceOrientation (наклон телефона) + scroll.
 * `enabledKey` — доп. ключ (например ready), чтобы переподписаться после монтирования узла.
 */
export function useParallaxPointer(
  targetRef: RefObject<HTMLElement | null>,
  { enabled = true, tiltScale = 1.15, enabledKey }: Options = {},
) {
  useEffect(() => {
    if (!enabled) {
      const el = targetRef.current;
      if (el) {
        el.style.setProperty("--mx", "0");
        el.style.setProperty("--my", "0");
        el.style.setProperty("--sy", "0px");
      }
      return;
    }

    const el = targetRef.current;
    if (!el) return;

    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let tiltX = 0;
    let tiltY = 0;
    let sy = 0;
    let raf = 0;
    let orientListening = false;

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const tick = () => {
      const targetX = Math.max(-1, Math.min(1, tx + tiltX));
      const targetY = Math.max(-1, Math.min(1, ty + tiltY));
      mx += (targetX - mx) * 0.08;
      my += (targetY - my) * 0.08;
      el.style.setProperty("--mx", mx.toFixed(4));
      el.style.setProperty("--my", my.toFixed(4));
      el.style.setProperty("--sy", `${(-sy).toFixed(2)}px`);
      const settled =
        Math.abs(targetX - mx) < 0.001 && Math.abs(targetY - my) < 0.001;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      tx = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      ty = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      schedule();
    };

    const onScroll = () => {
      sy = window.scrollY;
      schedule();
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      // gamma: left/right (−90…90), beta: front/back (−180…180)
      const gamma = typeof event.gamma === "number" ? event.gamma : 0;
      const beta = typeof event.beta === "number" ? event.beta : 0;
      tiltX = Math.max(-1, Math.min(1, (gamma / 30) * tiltScale));
      tiltY = Math.max(-1, Math.min(1, ((beta - 45) / 35) * tiltScale));
      schedule();
    };

    const startOrientation = () => {
      if (orientListening) return;
      orientListening = true;
      window.addEventListener("deviceorientation", onOrientation, { passive: true });
    };

    const maybeRequestOrientation = () => {
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied" | "default">;
      };
      if (typeof DOE.requestPermission === "function") {
        void DOE.requestPermission()
          .then((state) => {
            if (state === "granted") startOrientation();
          })
          .catch(() => {});
        return;
      }
      startOrientation();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    // iOS требует жест; Android обычно отдаёт orientation сразу.
    window.addEventListener("pointerdown", maybeRequestOrientation, { passive: true, once: true });
    window.addEventListener("touchstart", maybeRequestOrientation, { passive: true, once: true });
    startOrientation();
    onScroll();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("pointerdown", maybeRequestOrientation);
      window.removeEventListener("touchstart", maybeRequestOrientation);
    };
  }, [enabled, enabledKey, targetRef, tiltScale]);
}
