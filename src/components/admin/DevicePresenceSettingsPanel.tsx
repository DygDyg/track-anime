"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { DevicePresenceSettingsDto } from "@/lib/admin/device-presence-settings";

type SettingsResponse = {
  settings: DevicePresenceSettingsDto;
  minTtlHours: number;
  maxTtlHours: number;
};

export function DevicePresenceSettingsPanel({
  initialSettings,
  minTtlHours,
  maxTtlHours,
}: {
  initialSettings: DevicePresenceSettingsDto;
  minTtlHours: number;
  maxTtlHours: number;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [ttlInput, setTtlInput] = useState(String(initialSettings.ttlHours));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/device-presence/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
      setTtlInput(String(data.settings.ttlHours));
    } catch {
      /* ignore */
    }
  }, []);

  async function save() {
    setSaving(true);
    setSaveMessage(null);

    const ttlHours = Number.parseInt(ttlInput, 10);
    if (!Number.isInteger(ttlHours) || ttlHours < minTtlHours || ttlHours > maxTtlHours) {
      setSaveMessage({
        ok: false,
        text: `Укажите целое число от ${minTtlHours} до ${maxTtlHours}`,
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/device-presence/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttlHours }),
      });
      const data = (await res.json()) as { settings?: DevicePresenceSettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setTtlInput(String(data.settings.ttlHours));
      }
      setSaveMessage({ ok: true, text: "Настройки устройств сохранены" });
      void refresh();
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Устройства</h2>
        <p className="mt-2 text-sm text-muted">
          В меню профиля у пользователя есть список устройств с последней открытой вкладкой. Устройства без
          активности дольше указанного срока скрываются из списка.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">
            Срок хранения последней вкладки (часы)
          </span>
          <input
            type="number"
            min={minTtlHours}
            max={maxTtlHours}
            step={1}
            value={ttlInput}
            onChange={(e) => setTtlInput(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
          <span className="text-xs text-muted">
            От {minTtlHours} до {maxTtlHours} часов. Сейчас: {settings.ttlHours} ч.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className={adminClass.btnPrimary}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {saveMessage ? (
            <span className={saveMessage.ok ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
              {saveMessage.text}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
