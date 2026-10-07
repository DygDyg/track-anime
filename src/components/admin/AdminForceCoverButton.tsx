"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  COVER_CACHE_BUST_EVENT,
  type CoverCacheBustDetail,
} from "@/components/anime/AnimePosterCover";

type Props = {
  shikimoriId: number;
  /** Круглая кнопка на постере (как лупа) */
  variant?: "inline" | "poster";
};

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={["h-5 w-5", spinning ? "animate-spin" : ""].filter(Boolean).join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        d="M4.5 12a7.5 7.5 0 0113.2-4.8M19.5 12a7.5 7.5 0 01-13.2 4.8"
        strokeLinecap="round"
      />
      <path d="M17 3.5v4h-4M7 20.5v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminForceCoverButton({ shikimoriId, variant = "inline" }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  if (!user?.isAdmin || !shikimoriId) return null;

  async function forceRefresh() {
    if (loading) return;
    setLoading(true);
    setHint(null);
    const bust = String(Date.now());
    try {
      const res = await fetch(`/api/cover?id=${shikimoriId}&force=true&_=${bust}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setHint("Ошибка");
        window.setTimeout(() => setHint(null), 2500);
        return;
      }
      if (res.body) await res.arrayBuffer();
      window.dispatchEvent(
        new CustomEvent<CoverCacheBustDetail>(COVER_CACHE_BUST_EVENT, {
          detail: { shikimoriId, bust },
        }),
      );
      setHint("OK");
      window.setTimeout(() => setHint(null), 2000);
    } catch {
      setHint("Сеть");
      window.setTimeout(() => setHint(null), 2500);
    } finally {
      setLoading(false);
    }
  }

  if (variant === "poster") {
    return (
      <button
        type="button"
        disabled={loading}
        title={hint ?? "Принудительно обновить обложку"}
        aria-label="Принудительно обновить обложку"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void forceRefresh();
        }}
        className="absolute bottom-3 left-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white opacity-90 shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-black/70 disabled:opacity-60 sm:bottom-2 sm:left-2"
      >
        {hint ? (
          <span className="text-[9px] font-bold leading-none">{hint}</span>
        ) : (
          <RefreshIcon spinning={loading} />
        )}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void forceRefresh();
        }}
        className="rounded-md border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
      >
        {loading ? "Обложка…" : "Force обложка"}
      </button>
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </span>
  );
}
