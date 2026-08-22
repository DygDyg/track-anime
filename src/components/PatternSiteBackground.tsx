"use client";

import { useEffect, useState, useRef } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { useParallaxPointer } from "@/hooks/useParallaxPointer";
import type { PatternBackgroundId } from "@/lib/pattern-backgrounds";

type Props = {
  patternId: PatternBackgroundId;
};

function useDocumentPlayerPlaying(): boolean {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setPlaying(root.hasAttribute("data-player-playing"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-player-playing"] });
    return () => observer.disconnect();
  }, []);

  return playing;
}

/** CSS-паттерн фон без blur; параллакс мышью/наклоном (transform) и скроллом (background-position). */
export function PatternSiteBackground({ patternId }: Props) {
  const { settings } = useSiteSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const playerPlaying = useDocumentPlayerPlaying();
  useParallaxPointer(rootRef, {
    enabled: !settings.reduceMotion && !playerPlaying,
    enabledKey: playerPlaying ? "paused" : "live",
  });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        ref={rootRef}
        className={`site-pattern-bg site-pattern-bg--${patternId}`}
        data-pattern={patternId}
      >
        <div className="site-pattern-bg__layer site-pattern-bg__l1" />
        <div className="site-pattern-bg__layer site-pattern-bg__l2" />
        <div className="site-pattern-bg__layer site-pattern-bg__l3" />
        <div className="site-pattern-bg__layer site-pattern-bg__l4" />
        <div className="site-pattern-bg__vignette" />
      </div>
      <div className="site-bg-dim absolute inset-0" />
    </div>
  );
}

/** Мини-превью для пикера настроек (без параллакса). */
export function PatternBackgroundPreview({
  patternId,
  className = "",
}: {
  patternId: PatternBackgroundId;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`site-pattern-bg site-pattern-bg--preview site-pattern-bg--${patternId} ${className}`}
      data-pattern={patternId}
    >
      <div className="site-pattern-bg__layer site-pattern-bg__l1" />
      <div className="site-pattern-bg__layer site-pattern-bg__l2" />
      <div className="site-pattern-bg__layer site-pattern-bg__l3" />
      <div className="site-pattern-bg__layer site-pattern-bg__l4" />
      <div className="site-pattern-bg__vignette" />
    </div>
  );
}
