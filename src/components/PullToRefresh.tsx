"use client";

import { useEffect, useRef, useState } from "react";

const TRIGGER_DISTANCE_PX = 76;
const MAX_DISTANCE_PX = 112;

type PullState = "idle" | "pulling" | "ready" | "refreshing";

function isInsideScrollableElement(target: EventTarget | null): boolean {
  let element = target instanceof Element ? target : null;

  while (element && element !== document.body) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
      return true;
    }
    element = element.parentElement;
  }

  return false;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={spinning ? "pull-to-refresh-icon h-5 w-5 animate-spin" : "pull-to-refresh-icon h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M20 11a8 8 0 1 0 2 5.3" strokeLinecap="round" />
      <path d="M20 4v7h-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Обновляет текущую страницу жестом вниз от её верхней границы на touch-устройствах. */
export function PullToRefresh() {
  const [state, setState] = useState<PullState>("idle");
  const [distance, setDistance] = useState(0);
  const distanceRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      startRef.current = null;
      pullingRef.current = false;
      if (!refreshingRef.current) {
        distanceRef.current = 0;
        setDistance(0);
        setState("idle");
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || window.scrollY > 0 || document.fullscreenElement) return;
      if (isInsideScrollableElement(event.target)) return;

      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
      pullingRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      if (!pullingRef.current || !start || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaY = touch.clientY - start.y;
      const deltaX = touch.clientX - start.x;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        reset();
        return;
      }
      if (deltaY <= 0) return;

      if (event.cancelable) event.preventDefault();

      const nextDistance = Math.min(MAX_DISTANCE_PX, deltaY * 0.55);
      distanceRef.current = nextDistance;
      setDistance(nextDistance);
      setState(nextDistance >= TRIGGER_DISTANCE_PX ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current) return;

      const shouldRefresh = distanceRef.current >= TRIGGER_DISTANCE_PX;
      startRef.current = null;
      pullingRef.current = false;

      if (!shouldRefresh) {
        distanceRef.current = 0;
        setDistance(0);
        setState("idle");
        return;
      }

      refreshingRef.current = true;
      distanceRef.current = TRIGGER_DISTANCE_PX;
      setDistance(TRIGGER_DISTANCE_PX);
      setState("refreshing");
      window.setTimeout(() => window.location.reload(), 120);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);

  const visible = state !== "idle";
  const label = state === "refreshing" ? "Обновляем страницу" : state === "ready" ? "Отпустите, чтобы обновить" : "Потяните, чтобы обновить";

  return (
    <div
      className="pull-to-refresh-indicator fixed left-1/2 top-0 z-[110] flex h-12 items-center gap-2 rounded-b-xl border border-t-0 border-border bg-card px-4 text-sm font-medium text-foreground shadow-lg"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translate3d(-50%, calc(-100% + ${distance}px), 0)`,
        transition: state === "pulling" || state === "ready" ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
      }}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <RefreshIcon spinning={state === "refreshing"} />
      <span>{label}</span>
    </div>
  );
}
