"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ReleaseCardHoverPanel,
  computeHoverPanelOffsetX,
} from "@/components/ReleaseCardHoverPanel";
import { ReleaseCardMobileSheet } from "@/components/ReleaseCardMobileSheet";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { emitCompanionReaction, emitCompanionSituation } from "@/lib/companion/companion-bus";
import type { HoverPanelReleaseInput } from "@/lib/hover-panel-release";

const LONG_PRESS_MS = 420;
const LONG_PRESS_MOVE_PX = 12;

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

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export function AnimeCardHoverShell({
  release,
  previewUrl,
  children,
  className = "",
  hoverPanelPortal: _hoverPanelPortal = true,
  onDeleteFromHistory,
  deletingFromHistory = false,
  readOnly = false,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const panelWasOpenRef = useRef(false);
  const longPressTimerRef = useRef<number | undefined>(undefined);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [panelOffsetX, setPanelOffsetX] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { settings } = useSiteSettings();

  const animeHref = release.shikimoriId ? `/anime/${release.shikimoriId}` : null;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== undefined) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = undefined;
    }
    longPressOriginRef.current = null;
  }, []);

  const openSheet = useCallback(() => {
    clearLongPressTimer();
    suppressClickRef.current = true;
    setSheetOpen(true);
    hoveredRef.current = false;
    setHovered(false);
  }, [clearLongPressTimer]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const updatePanelOffset = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    setPanelOffsetX(computeHoverPanelOffsetX(el.getBoundingClientRect()));
  }, []);

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || sheetOpen) return;
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

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && !isCoarsePointer()) return;
    if (sheetOpen) return;

    clearLongPressTimer();
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      openSheet();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = longPressOriginRef.current;
    if (!origin || longPressTimerRef.current === undefined) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      clearLongPressTimer();
    }
  };

  const handlePointerUpOrCancel = () => {
    clearLongPressTimer();
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // Avoid native callout while long-press opens the sheet.
    if (sheetOpen || suppressClickRef.current || isCoarsePointer()) {
      event.preventDefault();
    }
  };

  // Companion: popup/sheet open → work; close → tab situation
  useEffect(() => {
    const open = hovered || sheetOpen;
    if (open) {
      panelWasOpenRef.current = true;
      emitCompanionReaction("work", { force: true });
      return;
    }
    if (!panelWasOpenRef.current) return;
    panelWasOpenRef.current = false;
    emitCompanionSituation(window.location.pathname, { force: true });
  }, [hovered, sheetOpen]);

  useEffect(() => {
    const onViewportChange = () => {
      if (!hoveredRef.current) return;
      updatePanelOffset();
    };

    const onScrollClose = () => {
      if (!hoveredRef.current) return;
      hoveredRef.current = false;
      setHovered(false);
      clearLongPressTimer();
    };

    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("scroll", onScrollClose, { passive: true, capture: true });
    window.addEventListener("resize", onViewportChange, { passive: true });
    return () => {
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("scroll", onScrollClose, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [updatePanelOffset, clearLongPressTimer]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  return (
    <div
      ref={cardRef}
      className={[
        "group/card relative h-full",
        hovered ? "md:z-[80]" : "",
        className,
      ].join(" ")}
      style={{ "--hover-panel-x": `${panelOffsetX}px` } as CSSProperties}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
    >
      {children}
      <ReleaseCardHoverPanel
        release={release}
        visible={hovered && !sheetOpen}
        previewUrl={previewUrl}
        animeHref={animeHref}
        trailerEnabled={settings.hoverTrailerEnabled}
        trailerDelaySec={settings.hoverTrailerDelaySec}
        // Portal to body so panel sits above fixed companion (z-40) and below modals.
        portal
        anchorRef={cardRef}
        panelOffsetX={panelOffsetX}
        panelRef={panelRef}
        onDeleteFromHistory={onDeleteFromHistory}
        deletingFromHistory={deletingFromHistory}
        readOnly={readOnly}
      />
      <ReleaseCardMobileSheet
        open={sheetOpen}
        onClose={closeSheet}
        release={release}
        previewUrl={previewUrl}
        animeHref={animeHref}
        onDeleteFromHistory={onDeleteFromHistory}
        deletingFromHistory={deletingFromHistory}
        readOnly={readOnly}
      />
    </div>
  );
}
