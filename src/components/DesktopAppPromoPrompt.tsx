"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isTrackAnimeAndroidApp } from "@/lib/android-app";
import { isTrackAnimeWindowsApp } from "@/lib/windows-app";
import { isStandaloneMode } from "@/hooks/usePwaInstall";
import { SITE_NAME } from "@/lib/site-brand";

/** localStorage: dismiss until timestamp for desktop soft prompt */
export const DESKTOP_APP_PROMO_DISMISS_UNTIL_KEY = "ta:app-promo-desktop-dismiss-until";
export const DESKTOP_APP_PROMO_VISIT_COUNT_KEY = "ta:app-promo-desktop-visit-count";

const DISMISS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const MIN_VISITS_BEFORE_SHOW = 2;
const SHOW_DELAY_MS = 5_000;
const BANNER_HEIGHT = "2.5rem";

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DESKTOP_APP_PROMO_DISMISS_UNTIL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (Date.now() < until) return true;
    localStorage.removeItem(DESKTOP_APP_PROMO_DISMISS_UNTIL_KEY);
    return false;
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DESKTOP_APP_PROMO_DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    /* ignore */
  }
}

function bumpVisitCount(): number {
  try {
    const next = Number(localStorage.getItem(DESKTOP_APP_PROMO_VISIT_COUNT_KEY) || "0") + 1;
    localStorage.setItem(DESKTOP_APP_PROMO_VISIT_COUNT_KEY, String(next));
    return next;
  } catch {
    return MIN_VISITS_BEFORE_SHOW;
  }
}

/** Desktop browser only — not native shells / PWA / narrow mobile layout. */
export function isDesktopAppPromoTarget(): boolean {
  if (typeof window === "undefined") return false;
  if (isTrackAnimeAndroidApp() || isTrackAnimeWindowsApp()) return false;
  if (isStandaloneMode()) return false;
  return window.matchMedia("(min-width: 768px)").matches;
}

function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Full-width temporary banner under the main header row (desktop only).
 * Adjusts --site-app-promo-banner-height so main/sticky offsets stay correct.
 */
export function DesktopAppPromoPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDesktopAppPromoTarget()) return;
    if (pathname.startsWith("/app") || pathname.startsWith("/admin") || pathname.startsWith("/application")) {
      return;
    }
    if (readDismissed()) return;

    const visits = bumpVisitCount();
    if (visits < MIN_VISITS_BEFORE_SHOW) return;

    let cancelled = false;
    let showTimer: number | undefined;

    void (async () => {
      try {
        const res = await fetch("/api/settings/app-promo", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: { desktopEnabled?: boolean } };
        if (!data.settings?.desktopEnabled) return;
        if (cancelled) return;
        showTimer = window.setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, SHOW_DELAY_MS);
      } catch {
        /* fail closed */
      }
    })();

    return () => {
      cancelled = true;
      if (showTimer !== undefined) window.clearTimeout(showTimer);
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (visible) {
      root.style.setProperty("--site-app-promo-banner-height", BANNER_HEIGHT);
      root.setAttribute("data-app-promo-banner", "true");
    } else {
      root.style.removeProperty("--site-app-promo-banner-height");
      root.removeAttribute("data-app-promo-banner");
    }
    return () => {
      root.style.removeProperty("--site-app-promo-banner-height");
      root.removeAttribute("data-app-promo-banner");
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    writeDismissed();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Приложение на телефон"
      className="relative hidden border-t border-border bg-card md:block"
    >
      <div className="flex h-10 items-center gap-3 px-3 sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
          <span className="font-medium">Приложение на телефон</span>
          <span className="text-muted">
            {" "}
            — у {SITE_NAME} есть Android-приложение без рекламы и с уведомлениями о новых сериях.
          </span>
        </p>
        <Link
          href="/app"
          onClick={dismiss}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
        >
          Скачать
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground"
          aria-label="Закрыть"
          title="Закрыть"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
