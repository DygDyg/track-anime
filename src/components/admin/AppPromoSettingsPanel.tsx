"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { AppPromoSettingsDto } from "@/lib/admin/app-promo-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: AppPromoSettingsDto;
  error?: string;
};

export function AppPromoSettingsPanel({
  initialSettings,
}: {
  initialSettings: AppPromoSettingsDto;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/app-promo/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      if (data.settings) setSettings(data.settings);
    } catch {
      /* ignore */
    }
  }, []);

  async function save(patch: Partial<Pick<AppPromoSettingsDto, "enabled" | "desktopEnabled">>) {
    setSaving(true);
    setSaveMessage(null);
    const previous = settings;
    setSettings({ ...settings, ...patch });

    try {
      const res = await fetch("/api/admin/app-promo/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as SettingsResponse;

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        setSettings(previous);
        return;
      }

      if (data.settings) setSettings(data.settings);
      const labels: string[] = [];
      if (patch.enabled !== undefined) {
        labels.push(patch.enabled ? "мобильное промо включено" : "мобильное промо выключено");
      }
      if (patch.desktopEnabled !== undefined) {
        labels.push(patch.desktopEnabled ? "промо на ПК включено" : "промо на ПК выключено");
      }
      setSaveMessage({ ok: true, text: labels.join("; ") || "Сохранено" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
      setSettings(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Промо приложений</h2>
        <p className="mt-2 text-sm text-muted">
          Мобильный и десктопный каналы включаются отдельно. Страница{" "}
          <a href="/app" className="text-accent hover:underline">
            /app
          </a>{" "}
          и пункт «Приложение» в меню профиля остаются доступны всегда.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={saving}
            onChange={(event) => void save({ enabled: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">Промо на телефоне (Android)</span>
            <span className="mt-1 block text-xs text-muted">
              Soft-banner под шапкой в Android-браузере и намёк в настройках уведомлений.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={settings.desktopEnabled}
            disabled={saving}
            onChange={(event) => void save({ desktopEnabled: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">Промо на ПК</span>
            <span className="mt-1 block text-xs text-muted">
              Soft-banner под шапкой на десктопе и кнопка «Скачать приложение» перед поиском.
            </span>
          </span>
        </label>

        {saveMessage ? (
          <p className={saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}>
            {saveMessage.text}
          </p>
        ) : null}

        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
      </section>
    </div>
  );
}
