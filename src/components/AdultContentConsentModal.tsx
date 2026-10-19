"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import {
  focusTvElement,
  getTvFocusableElements,
  invalidateTvFocusableCache,
  markTvNavigationActive,
  registerTvModalClose,
} from "@/lib/tv-navigation";

type Props = {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
};

/** Общий баннер согласия 18+ (плеер Ocean и чекбокс в настройках). */
export function AdultContentConsentModal({ open, onAccept, onCancel }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    markTvNavigationActive();
    invalidateTvFocusableCache();
    registerTvModalClose(() => {
      onCancel();
      return true;
    });

    const focusTimer = window.setTimeout(() => {
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"][data-adult-consent-modal="true"]',
      );
      if (!dialog) return;
      const focusables = getTvFocusableElements(dialog);
      focusTvElement(focusables[0] ?? dialog);
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      registerTvModalClose(null);
      window.clearTimeout(focusTimer);
    };
  }, [onCancel, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/75"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        data-adult-consent-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl shadow-black/50 sm:rounded-2xl"
      >
        <header className="border-b border-border px-4 py-4 sm:px-5">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            Контент 18+
          </h2>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-muted sm:px-5">
          <p>
            Этот раздел содержит материалы сексуального характера, предназначенные{" "}
            <strong className="font-medium text-foreground">только для совершеннолетних</strong>.
          </p>
          <p>Нажимая «Мне есть 18», вы подтверждаете, что:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              вам исполнилось <strong className="font-medium text-foreground">18 лет</strong> (или
              вы достигли совершеннолетия в вашей юрисдикции);
            </li>
            <li>
              просмотр такого контента{" "}
              <strong className="font-medium text-foreground">не запрещён</strong> законодательством
              вашей страны;
            </li>
            <li>
              вы запрашиваете доступ{" "}
              <strong className="font-medium text-foreground">осознанно</strong>.
            </li>
          </ul>
          <p className="text-foreground/90">Лицам младше 18 лет доступ запрещён.</p>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-dim hover:text-foreground"
          >
            Мне нет 18
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            Мне есть 18 — согласен
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
