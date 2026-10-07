"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isTrackAnimeAndroidApp } from "@/lib/android-app";
import { isStandaloneMode } from "@/hooks/usePwaInstall";
import { SITE_NAME } from "@/lib/site-brand";

/** localStorage: timestamp until which the soft prompt stays hidden */
export const APP_PROMO_DISMISS_UNTIL_KEY = "ta:app-promo-dismiss-until";
/** localStorage: number of page loads on Android browser (for delayed first show) */
export const APP_PROMO_VISIT_COUNT_KEY = "ta:app-promo-visit-count";

const DISMISS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const MIN_VISITS_BEFORE_SHOW = 2;
const SHOW_DELAY_MS = 4_000;

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(APP_PROMO_DISMISS_UNTIL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (Date.now() < until) return true;
    localStorage.removeItem(APP_PROMO_DISMISS_UNTIL_KEY);
    return false;
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(APP_PROMO_DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    /* ignore */
  }
}

function bumpVisitCount(): number {
  try {
    const next = Number(localStorage.getItem(APP_PROMO_VISIT_COUNT_KEY) || "0") + 1;
    localStorage.setItem(APP_PROMO_VISIT_COUNT_KEY, String(next));
    return next;
  } catch {
    return MIN_VISITS_BEFORE_SHOW;
  }
}

/** Android mobile browser only — not APK / TV / PWA / iOS / desktop. */
export function isAndroidAppPromoTarget(): boolean {
  if (typeof window === "undefined") return false;
  if (isTrackAnimeAndroidApp()) return false;
  if (isStandaloneMode()) return false;
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  if (/Android TV|GoogleTV|BRAVIA|AFT\w|MiBOX|SHIELD/i.test(ua)) return false;
  if (window.matchMedia("(pointer: fine) and (min-width: 900px)").matches) return false;
  return true;
}

function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Full-width opaque banner under the header (mobile Android browser).
 * Sets --site-app-promo-banner-height from measured height.
 */
export function AndroidAppPromoPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAndroidAppPromoTarget()) return;
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
        const data = (await res.json()) as { settings?: { enabled?: boolean } };
        if (!data.settings?.enabled) return;
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
    if (!visible) {
      document.documentElement.style.removeProperty("--site-app-promo-banner-height");
      document.documentElement.removeAttribute("data-app-promo-banner");
      return;
    }

    const root = document.documentElement;
    root.setAttribute("data-app-promo-banner", "true");

    const el = bannerRef.current;
    if (!el) return;

    const sync = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      root.style.setProperty("--site-app-promo-banner-height", `${height}px`);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);

    return () => {
      ro.disconnect();
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
      ref={bannerRef}
      role="region"
      aria-label="Приложение для Android"
      className="relative border-t border-border bg-card md:hidden"
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Приложение {SITE_NAME}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            Без рекламы и с уведомлениями о новых сериях — даже когда сайт закрыт.
          </p>
        </div>
        <Link
          href="/app"
          onClick={dismiss}
          className="mt-0.5 shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
        >
          Скачать
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-foreground/5 hover:text-foreground"
          aria-label="Закрыть"
          title="Закрыть"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
