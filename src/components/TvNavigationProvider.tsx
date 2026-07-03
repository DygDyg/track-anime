"use client";

import { useEffect } from "react";
import {
  findTvFocusNeighbor,
  focusTvElement,
  getInitialTvFocusTarget,
  getTvFocusableElements,
  handleTvBackNavigation,
  isTvBackKey,
  markTvNavigationActive,
  shouldIgnoreTvNavigation,
  type TvNavDirection,
} from "@/lib/tv-navigation";

const DIRECTION_KEYS: Record<string, TvNavDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "MediaEnter";
}

function activateTvCard(element: HTMLElement): boolean {
  const card = element.closest<HTMLElement>("[data-tv-card]");
  if (!card || card !== element) return false;

  const link = card.querySelector("a[href]");
  if (link instanceof HTMLAnchorElement) {
    link.click();
    return true;
  }

  return false;
}

function isTvLikeDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export function TvNavigationProvider() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreTvNavigation(event)) return;

      const direction = DIRECTION_KEYS[event.key];
      if (direction) {
        const active = document.activeElement;
        const current =
          active instanceof HTMLElement && active !== document.body ? active : null;
        const focusables = getTvFocusableElements();
        const focusedInScope = Boolean(current && focusables.includes(current));
        const tvNavActive = document.documentElement.dataset.tvNav === "true";
        const tvLike = isTvLikeDevice();

        if (!tvLike && !tvNavActive && !focusedInScope) {
          return;
        }

        event.preventDefault();
        markTvNavigationActive();

        const next = current
          ? findTvFocusNeighbor(current, direction)
          : getInitialTvFocusTarget();

        if (next) {
          focusTvElement(next);
        } else if (!current) {
          const initial = getInitialTvFocusTarget();
          if (initial) focusTvElement(initial);
        }
        return;
      }

      if (isActivationKey(event.key)) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && activateTvCard(active)) {
          event.preventDefault();
        }
        return;
      }

      if (isTvBackKey(event.key)) {
        if (handleTvBackNavigation()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Backspace" && document.documentElement.dataset.tvNav === "true") {
        if (handleTvBackNavigation()) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
