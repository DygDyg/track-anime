"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 6;

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  moved: boolean;
  captured: boolean;
};

/**
 * Horizontal click-and-drag scroll for overflow strips (mouse / pen).
 * Touch keeps native overflow scrolling.
 *
 * Capture starts only after the drag threshold so a plain click still
 * reaches episode buttons.
 */
export function useHorizontalDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const listeningRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onWindowPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const node = ref.current;
    if (!drag || !node || event.pointerId !== drag.pointerId) return;

    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;

    if (!drag.moved) {
      drag.moved = true;
      try {
        node.setPointerCapture(event.pointerId);
        drag.captured = true;
      } catch {
        drag.captured = false;
      }
      setDragging(true);
    }

    event.preventDefault();
    node.scrollLeft = drag.startScrollLeft - delta;
  }, []);

  const finishDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      if (drag.moved) suppressClickRef.current = true;

      const node = ref.current;
      if (drag.captured && node?.hasPointerCapture(drag.pointerId)) {
        try {
          node.releasePointerCapture(drag.pointerId);
        } catch {
          /* already released */
        }
      }

      dragRef.current = null;
      setDragging(false);

      if (listeningRef.current) {
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", finishDrag);
        window.removeEventListener("pointercancel", finishDrag);
        listeningRef.current = false;
      }
    },
    [onWindowPointerMove],
  );

  const detachAll = useCallback(() => {
    if (!listeningRef.current) return;
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);
    listeningRef.current = false;
  }, [finishDrag, onWindowPointerMove]);

  useEffect(() => () => detachAll(), [detachAll]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if (event.button !== 0) return;

      const node = ref.current;
      if (!node) return;
      if (node.scrollWidth <= node.clientWidth + 1) return;

      detachAll();
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: node.scrollLeft,
        moved: false,
        captured: false,
      };

      window.addEventListener("pointermove", onWindowPointerMove, { passive: false });
      window.addEventListener("pointerup", finishDrag);
      window.addEventListener("pointercancel", finishDrag);
      listeningRef.current = true;
    },
    [detachAll, finishDrag, onWindowPointerMove],
  );

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    ref,
    dragging,
    dragProps: {
      onPointerDown,
      onClickCapture,
    },
  };
}
