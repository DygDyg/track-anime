"use client";

import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const DRAG_THRESHOLD_PX = 6;

/**
 * Horizontal click-and-drag scroll for overflow strips (mouse / pen).
 * Touch keeps native overflow scrolling. After a real drag, the following click is swallowed.
 */
export function useHorizontalDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const endDrag = useCallback((node: HTMLDivElement, pointerId: number, moved: boolean) => {
    if (node.hasPointerCapture(pointerId)) {
      try {
        node.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    dragRef.current = null;
    setDragging(false);
    if (moved) suppressClickRef.current = true;
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    if (event.button !== 0) return;

    const node = ref.current;
    if (!node) return;
    if (node.scrollWidth <= node.clientWidth + 1) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: node.scrollLeft,
      moved: false,
    };
    node.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const node = ref.current;
    if (!drag || !node || event.pointerId !== drag.pointerId) return;

    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    event.preventDefault();
    node.scrollLeft = drag.startScrollLeft - delta;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const node = ref.current;
      if (!drag || !node || event.pointerId !== drag.pointerId) return;
      endDrag(node, drag.pointerId, drag.moved);
    },
    [endDrag],
  );

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
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
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
