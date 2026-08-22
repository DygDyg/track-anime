"use client";

import { useCallback } from "react";

export const OPEN_PLAYER_FULLSCREEN_EVENT = "ta:open-player-fullscreen";

type Props = {
  className?: string;
  disabled?: boolean;
};

/** Under-poster CTA: scroll to player and enter fullscreen (used heavily on Android TV). */
export function AnimeWatchFullscreenButton({ className = "", disabled = false }: Props) {
  const onClick = useCallback(() => {
    if (disabled) return;
    const player = document.getElementById("player");
    player?.scrollIntoView({ behavior: "auto", block: "center" });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.hash !== "#player") {
        url.hash = "player";
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      window.dispatchEvent(new CustomEvent(OPEN_PLAYER_FULLSCREEN_EVENT));
    }
  }, [disabled]);

  return (
    <button
      type="button"
      data-tv-focus
      disabled={disabled}
      onClick={onClick}
      className={[
        "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-accent/50 bg-accent px-4 py-3 text-sm font-semibold text-white shadow-md shadow-accent/25 transition",
        "hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
    >
      Смотреть
    </button>
  );
}
