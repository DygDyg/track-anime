"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { KodikSyncHistoryDto, KodikSyncSettingsDto } from "@/lib/admin/kodik-sync-settings";

const TRIGGER_LABELS: Record<string, string> = {
  auto: "Авто",
  manual: "Вручную",
};

const STATUS_LABELS: Record<string, string> = {
  done: "OK",
  error: "Ошибка",
  running: "В процессе",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} мс`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes} мин ${rest} с` : `${minutes} мин`;
}

function formatRelativeMinutes(targetIso: string | null): string {
  if (!targetIso) return "—";
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return "скоро";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `~${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `~${hours} ч ${rest} мин` : `~${hours} ч`;
}

function statusBadgeClass(status: string): string {
  if (status === "done") return adminClass.badgeDone;
  if (status === "error") return adminClass.badgeError;
  if (status === "running") return adminClass.badgeRunning;
  return adminClass.badgeIdle;
}

type SettingsResponse = {
  settings: KodikSyncSettingsDto;
  intervalOptions: number[];
};

export function SyncSettingsPanel({
  initialSettings,
  initialHistory,
  intervalOptions,
}: {
  initialSettings: KodikSyncSettingsDto;
  initialHistory: KodikSyncHistoryDto;
  intervalOptions: number[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [history, setHistory] = useState(initialHistory);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [settingsRes, historyRes] = await Promise.all([
        fetch("/api/admin/sync/settings", { cache: "no-store" }),
        fetch("/api/admin/sync/history?limit=30", { cache: "no-store" }),
      ]);
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as SettingsResponse;
        setSettings(data.settings);
      }
      if (historyRes.ok) {
        const data = (await historyRes.json()) as KodikSyncHistoryDto;
        setHistory(data);
      }
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function savePatch(patch: {
    enabled?: boolean;
    intervalMinutes?: number;
    syncPages?: number;
  }) {
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/sync/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { settings?: KodikSyncSettingsDto; error?: string };
      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }
      if (data.settings) setSettings(data.settings);
      setSaveMessage({ ok: true, text: "Настройки сохранены" });
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
        <h2 className="text-lg font-semibold text-foreground">Автопроверка Kodik</h2>
        <p className="mt-2 text-sm text-muted">
          Cron на сервере запускает проверку каждую минуту; фактический интервал задаётся здесь.
          За один проход обрабатывается до {settings.syncPages * 100} материалов (страницы /list по
          updated_at).
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void savePatch({ enabled: !settings.enabled })}
            className={settings.enabled ? adminClass.btnSmOn : adminClass.btnSmOff}
          >
            {settings.enabled ? "Включено" : "Выключено"}
          </button>
          <span className="text-sm text-muted">
            {settings.enabled
              ? `Следующая проверка: ${formatRelativeMinutes(settings.nextAutoRunAt)}`
              : "Автопроверка отключена"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Интервал проверки</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.intervalMinutes}
              disabled={saving}
              onChange={(event) =>
                void savePatch({ intervalMinutes: Number(event.target.value) })
              }
            >
              {intervalOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} мин
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-muted">Страниц за проверку</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.syncPages}
              disabled={saving}
              onChange={(event) => void savePatch({ syncPages: Number(event.target.value) })}
            >
              {[1, 2, 3, 5, 10].map((pages) => (
                <option key={pages} value={pages}>
                  {pages} ({pages * 100} материалов)
                </option>
              ))}
            </select>
          </label>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Последняя автопроверка</dt>
            <dd className="font-semibold text-foreground">
              {formatDateTime(settings.lastAutoRunAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Настройки обновлены</dt>
            <dd className="font-semibold text-foreground">{formatDateTime(settings.updatedAt)}</dd>
          </div>
        </dl>

        {saveMessage ? (
          <p className={`mt-4 ${saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
            {saveMessage.text}
          </p>
        ) : null}
      </section>

      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Статистика за 24 часа</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className={adminClass.statLabel}>Запусков</p>
            <p className={adminClass.statValue}>{history.stats24h.totalRuns}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Успешных</p>
            <p className={adminClass.statValue}>{history.stats24h.successRuns}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>С ошибкой</p>
            <p className={adminClass.statValue}>{history.stats24h.errorRuns}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Обновлено</p>
            <p className={adminClass.statValue}>{history.stats24h.updatedMaterials}</p>
          </div>
          <div>
            <p className={adminClass.statLabel}>Новых релизов</p>
            <p className={adminClass.statValue}>{history.stats24h.newReleases}</p>
          </div>
        </div>
      </section>

      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">История проверок</h2>
        {history.runs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Проверок пока не было.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className={adminClass.tableHead}>
                  <th className="px-3 py-2">Время</th>
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2 text-right">Проверено</th>
                  <th className="px-3 py-2 text-right">Обновлено</th>
                  <th className="px-3 py-2 text-right">Релизы</th>
                  <th className="px-3 py-2 text-right">Длительность</th>
                </tr>
              </thead>
              <tbody>
                {history.runs.map((run) => (
                  <tr key={run.id} className={adminClass.tableRow}>
                    <td className="px-3 py-2 tabular-nums text-foreground">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {TRIGGER_LABELS[run.trigger] ?? run.trigger}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusBadgeClass(run.status)}>
                        {STATUS_LABELS[run.status] ?? run.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.checkedMaterials.toLocaleString("ru-RU")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.updatedMaterials.toLocaleString("ru-RU")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {run.newReleases.toLocaleString("ru-RU")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatDuration(run.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {history.runs.some((run) => run.error) ? (
          <div className="mt-4 space-y-2">
            {history.runs
              .filter((run) => run.error)
              .slice(0, 3)
              .map((run) => (
                <p key={`err-${run.id}`} className={adminClass.alertError}>
                  {formatDateTime(run.startedAt)}: {run.error}
                </p>
              ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
