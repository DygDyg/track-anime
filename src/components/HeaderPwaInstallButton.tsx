"use client";

import { headerControl } from "@/components/header/header-styles";
import { PwaInstallIcon } from "@/components/PwaInstallIcon";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function HeaderPwaInstallButton() {
  const { canInstall, install } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void install()}
      className={`${headerControl.icon} text-muted hover:text-foreground`}
      aria-label="Установить приложение"
      title="Установить приложение"
    >
      <PwaInstallIcon />
    </button>
  );
}
