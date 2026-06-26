"use client";

import { useEffect } from "react";

const listeners = new Set<() => void>();
let intervalId: number | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (intervalId === null) {
    intervalId = window.setInterval(() => {
      listeners.forEach((cb) => cb());
    }, 60_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function useMinuteTicker(onTick: () => void) {
  useEffect(() => subscribe(onTick), [onTick]);
}
