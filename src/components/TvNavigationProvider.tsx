"use client";

import { useEffect } from "react";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  exitTvSearchEditingIfNeeded,
  findTvFocusNeighbor,
  focusTvElement,
  getInitialTvFocusTarget,
  getTvFocusableElements,
  handleTvBackNavigation,
  installAndroidBackBridge,
  isTvBackKey,
  isTvChromeElement,
  isTvPageNearTop,
  markTvNavigationActive,
  isTvNavigationSessionActive,
  scrollTvPageUp,
  shouldIgnoreTvNavigation,
  startTvFocusableCacheWatch,
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
  const { settings } = useSiteSettings();

  useEffect(() => {
    if (settings.tvNavigationEnabled) return;
    delete document.documentElement.dataset.tvNav;
  }, [settings.tvNavigationEnabled]);

  useEffect(() => {
    if (!settings.tvNavigationEnabled) return;
    return startTvFocusableCacheWatch();
  }, [settings.tvNavigationEnabled]);

  useEffect(() => {
    return installAndroidBackBridge();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!settings.tvNavigationEnabled) return;

      const active = document.activeElement;
      const modalScope = active instanceof HTMLElement
        ? active.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
        : null;
      // Modal open but focus still outside (e.g. gear button) — keep arrows inside dialog.
      const openModal =
        modalScope ??
        document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const navRoot = openModal ?? document;

      if (!openModal && shouldIgnoreTvNavigation(event)) return;

      const direction = DIRECTION_KEYS[event.key];
      if (direction) {
        const current =
          active instanceof HTMLElement && active !== document.body ? active : null;
        const root = navRoot;
        let focusables = getTvFocusableElements(root);
        const focusedInScope = Boolean(current && focusables.includes(current));
        const tvNavActive = isTvNavigationSessionActive();
        const tvLike = isTvLikeDevice();

        if (!tvLike && !tvNavActive && !focusedInScope && !openModal) {
          return;
        }

        event.preventDefault();
        markTvNavigationActive();

        let navCurrent =
          current && focusables.includes(current) ? current : null;

        // Leave search editing on D-pad so focus can move away cleanly.
        if (exitTvSearchEditingIfNeeded()) {
          focusables = getTvFocusableElements(root);
          const after = document.activeElement;
          if (after instanceof HTMLElement && focusables.includes(after)) {
            navCurrent = after;
          }
        }

        // Mid-page Up must not jump into the header — only from page top (or Back).
        if (
          !openModal &&
          direction === "up" &&
          navCurrent &&
          !isTvChromeElement(navCurrent) &&
          !isTvPageNearTop()
        ) {
          focusables = focusables.filter((el) => !isTvChromeElement(el));
        }

        const next = navCurrent
          ? findTvFocusNeighbor(navCurrent, direction, root, focusables)
          : getInitialTvFocusTarget(root, focusables);

        if (next) {
          focusTvElement(next);
        } else if (
          !openModal &&
          direction === "up" &&
          navCurrent &&
          !isTvChromeElement(navCurrent) &&
          !isTvPageNearTop()
        ) {
          scrollTvPageUp();
        } else if (!navCurrent) {
          const initial = getInitialTvFocusTarget(root, focusables);
          if (initial) focusTvElement(initial);
        }
        return;
      }

      if (isActivationKey(event.key)) {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && activateTvCard(activeEl)) {
          event.preventDefault();
        }
        return;
      }

      if (isTvBackKey(event.key)) {
        if (handleTvBackNavigation()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (event.key === "Backspace" && isTvNavigationSessionActive()) {
        if (handleTvBackNavigation()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [settings.tvNavigationEnabled]);

  return null;
}
