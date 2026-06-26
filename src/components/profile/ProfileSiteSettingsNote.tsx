"use client";

import { useSiteSettings } from "@/components/SiteSettingsProvider";

export function ProfileSiteSettingsNote() {
  const { openSettings } = useSiteSettings();

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Оформление сайта</h2>
      <p className="mt-2 text-sm text-muted">
        Шрифт, тема, размер карточек и другие настройки сохраняются в вашем профиле и подтягиваются при
        входе с любого устройства.
      </p>
      <button
        type="button"
        onClick={openSettings}
        className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/15"
      >
        Открыть настройки
      </button>
    </div>
  );
}
