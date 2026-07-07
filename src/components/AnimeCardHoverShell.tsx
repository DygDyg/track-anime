"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  ReleaseCardHoverPanel,
  computeHoverPanelOffsetX,
} from "@/components/ReleaseCardHoverPanel";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import type { HoverPanelRelease, HoverPanelReleaseInput } from "@/lib/hover-panel-release";

type Props = {
  release: HoverPanelReleaseInput;
  previewUrl: string | null;
  children: ReactNode;
  className?: string;
  hoverPanelPortal?: boolean;
  onDeleteFromHistory?: () => void | Promise<void>;
  deletingFromHistory?: boolean;
  readOnly?: boolean;
};

export function AnimeCardHoverShell({
  release,
  previewUrl,
  children,
  className = "",
  hoverPanelPortal = false,
  onDeleteFromHistory,
  deletingFromHistory = false,
  readOnly = false,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [panelOffsetX, setPanelOffsetX] = useState(0);
  const { settings } = useSiteSettings();

  const animeHref = release.shikimoriId ? `/anime/${release.shikimoriId}` : null;

  const updatePanelOffset = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    setPanelOffsetX(computeHoverPanelOffsetX(el.getBoundingClientRect()));
  }, []);

  const handlePointerEnter = () => {
    hoveredRef.current = true;
    setHovered(true);
    updatePanelOffset();
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && cardRef.current?.contains(next)) return;
    if (next instanceof Node && panelRef.current?.contains(next)) return;
    hoveredRef.current = false;
    setHovered(false);
  };

  useEffect(() => {
    const onViewportChange = () => {
      if (!hoveredRef.current) return;
      updatePanelOffset();
    };

    const onScrollClose = () => {
      if (!hoveredRef.current) return;
      if (hoverPanelPortal) {
        updatePanelOffset();
        return;
      }
      hoveredRef.current = false;
      setHovered(false);
    };

    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("scroll", onScrollClose, { passive: true, capture: true });
    window.addEventListener("resize", onViewportChange, { passive: true });
    return () => {
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("scroll", onScrollClose, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [updatePanelOffset, hoverPanelPortal]);

  return (
    <div
      ref={cardRef}
      className={[
        "group/card relative h-full",
        hovered ? (hoverPanelPortal ? "md:z-[70]" : "md:z-50") : "",
        className,
      ].join(" ")}
      style={{ "--hover-panel-x": `${panelOffsetX}px` } as CSSProperties}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {children}
      <ReleaseCardHoverPanel
        release={release}
        visible={hovered}
        previewUrl={previewUrl}
        animeHref={animeHref}
        trailerEnabled={settings.hoverTrailerEnabled}
        trailerDelaySec={settings.hoverTrailerDelaySec}
        portal={hoverPanelPortal}
        anchorRef={cardRef}
        panelOffsetX={panelOffsetX}
        panelRef={panelRef}
        onDeleteFromHistory={onDeleteFromHistory}
        deletingFromHistory={deletingFromHistory}
        readOnly={readOnly}
      />
    </div>
  );
}
