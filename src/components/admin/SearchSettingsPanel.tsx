"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { SearchSettingsDto } from "@/lib/search-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: SearchSettingsDto;
  minHeaderSearchDebounceMs: number;
  maxHeaderSearchDebounceMs: number;
};

export function SearchSettingsPanel({
  initialSettings,
  minHeaderSearchDebounceMs,
  maxHeaderSearchDebounceMs,
}: {
  initialSettings: SearchSettingsDto;
  minHeaderSearchDebounceMs: number;
  maxHeaderSearchDebounceMs: number;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [debounceInput, setDebounceInput] = useState(String(initialSettings.headerSearchDebounceMs));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/search/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
      setDebounceInput(String(data.settings.headerSearchDebounceMs));
    } catch {
      /* ignore */
    }
  }, []);

  async function save() {
    setSaving(true);
    setSaveMessage(null);

    const headerSearchDebounceMs = Number.parseInt(debounceInput, 10);
    if (
      !Number.isInteger(headerSearchDebounceMs) ||
      headerSearchDebounceMs < minHeaderSearchDebounceMs ||
      headerSearchDebounceMs > maxHeaderSearchDebounceMs
    ) {
      setSaveMessage({
        ok: false,
        text: `Укажите целое число от ${minHeaderSearchDebounceMs} до ${maxHeaderSearchDebounceMs} мс`,
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/search/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headerSearchDebounceMs }),
      });
      const data = (await res.json()) as { settings?: SearchSettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setDebounceInput(String(data.settings.headerSearchDebounceMs));
      }
      setSaveMessage({ ok: true, text: "Настройки поиска сохранены" });
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
        <h2 className="text-lg font-semibold text-foreground">Поиск</h2>
        <p className="mt-2 text-sm text-muted">
          Настройки влияют на подсказки поиска в шапке сайта. Быстрый поиск на странице результатов
          запускается по кнопке «Найти».
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">Задержка поиска в шапке, мс</span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={minHeaderSearchDebounceMs}
              max={maxHeaderSearchDebounceMs}
              step={100}
              value={debounceInput}
              onChange={(event) => setDebounceInput(event.target.value)}
              className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            />
            <span className="text-muted">
              сейчас сохранено: {settings.headerSearchDebounceMs} мс
            </span>
          </div>
          <span className="text-xs text-muted">
            Допустимо {minHeaderSearchDebounceMs}–{maxHeaderSearchDebounceMs} мс. Увеличение
            задержки снижает частоту запросов при наборе.
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
            <p className={saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}>
              {saveMessage.text}
            </p>
          ) : null}
        </div>

        <p className="text-xs text-muted">Обновлено: {formatDateTime(settings.updatedAt)}</p>
      </section>
    </div>
  );
}
