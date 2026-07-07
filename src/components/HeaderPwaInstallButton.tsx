"use client";

import { headerControl } from "@/components/header/header-styles";
import { PwaInstallIcon } from "@/components/PwaInstallIcon";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function HeaderPwaInstallButton() {
  const { canInstall, install, installing } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void install()}
      disabled={installing}
      aria-busy={installing || undefined}
      className={[
        headerControl.icon,
        "text-muted hover:text-foreground",
        installing ? "cursor-wait opacity-70" : "",
      ].join(" ")}
      aria-label="Установить приложение"
      title={installing ? "Установка…" : "Установить приложение"}
    >
      {installing ? <LoadingSpinner size="sm" /> : <PwaInstallIcon />}
    </button>
  );
}
