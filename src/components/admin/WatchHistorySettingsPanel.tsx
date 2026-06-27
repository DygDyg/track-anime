"use client";

import { useCallback, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { WatchHistorySettingsDto } from "@/lib/admin/watch-history-settings";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

type SettingsResponse = {
  settings: WatchHistorySettingsDto;
  minCompleteEpisodeThresholdPct: number;
  maxCompleteEpisodeThresholdPct: number;
};

export function WatchHistorySettingsPanel({
  initialSettings,
  minThresholdPct,
  maxThresholdPct,
}: {
  initialSettings: WatchHistorySettingsDto;
  minThresholdPct: number;
  maxThresholdPct: number;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [thresholdInput, setThresholdInput] = useState(String(initialSettings.completeEpisodeThresholdPct));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/watch-history/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsResponse;
      setSettings(data.settings);
      setThresholdInput(String(data.settings.completeEpisodeThresholdPct));
    } catch {
      /* ignore */
    }
  }, []);

  async function save() {
    setSaving(true);
    setSaveMessage(null);

    const completeEpisodeThresholdPct = Number.parseInt(thresholdInput, 10);
    if (
      !Number.isInteger(completeEpisodeThresholdPct) ||
      completeEpisodeThresholdPct < minThresholdPct ||
      completeEpisodeThresholdPct > maxThresholdPct
    ) {
      setSaveMessage({
        ok: false,
        text: `Укажите целое число от ${minThresholdPct} до ${maxThresholdPct}`,
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/watch-history/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeEpisodeThresholdPct }),
      });
      const data = (await res.json()) as { settings?: WatchHistorySettingsDto; error?: string };

      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        setThresholdInput(String(data.settings.completeEpisodeThresholdPct));
      }
      setSaveMessage({ ok: true, text: "Настройки истории сохранены" });
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
        <h2 className="text-lg font-semibold text-foreground">История просмотра</h2>
        <p className="mt-2 text-sm text-muted">
          Когда пользователь досматривает последнюю серию сезона дальше заданного процента длительности,
          запись об этом тайтле автоматически удаляется из истории на сайте.
        </p>
      </section>

      <section className={`${adminClass.panel} space-y-4`}>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">
            Порог удаления из истории, % длительности последней серии
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={minThresholdPct}
              max={maxThresholdPct}
              step={1}
              value={thresholdInput}
              onChange={(event) => setThresholdInput(event.target.value)}
              className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            />
            <span className="text-muted">% (сейчас сохранено: {settings.completeEpisodeThresholdPct}%)</span>
          </div>
          <span className="text-xs text-muted">
            Допустимо {minThresholdPct}–{maxThresholdPct}. По умолчанию 50% — как раньше на сайте.
            Сравнение строго больше порога: при 50% удаление после 50% + 1 секунда эпизода.
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
