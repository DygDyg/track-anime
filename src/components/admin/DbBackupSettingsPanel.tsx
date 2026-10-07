"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import {
  formatBytes,
  type DbBackupHistoryDto,
  type DbBackupRunDto,
  type DbBackupTableStat,
} from "@/lib/admin/db-backup-format";
import type { DbBackupSettingsDto } from "@/lib/admin/db-backup-settings-types";

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

function formatRelativeHours(targetIso: string | null): string {
  if (!targetIso) return "—";
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return "скоро";
  const hours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (hours < 48) return `~${hours} ч`;
  const days = Math.ceil(hours / 24);
  return `~${days} д`;
}

function intervalLabel(hours: number): string {
  if (hours < 24) return `${hours} ч`;
  if (hours === 24) return "1 сутки";
  if (hours === 48) return "2 суток";
  if (hours === 72) return "3 суток";
  if (hours === 168) return "1 неделя";
  return `${hours} ч`;
}

function maxFileLabel(bytes: number): string {
  return formatBytes(bytes);
}

function statusBadgeClass(status: string): string {
  if (status === "done") return adminClass.badgeDone;
  if (status === "error") return adminClass.badgeError;
  if (status === "running") return adminClass.badgeRunning;
  return adminClass.badgeIdle;
}

const TRIGGER_LABELS: Record<string, string> = {
  auto: "Авто",
  manual: "Вручную",
  requested: "Очередь",
};

const STATUS_LABELS: Record<string, string> = {
  done: "OK",
  error: "Ошибка",
  running: "В процессе",
};

type SettingsResponse = {
  settings: DbBackupSettingsDto;
  tables: DbBackupTableStat[];
  totals: {
    tableCount: number;
    selectedCount: number;
    totalBytes: number;
    selectedBytes: number;
    totalBytesLabel: string;
    selectedBytesLabel: string;
  };
  intervalHoursOptions: number[];
  maxFileBytesOptions: number[];
};

export function DbBackupSettingsPanel({
  initialSettings,
  initialTables,
  initialTotals,
  initialHistory,
  intervalHoursOptions,
  maxFileBytesOptions,
}: {
  initialSettings: DbBackupSettingsDto;
  initialTables: DbBackupTableStat[];
  initialTotals: SettingsResponse["totals"];
  initialHistory: DbBackupHistoryDto;
  intervalHoursOptions: number[];
  maxFileBytesOptions: number[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [tables, setTables] = useState(initialTables);
  const [totals, setTotals] = useState(initialTotals);
  const [history, setHistory] = useState(initialHistory);
  const [webdavUrl, setWebdavUrl] = useState(initialSettings.webdavUrl);
  const [webdavUsername, setWebdavUsername] = useState(initialSettings.webdavUsername);
  const [webdavPassword, setWebdavPassword] = useState("");
  const [remoteFolder, setRemoteFolder] = useState(initialSettings.remoteFolder);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [settingsRes, historyRes] = await Promise.all([
        fetch("/api/admin/db-backup/settings", { cache: "no-store" }),
        fetch("/api/admin/db-backup/run", { cache: "no-store" }),
      ]);
      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as SettingsResponse;
        // Не трогаем черновики webdavUrl/username/password/remoteFolder —
        // поллинг иначе затирает незаполненную форму.
        setSettings(data.settings);
        setTables(data.tables);
        setTotals(data.totals);
      }
      if (historyRes.ok) {
        const data = (await historyRes.json()) as DbBackupHistoryDto;
        setHistory(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const includedTables = useMemo(() => {
    const map: Record<string, boolean> = { ...settings.includedTables };
    for (const table of tables) {
      if (!(table.name in map)) map[table.name] = table.enabled;
    }
    return map;
  }, [settings.includedTables, tables]);

  async function savePatch(patch: Record<string, unknown>) {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/db-backup/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) {
        setSaveMessage({ ok: false, text: data.error ?? "Не удалось сохранить" });
        return;
      }
      if (data.settings) {
        setSettings(data.settings);
        const touchedConnection =
          "webdavUrl" in patch ||
          "webdavUsername" in patch ||
          "remoteFolder" in patch ||
          "webdavPassword" in patch ||
          "clearWebdavPassword" in patch;
        if (touchedConnection) {
          setWebdavUrl(data.settings.webdavUrl);
          setWebdavUsername(data.settings.webdavUsername);
          setRemoteFolder(data.settings.remoteFolder);
        }
      }
      if (data.tables) setTables(data.tables);
      if (data.totals) setTotals(data.totals);
      setSaveMessage({ ok: true, text: "Настройки сохранены" });
      if ("webdavPassword" in patch || "clearWebdavPassword" in patch) {
        setWebdavPassword("");
      }
    } catch {
      setSaveMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  }

  async function saveConnection() {
    const patch: Record<string, unknown> = {
      webdavUrl,
      webdavUsername,
      remoteFolder,
    };
    if (webdavPassword.trim()) patch.webdavPassword = webdavPassword.trim();
    await savePatch(patch);
  }

  async function toggleTable(name: string) {
    const next = { ...includedTables, [name]: !includedTables[name] };
    await savePatch({ includedTables: next });
  }

  async function setAllTables(enabled: boolean) {
    const next: Record<string, boolean> = {};
    for (const table of tables) next[table.name] = enabled;
    await savePatch({ includedTables: next });
  }

  async function testConnection() {
    setTesting(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/db-backup/test", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok) {
        setActionMessage({ ok: false, text: data.error ?? "Проверка не удалась" });
        return;
      }
      setActionMessage({ ok: true, text: `WebDAV доступен: ${data.url ?? "OK"}` });
    } catch {
      setActionMessage({ ok: false, text: "Ошибка сети" });
    } finally {
      setTesting(false);
    }
  }

  async function runBackup(mode: "now" | "queue") {
    setRunning(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/db-backup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        history?: DbBackupHistoryDto;
        settings?: DbBackupSettingsDto;
      };
      if (data.history) setHistory(data.history);
      if (data.settings) setSettings(data.settings);
      if (!res.ok) {
        setActionMessage({ ok: false, text: data.error ?? "Не удалось запустить бекап" });
        return;
      }
      setActionMessage({ ok: true, text: data.message ?? "Готово" });
      void refresh();
    } catch {
      setActionMessage({ ok: false, text: "Ошибка сети (или таймаут длинного бекапа — смотрите историю / логи cron)" });
      void refresh();
    } finally {
      setRunning(false);
    }
  }

  const latestRun: DbBackupRunDto | null = history.runs[0] ?? null;
  const busy = saving || running || testing || history.running;

  return (
    <div className="space-y-6">
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">
          Бекап на WebDAV
          {saving ? <span className="ml-2 text-sm font-normal text-muted">Сохранение…</span> : null}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Выбранные таблицы выгружаются в JSONL (gzip), режутся по лимиту размера файла и
          загружаются в указанную папку облака. Для каждого запуска создаётся подпапка с датой
          и временем.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void savePatch({ enabled: !settings.enabled })}
            className={settings.enabled ? adminClass.btnSmOn : adminClass.btnSmOff}
          >
            {settings.enabled ? "Автобекап включён" : "Автобекап выключен"}
          </button>
          <span className="text-sm text-muted">
            {settings.enabled
              ? `Следующий: ${formatRelativeHours(settings.nextAutoRunAt)}`
              : "Только ручной запуск"}
          </span>
          {!settings.configured ? (
            <span className="text-sm text-[var(--danger)]">WebDAV не настроен</span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Интервал автобекапа</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.intervalHours}
              disabled={busy}
              onChange={(event) =>
                void savePatch({ intervalHours: Number(event.target.value) })
              }
            >
              {intervalHoursOptions.map((hours) => (
                <option key={hours} value={hours}>
                  {intervalLabel(hours)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-muted">Макс. размер файла (чанк)</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground"
              value={settings.maxFileBytes}
              disabled={busy}
              onChange={(event) =>
                void savePatch({ maxFileBytes: Number(event.target.value) })
              }
            >
              {maxFileBytesOptions.map((bytes) => (
                <option key={bytes} value={bytes}>
                  {maxFileLabel(bytes)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-muted">WebDAV URL</span>
            <input
              className={`mt-1 w-full ${adminClass.input}`}
              value={webdavUrl}
              disabled={busy}
              placeholder="https://webdav.example.com"
              onChange={(event) => setWebdavUrl(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Логин</span>
            <input
              className={`mt-1 w-full ${adminClass.input}`}
              value={webdavUsername}
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setWebdavUsername(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">
              Пароль {settings.webdavPasswordSet ? "(сохранён, введите новый чтобы заменить)" : ""}
            </span>
            <input
              type="password"
              className={`mt-1 w-full ${adminClass.input}`}
              value={webdavPassword}
              disabled={busy}
              autoComplete="new-password"
              placeholder={settings.webdavPasswordSet ? "••••••••" : ""}
              onChange={(event) => setWebdavPassword(event.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-muted">Папка на облаке</span>
            <input
              className={`mt-1 w-full ${adminClass.input}`}
              value={remoteFolder}
              disabled={busy}
              placeholder="/track-anime-backups"
              onChange={(event) => setRemoteFolder(event.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              Внутри будет создаваться подпапка вида{" "}
              <code className={adminClass.code}>2026-10-07_06-20-00</code>
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminClass.btnPrimary}
            disabled={busy}
            onClick={() => void saveConnection()}
          >
            Сохранить подключение
          </button>
          <button
            type="button"
            className={adminClass.btnSecondary}
            disabled={busy}
            onClick={() => void testConnection()}
          >
            {testing ? "Проверка…" : "Проверить WebDAV"}
          </button>
          {settings.webdavPasswordSet ? (
            <button
              type="button"
              className={adminClass.btnSecondary}
              disabled={busy}
              onClick={() => void savePatch({ clearWebdavPassword: true })}
            >
              Очистить пароль
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            className={adminClass.btnPrimary}
            disabled={busy || !settings.configured}
            onClick={() => void runBackup("now")}
          >
            {running || history.running ? "Бекап выполняется…" : "Сделать бекап"}
          </button>
          <button
            type="button"
            className={adminClass.btnSecondary}
            disabled={busy || !settings.configured}
            onClick={() => void runBackup("queue")}
          >
            В очередь (cron)
          </button>
          {!settings.configured ? (
            <span className="text-sm text-muted">Сначала сохраните WebDAV-подключение</span>
          ) : null}
        </div>
        {actionMessage ? (
          <p
            className={`mt-3 whitespace-pre-wrap text-sm ${
              actionMessage.ok ? adminClass.alertSuccess : adminClass.alertError
            }`}
          >
            {actionMessage.text}
          </p>
        ) : null}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Последний автобекап</dt>
            <dd className="font-semibold text-foreground">
              {formatDateTime(settings.lastAutoRunAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">В очереди</dt>
            <dd className="font-semibold text-foreground">
              {settings.runRequestedAt ? formatDateTime(settings.runRequestedAt) : "—"}
            </dd>
          </div>
        </dl>

        {saveMessage ? (
          <p className={`mt-3 text-sm ${saveMessage.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
            {saveMessage.text}
          </p>
        ) : null}
      </section>

      <section className={adminClass.panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Таблицы базы</h2>
            <p className="mt-1 text-sm text-muted">
              Выбрано {totals.selectedCount} из {totals.tableCount} ·{" "}
              {totals.selectedBytesLabel} / {totals.totalBytesLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminClass.btnSecondary}
              disabled={busy}
              onClick={() => void setAllTables(true)}
            >
              Включить все
            </button>
            <button
              type="button"
              className={adminClass.btnSecondary}
              disabled={busy}
              onClick={() => void setAllTables(false)}
            >
              Выключить все
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className={adminClass.tableHead}>
                <th className="px-2 py-2">Вкл</th>
                <th className="px-2 py-2">Таблица</th>
                <th className="px-2 py-2">Строк (оценка)</th>
                <th className="px-2 py-2">Размер</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((table) => (
                <tr key={table.name} className={adminClass.tableRow}>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleTable(table.name)}
                      className={table.enabled ? adminClass.btnSmOn : adminClass.btnSmOff}
                    >
                      {table.enabled ? "Да" : "Нет"}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-foreground">{table.label}</div>
                    <div className="text-xs text-muted">
                      <code className={adminClass.code}>{table.name}</code>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-foreground">
                    {table.rowEstimate.toLocaleString("ru-RU")}
                  </td>
                  <td className="px-2 py-2 text-foreground">{formatBytes(table.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Запуск</h2>
        <p className="mt-2 text-sm text-muted">
          «Сейчас» выполняется в запросе (до ~5 мин). Для больших баз лучше «В очередь» — подхватит
          cron <code className={adminClass.code}>kodik:sync:scheduled</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={adminClass.btnPrimary}
            disabled={busy || !settings.configured}
            onClick={() => void runBackup("now")}
          >
            {running || history.running ? "Бекап выполняется…" : "Сделать бекап"}
          </button>
          <button
            type="button"
            className={adminClass.btnSecondary}
            disabled={busy || !settings.configured}
            onClick={() => void runBackup("queue")}
          >
            В очередь (cron)
          </button>
        </div>
        {actionMessage ? (
          <p
            className={`mt-3 whitespace-pre-wrap text-sm ${
              actionMessage.ok ? adminClass.alertSuccess : adminClass.alertError
            }`}
          >
            {actionMessage.text}
          </p>
        ) : null}

        {latestRun ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Последний запуск</dt>
              <dd className="font-semibold text-foreground">
                {formatDateTime(latestRun.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Статус</dt>
              <dd>
                <span className={statusBadgeClass(latestRun.status)}>
                  {STATUS_LABELS[latestRun.status] ?? latestRun.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Длительность</dt>
              <dd className="font-semibold text-foreground">
                {formatDuration(latestRun.durationMs)}
              </dd>
            </div>
          </dl>
        ) : null}

        {history.runs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className={adminClass.tableHead}>
                  <th className="px-2 py-2">Когда</th>
                  <th className="px-2 py-2">Триггер</th>
                  <th className="px-2 py-2">Статус</th>
                  <th className="px-2 py-2">Таблицы</th>
                  <th className="px-2 py-2">Файлы</th>
                  <th className="px-2 py-2">Размер</th>
                </tr>
              </thead>
              <tbody>
                {history.runs.map((run) => (
                  <tr key={run.id} className={adminClass.tableRow}>
                    <td className="px-2 py-2">{formatDateTime(run.startedAt)}</td>
                    <td className="px-2 py-2">{TRIGGER_LABELS[run.trigger] ?? run.trigger}</td>
                    <td className="px-2 py-2">
                      <span className={statusBadgeClass(run.status)}>
                        {STATUS_LABELS[run.status] ?? run.status}
                      </span>
                      {run.error ? (
                        <div className="mt-1 max-w-xs text-xs text-[var(--danger)]">{run.error}</div>
                      ) : null}
                      {run.remoteFolder ? (
                        <div className="mt-1 max-w-xs truncate text-xs text-muted">
                          {run.remoteFolder}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {run.tablesDone}/{run.tablesTotal}
                    </td>
                    <td className="px-2 py-2">{run.uploadedFiles}</td>
                    <td className="px-2 py-2">{formatBytes(Number(run.uploadedBytes))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Запусков пока не было.</p>
        )}
      </section>
    </div>
  );
}
