"use client";

import { useCallback, useEffect, useState } from "react";
import { PwaInstallIcon } from "@/components/PwaInstallIcon";
import { isIosSafari, isStandaloneMode, usePwaInstall } from "@/hooks/usePwaInstall";
import { SITE_NAME } from "@/lib/site-brand";

const DISMISS_KEY = "ta-pwa-install-dismissed";

export function PwaInstallPrompt() {
  const { canInstall, install } = usePwaInstall();
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneMode()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    if (isIosSafari()) {
      setShowIosHint(true);
      setHidden(false);
    }
  }, []);

  useEffect(() => {
    if (canInstall && localStorage.getItem(DISMISS_KEY) !== "1") {
      setHidden(false);
    }
  }, [canInstall]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
    setShowIosHint(false);
  }, []);

  const handleInstall = useCallback(async () => {
    const accepted = await install();
    if (accepted) dismiss();
  }, [dismiss, install]);

  if (hidden || (!canInstall && !showIosHint)) return null;

  return (
    <div
      role="region"
      aria-label="Установка приложения"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm sm:left-auto"
    >
      <p className="text-sm font-medium text-foreground">Установить {SITE_NAME}</p>
      <p className="mt-1 text-xs text-muted">
        {showIosHint && !canInstall
          ? "Нажмите «Поделиться» в Safari и выберите «На экран Домой»."
          : "Добавьте на главный экран для быстрого доступа к новым сериям и спискам."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canInstall ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white transition hover:brightness-110"
            aria-label="Установить приложение"
            title="Установить приложение"
          >
            <PwaInstallIcon />
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
