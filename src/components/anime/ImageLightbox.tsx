"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type LightboxItem = {
  src: string;
  alt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: LightboxItem[];
  index?: number;
  onIndexChange?: (index: number) => void;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function NavIcon({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {direction === "prev" ? (
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function ImageLightbox({ open, onClose, items, index = 0, onIndexChange }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (!onIndexChange || items.length < 2) return;

      if (event.key === "ArrowLeft") {
        onIndexChange((index - 1 + items.length) % items.length);
      } else if (event.key === "ArrowRight") {
        onIndexChange((index + 1) % items.length);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, index, items.length, onIndexChange]);

  if (!mounted || !open || items.length === 0) return null;

  const current = items[Math.min(index, items.length - 1)]!;
  const showNav = items.length > 1 && onIndexChange;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-5xl flex-col items-stretch">
        <div className="mb-2 flex items-center justify-end gap-2">
          {showNav ? (
            <span className="mr-auto text-xs font-medium text-white/75">
              {index + 1} / {items.length}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition hover:bg-black/70"
            aria-label="Закрыть просмотр"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {showNav ? (
            <button
              type="button"
              aria-label="Предыдущее изображение"
              className="absolute left-0 z-20 inline-flex h-11 w-11 -translate-x-1 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition hover:bg-black/70 sm:-translate-x-4"
              onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
            >
              <NavIcon direction="prev" />
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt}
            className="max-h-[min(85dvh,820px)] w-auto max-w-full rounded-lg object-contain shadow-2xl shadow-black/60"
          />

          {showNav ? (
            <button
              type="button"
              aria-label="Следующее изображение"
              className="absolute right-0 z-20 inline-flex h-11 w-11 translate-x-1 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition hover:bg-black/70 sm:translate-x-4"
              onClick={() => onIndexChange((index + 1) % items.length)}
            >
              <NavIcon direction="next" />
            </button>
          ) : null}
        </div>

        {current.alt ? (
          <p className="mt-3 line-clamp-2 text-center text-sm text-white/80">{current.alt}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
