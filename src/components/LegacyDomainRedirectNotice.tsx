"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LEGACY_REDIRECT_HOSTS,
  LEGACY_REDIRECT_PARAM,
  LEGACY_REDIRECT_STORAGE_KEY,
} from "@/lib/legacy-domain-redirect";

const LEGACY_HOSTS = new Set<string>(LEGACY_REDIRECT_HOSTS);

const CANONICAL_LINKS = [
  { href: "https://track-anime.github.io", label: "https://track-anime.github.io" },
  { href: "https://track-anime.win/", label: "https://track-anime.win/" },
] as const;

function consumeLegacyRedirectFlag(): boolean {
  if (typeof window === "undefined") return false;

  let flagged = false;

  try {
    if (sessionStorage.getItem(LEGACY_REDIRECT_STORAGE_KEY) === "1") {
      flagged = true;
      sessionStorage.removeItem(LEGACY_REDIRECT_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(LEGACY_REDIRECT_PARAM) === "1") {
    flagged = true;
    url.searchParams.delete(LEGACY_REDIRECT_PARAM);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next || "/");
  }

  try {
    if (document.referrer) {
      const refHost = new URL(document.referrer).hostname.toLowerCase();
      if (LEGACY_HOSTS.has(refHost)) flagged = true;
    }
  } catch {
    /* ignore */
  }

  return flagged;
}

/**
 * Centered notice when the browser arrived from ta.dygdyg.ru / track-anime.dygdyg.ru.
 * Marked by ?legacy_redirect=1 (nginx HTML bounce) / sessionStorage / referrer.
 */
export function LegacyDomainRedirectNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!consumeLegacyRedirectFlag()) return;
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legacy-domain-redirect-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="legacy-domain-redirect-title" className="text-lg font-semibold text-foreground">
            Ссылки скоро перестанут работать
          </h2>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Адреса <span className="text-foreground">ta.dygdyg.ru</span> и{" "}
          <span className="text-foreground">track-anime.dygdyg.ru</span> больше не будут
          поддерживаться. Сохраните актуальную ссылку:
        </p>
        <ul className="mt-4 space-y-2">
          {CANONICAL_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="block rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-accent hover:border-accent/40 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
