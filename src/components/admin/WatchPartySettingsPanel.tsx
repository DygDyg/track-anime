"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { WatchPartySettingsDto } from "@/lib/admin/watch-party-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: WatchPartySettingsDto;
};

export function WatchPartySettingsPanel({
  initialSettings,
}: {
  initialSettings: WatchPartySettingsDto;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/watch-party/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
    } catch {
      /* ignore */
    }
  }, []);

  async function save(patch: Partial<Pick<WatchPartySettingsDto, "enabled" | "allowGuests">>) {
    setSaving(true);
    setSaveMessage(null);

    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);

    try {
      const res = await fetch("/api/admin/watch-party/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { settings?: WatchPartySettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        setSettings(settings);
        return;
      }

      if (data.settings) setSettings(data.settings);
      setSaveMessage({ ok: true, text: "Настройки совместного просмотра сохранены" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Совместный просмотр</h2>
        <p className="mt-2 text-sm text-muted">
          Глобальные настройки WebSocket-комнат beta-плеера. Комнаты хранятся в памяти
          отдельного процесса и исчезают при его перезапуске.
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
            <span className="block font-medium text-foreground">Включить совместный просмотр</span>
            <span className="mt-1 block text-xs text-muted">
              Если выключено, кнопка создания комнаты и авто-вход по invite-ссылке скрыты.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            checked={settings.allowGuests}
            disabled={saving || !settings.enabled}
            onChange={(event) => void save({ allowGuests: event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          />
          <span>
            <span className="block font-medium text-foreground">
              Разрешить вход незарегистрированным пользователям
            </span>
            <span className="mt-1 block text-xs text-muted">
              Гости получают локальное случайное имя вида «Гость 1234».
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
