import type { CSSProperties } from "react";

export const HOVER_PORTAL_MARGIN = 12;
export const HOVER_PORTAL_GAP = 8;
export const HOVER_PORTAL_ESTIMATED_HEIGHT = 420;

export function computeHoverPanelOffsetX(
  rect: DOMRect,
  panelWidth = 320,
  margin = HOVER_PORTAL_MARGIN,
): number {
  const cardCenter = rect.left + rect.width / 2;
  const idealLeft = cardCenter - panelWidth / 2;
  const idealRight = cardCenter + panelWidth / 2;
  if (idealLeft < margin) return margin - idealLeft;
  if (idealRight > window.innerWidth - margin) return window.innerWidth - margin - idealRight;
  return 0;
}

export function computeHoverPortalStyle(
  anchorRect: DOMRect,
  panelWidth: number,
  panelOffsetX: number,
  panelHeight = HOVER_PORTAL_ESTIMATED_HEIGHT,
): CSSProperties {
  const margin = HOVER_PORTAL_MARGIN;
  const viewportH = window.innerHeight;
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;

  // Панель растёт от верхнего края карточки (как у inline-режима), а не под ней.
  return {
    position: "fixed",
    left: anchorCenterX,
    top: anchorRect.top,
    width: panelWidth,
    maxHeight: Math.max(160, Math.min(panelHeight, viewportH - anchorRect.top - margin)),
    zIndex: 200,
    transform: `translate(calc(-50% + ${panelOffsetX}px), 0)`,
    transition: "opacity 160ms ease-out, transform 160ms ease-out, visibility 160ms ease-out",
    overflow: "visible",
  };
}
