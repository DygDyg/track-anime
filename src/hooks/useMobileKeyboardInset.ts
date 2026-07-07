"use client";

import { useEffect } from "react";

const INSET_VAR = "--mobile-keyboard-inset";
/** Порог, выше которого считаем, что открыта экранная клавиатура. */
const KEYBOARD_THRESHOLD_PX = 48;

function readKeyboardInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/** Синхронизирует --mobile-keyboard-inset и класс html.mobile-keyboard-open. */
export function useMobileKeyboardInset(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const root = document.documentElement;

    const sync = () => {
      const inset = readKeyboardInset();
      root.style.setProperty(INSET_VAR, `${inset}px`);
      root.classList.toggle("mobile-keyboard-open", inset >= KEYBOARD_THRESHOLD_PX);
    };

    sync();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      root.style.removeProperty(INSET_VAR);
      root.classList.remove("mobile-keyboard-open");
    };
  }, [enabled]);
}
