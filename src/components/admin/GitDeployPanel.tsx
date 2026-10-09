"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { GitDeployStatus } from "@/lib/admin/git-deploy-types";

const POLL_IDLE_MS = 8_000;
const POLL_RUNNING_MS = 3_000;

function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, 8);
}

function stateBadge(state: string | undefined, running: boolean): { label: string; className: string } {
  if (running) return { label: "Идёт деплой", className: adminClass.badgeRunning };
  if (state === "success") return { label: "Успех", className: adminClass.badgeDone };
  if (state === "skipped") return { label: "Пропуск", className: adminClass.badgeIdle };
  if (state === "error") return { label: "Ошибка", className: adminClass.badgeError };
  if (state === "starting" || state === "running") return { label: "Запуск…", className: adminClass.badgeRunning };
  return { label: "Ожидание", className: adminClass.badgeIdle };
}

function formatTs(value: string | null | undefined): string {
  if (!value) return "—";
  const d = Date.parse(value);
  if (Number.isNaN(d)) return value;
  return new Date(d).toLocaleString("ru-RU");
}

export function GitDeployPanel() {
  const [status, setStatus] = useState<GitDeployStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GitDeployStatus;
      setStatus(data);
    } catch {
      // ignore transient errors during service restart
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const ms = status?.running ? POLL_RUNNING_MS : POLL_IDLE_MS;
    const id = window.setInterval(() => {
      void refresh();
    }, ms);
    return () => window.clearInterval(id);
  }, [refresh, status?.running]);

  async function onDeploy() {
    if (!status?.canDeploy || deploying) return;
    const ok = window.confirm(
      "Запустить git-деплой с GitHub (force rebuild)? Сайт на время сборки будет недоступен.",
    );
    if (!ok) return;

    setDeploying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        status?: GitDeployStatus;
      };
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? `Ошибка ${res.status}` });
      } else {
        setMessage({ ok: true, text: data.message ?? "Деплой запущен" });
        if (data.status) setStatus(data.status);
        else void refresh();
      }
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Не удалось вызвать API",
      });
    } finally {
      setDeploying(false);
      window.setTimeout(() => void refresh(), 1500);
    }
  }

  if (loading && !status) {
    return (
      <section className={`${adminClass.panel} space-y-2`}>
        <h2 className="text-lg font-semibold text-foreground">Деплой из GitHub</h2>
        <p className="text-sm text-muted">Загрузка…</p>
      </section>
    );
  }

  if (!status) return null;

  const badge = stateBadge(status.status?.state, status.running);
  const st = status.status;

  return (
    <section className={`${adminClass.panel} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Деплой из GitHub</h2>
          <p className="mt-1 text-sm text-muted">
            Webhook или кнопка → <code className={adminClass.code}>git pull</code> → сборка на сервере.
            Без SSH с вашего ПК.
          </p>
        </div>
        <span className={badge.className}>{badge.label}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className={adminClass.statLabel}>Ветка</p>
          <p className={adminClass.statValue}>{status.branch}</p>
        </div>
        <div>
          <p className={adminClass.statLabel}>Триггер</p>
          <p className={adminClass.statValue}>{st?.trigger ?? "—"}</p>
        </div>
        <div>
          <p className={adminClass.statLabel}>Commit</p>
          <p className={adminClass.statValue}>
            {shortSha(st?.commitBefore)} → {shortSha(st?.commitAfter)}
          </p>
        </div>
        <div>
          <p className={adminClass.statLabel}>Webhook</p>
          <p className={adminClass.statValue}>{status.webhookConfigured ? "секрет задан" : "нет секрета"}</p>
        </div>
      </div>

      <div className="text-sm text-muted space-y-1">
        <p>Старт: {formatTs(st?.startedAt)} · конец: {formatTs(st?.finishedAt)}</p>
        {st?.message ? <p>{st.message}</p> : null}
        {status.hint ? <p>{status.hint}</p> : null}
        {status.exitCode != null && !status.running ? <p>exit: {status.exitCode}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={adminClass.btnPrimary}
          disabled={!status.canDeploy || deploying}
          onClick={() => void onDeploy()}
        >
          {deploying ? "Запуск…" : status.running ? "Деплой идёт…" : `Задеплоить ${status.branch}`}
        </button>
        <button type="button" className={adminClass.btnSecondary} onClick={() => void refresh()}>
          Обновить статус
        </button>
      </div>

      {message ? (
        <p className={message.ok ? adminClass.alertSuccess : adminClass.alertError}>{message.text}</p>
      ) : null}

      {status.logTail ? (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm text-muted">Лог (/tmp/ta_deploy.log)</summary>
          <pre className="max-h-80 overflow-auto rounded-md bg-black/40 p-3 text-xs text-foreground whitespace-pre-wrap">
            {status.logTail}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
