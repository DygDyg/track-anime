"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
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
/** Slightly loose — tablet thumbs jitter more than phone taps. */
const LONG_PRESS_MOVE_PX = 18;

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

/** Phone + tablet touch (incl. iPad “desktop” width). OR — not AND. */
function isTouchLikeUi(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

/** iPadOS “desktop site” often reports finger as mouse + hover:hover. */
function isTouchCapableDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0 || isTouchLikeUi();
}

function shouldArmLongPress(event: PointerEvent<HTMLDivElement>): boolean {
  if (event.pointerType === "touch" || event.pointerType === "pen") return true;
  // Finger-as-mouse on tablets / hybrid devices — not pure desktop mouse.
  if (event.pointerType === "mouse" && isTouchCapableDevice()) return true;
  return isTouchLikeUi();
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
  const longPressPointerIdRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | undefined>(undefined);
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
    longPressPointerIdRef.current = null;
  }, []);

  const armClickSuppress = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current !== undefined) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    // Click may be delayed or skipped after long-press — auto-clear gate.
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = undefined;
    }, 600);
  }, []);

  const openSheet = useCallback(() => {
    clearLongPressTimer();
    armClickSuppress();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* ignore */
    }
    setSheetOpen(true);
    hoveredRef.current = false;
    setHovered(false);
  }, [armClickSuppress, clearLongPressTimer]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const updatePanelOffset = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    setPanelOffsetX(computeHoverPanelOffsetX(el.getBoundingClientRect()));
  }, []);

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.pointerType === "pen" || sheetOpen) return;
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

  const handlePointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!shouldArmLongPress(event)) return;
    if (sheetOpen) return;
    if (!event.isPrimary) return;

    clearLongPressTimer();
    longPressPointerIdRef.current = event.pointerId;
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      openSheet();
    }, LONG_PRESS_MS);
  };

  const handlePointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (longPressPointerIdRef.current != null && event.pointerId !== longPressPointerIdRef.current) {
      return;
    }
    const origin = longPressOriginRef.current;
    if (!origin || longPressTimerRef.current === undefined) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      clearLongPressTimer();
    }
  };

  const handlePointerUpOrCancelCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (longPressPointerIdRef.current != null && event.pointerId !== longPressPointerIdRef.current) {
      return;
    }
    clearLongPressTimer();
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
    if (suppressClickTimerRef.current !== undefined) {
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = undefined;
    }
  };

  const handleContextMenuCapture = (event: MouseEvent<HTMLDivElement>) => {
    // Block image/text callouts on touch + while sheet opens from long-press.
    if (sheetOpen || suppressClickRef.current || isTouchCapableDevice()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleDragStartCapture = (event: DragEvent<HTMLDivElement>) => {
    // Poster drag steals the gesture on tablets — long-press never completes.
    event.preventDefault();
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

  useEffect(
    () => () => {
      clearLongPressTimer();
      if (suppressClickTimerRef.current !== undefined) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    },
    [clearLongPressTimer],
  );

  return (
    <div
      ref={cardRef}
      className={[
        "anime-card-hover-shell group/card relative h-full",
        hovered ? "md:z-[80]" : "",
        className,
      ].join(" ")}
      style={{ "--hover-panel-x": `${panelOffsetX}px` } as CSSProperties}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpOrCancelCapture}
      onPointerCancelCapture={handlePointerUpOrCancelCapture}
      onClickCapture={handleClickCapture}
      onContextMenuCapture={handleContextMenuCapture}
      onDragStartCapture={handleDragStartCapture}
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
