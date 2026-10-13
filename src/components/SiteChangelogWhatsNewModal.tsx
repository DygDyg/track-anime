"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import {
  fetchCompletedSiteChangelog,
  isWhatsNewForceParam,
  SiteChangelogEntriesStack,
} from "@/components/SiteChangelogEntries";
import type { SiteChangelogEntry } from "@/lib/site-changelog-types";
import {
  focusTvElement,
  getTvFocusableElements,
  invalidateTvFocusableCache,
  markTvNavigationActive,
  registerTvModalClose,
} from "@/lib/tv-navigation";

const SHOW_DELAY_MS = 800;

function WhatsNewModalInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings, settingsReady, updateSettings } = useSiteSettings();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<SiteChangelogEntry[]>([]);
  const decidedRef = useRef(false);
  const forceHandledRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stripWhatsNewParam = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("whatsNew")) return;
    params.delete("whatsNew");
    const query = params.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    router.replace(next, { scroll: false });
  }, [pathname, router]);

  const openWithEntries = useCallback((next: SiteChangelogEntry[]) => {
    setEntries(next);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const force = isWhatsNewForceParam(searchParams.get("whatsNew"));
    if (force) {
      if (forceHandledRef.current) return;
      forceHandledRef.current = true;
      decidedRef.current = true;
      void (async () => {
        const list = await fetchCompletedSiteChangelog();
        openWithEntries(list);
        stripWhatsNewParam();
      })();
      return;
    }

    if (!settingsReady || decidedRef.current) return;
    if (!settings.showWhatsNewChangelog) {
      decidedRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        if (decidedRef.current) return;
        decidedRef.current = true;
        const list = await fetchCompletedSiteChangelog();
        const newest = list[0];
        if (!newest) return;
        if (newest.id === settings.lastSeenChangelogDayId) return;
        openWithEntries(list);
      })();
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    mounted,
    openWithEntries,
    searchParams,
    settings.lastSeenChangelogDayId,
    settings.showWhatsNewChangelog,
    settingsReady,
    stripWhatsNewParam,
  ]);

  const close = useCallback(() => {
    const newestId = entries[0]?.id ?? null;
    if (newestId && newestId !== settings.lastSeenChangelogDayId) {
      updateSettings({ lastSeenChangelogDayId: newestId });
    }
    setOpen(false);
  }, [entries, settings.lastSeenChangelogDayId, updateSettings]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" ||
        event.key === "Back" ||
        event.key === "BrowserBack" ||
        event.key === "XF86Back"
      ) {
        event.preventDefault();
        close();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    registerTvModalClose(() => {
      close();
      return true;
    });

    const focusTimer = window.setTimeout(() => {
      invalidateTvFocusableCache();
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"][data-whats-new-modal="true"]',
      );
      if (!dialog) return;
      const focusables = getTvFocusableElements(dialog);
      focusTvElement(focusables[0] ?? dialog);
      markTvNavigationActive();
    }, 0);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      registerTvModalClose(null);
      window.clearTimeout(focusTimer);
    };
  }, [close, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Закрыть нововведения"
        className="absolute inset-0 bg-black/70"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        data-whats-new-modal="true"
        aria-labelledby="whats-new-title"
        className="relative flex max-h-[min(92dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl shadow-black/40 sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id="whats-new-title" className="text-lg font-semibold text-foreground">
              Что нового
            </h2>
            <p className="mt-1 text-sm text-muted">Обновления сайта за завершённые дни</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface-dim hover:text-foreground"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <SiteChangelogEntriesStack entries={entries} />
        </div>
        <footer className="flex justify-end border-t border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            Понятно
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Auto + `?whatsNew=1` modal for completed site changelog days. */
export function SiteChangelogWhatsNewModal() {
  return (
    <Suspense fallback={null}>
      <WhatsNewModalInner />
    </Suspense>
  );
}
