"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { ShikimoriAnonsSyncStatusDto } from "@/lib/admin/shikimori-anons-sync";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
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

function statusBadgeClass(status: string | null): string {
  if (status === "ok") return adminClass.badgeDone;
  if (status === "error") return adminClass.badgeError;
  return adminClass.badgeIdle;
}

function statusLabel(status: string | null): string {
  if (status === "ok") return "OK";
  if (status === "error") return "Ошибка";
  return "Ещё не запускалось";
}

export function ShikimoriAnonsSyncPanel({
  initialStatus,
}: {
  initialStatus: ShikimoriAnonsSyncStatusDto;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shikimori/anons-sync", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status?: ShikimoriAnonsSyncStatusDto };
      if (data.status) setStatus(data.status);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function runSync() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/shikimori/anons-sync", { method: "POST" });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        status?: ShikimoriAnonsSyncStatusDto;
      };

      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Ошибка запроса" });
        return;
      }

      if (data.status) setStatus(data.status);
      setMessage({ ok: true, text: data.message ?? "Готово" });
    } catch {
      setMessage({ ok: false, text: "Не удалось выполнить запрос" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={adminClass.panel}>
      <h2 className="text-lg font-semibold text-foreground">Анонсы Shikimori</h2>
      <p className="mt-2 text-sm text-muted">
        Сканирует Shikimori API (<code className={adminClass.code}>status=anons</code>, только TV /
        фильмы / OVA / ONA) и <code className={adminClass.code}>/api/calendar</code>, сохраняет
        записи для вкладки «Анонсы» в календаре. Спешлы, клипы и music не импортируются. Автосинк — раз в{" "}
        {status.autoIntervalMinutes / 60} ч через cron.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`${statusBadgeClass(status.lastStatus)} text-xs font-medium uppercase`}>
          {statusLabel(status.lastStatus)}
        </span>
        <span className="text-sm text-muted">
          Следующий автосинк: {formatRelativeMinutes(status.nextAutoRunAt)}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">Всего анонсов</dt>
          <dd className="font-semibold text-foreground">
            {status.entryCount.toLocaleString("ru-RU")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">С датой выхода</dt>
          <dd className="font-semibold text-foreground">
            {status.withScheduleCount.toLocaleString("ru-RU")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Последний синк</dt>
          <dd className="font-semibold text-foreground">{formatDateTime(status.lastRunAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">CLI</dt>
          <dd className="font-mono text-xs text-foreground">
            <code className={adminClass.code}>npm run shikimori:sync-anons</code>
          </dd>
        </div>
      </dl>

      {status.error ? (
        <p className={`mt-4 ${adminClass.alertError}`}>{status.error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={loading}
          className={adminClass.btnPrimary}
        >
          {loading ? "Синхронизация…" : "Синхронизировать анонсы"}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className={adminClass.btnSecondary}
        >
          Обновить статус
        </button>
      </div>

      {message ? (
        <p className={`mt-3 ${message.ok ? adminClass.alertSuccess : adminClass.alertError}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
