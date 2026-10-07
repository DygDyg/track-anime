"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { headerControl } from "@/components/header/header-styles";
import { PwaInstallIcon } from "@/components/PwaInstallIcon";
import { isTrackAnimeAndroidApp } from "@/lib/android-app";
import { isTrackAnimeWindowsApp } from "@/lib/windows-app";

const LABEL = "Скачать приложение";

/**
 * Desktop (md+) header button → /app. Hidden in native shells and when
 * AppPromoSettings.desktopEnabled is false. Below 1300px shows icon only.
 */
export function HeaderAndroidAppButton() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isTrackAnimeAndroidApp() || isTrackAnimeWindowsApp()) {
      setShow(false);
      return;
    }

    let cancelled = false;
    void fetch("/api/settings/app-promo", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: { desktopEnabled?: boolean } };
        if (!cancelled) setShow(Boolean(data.settings?.desktopEnabled));
      })
      .catch(() => {
        if (!cancelled) setShow(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const active = pathname === "/app" || pathname.startsWith("/app/");

  return (
    <Link
      href="/app"
      className={[
        headerControl.textMuted,
        "hidden shrink-0 gap-1.5 md:inline-flex",
        "max-[1299px]:w-10 max-[1299px]:justify-center max-[1299px]:gap-0 max-[1299px]:px-0",
        active ? "text-accent hover:text-accent" : "",
      ].join(" ")}
      aria-label={LABEL}
      title="Без рекламы и с уведомлениями о новых сериях"
    >
      <PwaInstallIcon className="h-4 w-4 max-[1299px]:h-5 max-[1299px]:w-5" />
      <span className="max-[1299px]:hidden">{LABEL}</span>
    </Link>
  );
}
