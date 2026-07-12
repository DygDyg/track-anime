"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { headerControl } from "@/components/header/header-styles";
import { RecentAnimeOpensSettingsTab } from "@/components/settings/RecentAnimeOpensSettingsTab";

function RecentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RecentAnimeOpensButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          headerControl.icon,
          open ? "text-accent hover:text-accent" : "text-muted hover:text-foreground",
        ].join(" ")}
        aria-label="Недавно открытые"
        aria-expanded={open}
        title="Недавно открытые"
      >
        <RecentIcon />
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
              <button
                type="button"
                aria-label="Закрыть недавние"
                className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="recent-anime-opens-title"
                className="relative flex max-h-[min(86dvh,620px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl shadow-black/40 sm:rounded-2xl"
              >
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                  <div>
                    <h2 id="recent-anime-opens-title" className="text-lg font-semibold text-foreground">
                      Недавние
                    </h2>
                    <p className="mt-1 text-sm text-muted">Последние открытые страницы аниме</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-2 text-muted transition hover:bg-foreground/5 hover:text-foreground"
                    aria-label="Закрыть"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                  <RecentAnimeOpensSettingsTab />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
