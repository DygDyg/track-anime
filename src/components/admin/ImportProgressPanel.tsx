"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { ImportJobDto } from "@/lib/admin/stats";

const PHASE_LABELS: Record<string, string> = {
  catalog: "Каталог",
  episodes: "Импорт серий",
  sync: "Sync Kodik",
};

function formatNumber(value: number): string {
  return value.toLocaleString("ru-RU");
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className={adminClass.progressTrack}>
      <div className={adminClass.progressFill} style={{ width: `${percent}%` }} />
    </div>
  );
}

function statusBadgeClass(job: ImportJobDto): string {
  if (job.isRunning) return adminClass.badgeRunning;
  if (job.status === "done" && job.pendingEpisodes === 0) return adminClass.badgeDone;
  if (job.status === "error") return adminClass.badgeError;
  if (job.pendingEpisodes > 0) return adminClass.badgeIdle;
  return adminClass.badgeIdle;
}

function statusLabel(job: ImportJobDto): string {
  if (job.isRunning) return "В процессе";
  if (job.status === "done" && job.pendingEpisodes === 0) return "Завершено";
  if (job.status === "error") return "Ошибка";
  if (job.pendingEpisodes > 0) {
    return job.status === "running" ? "Зависло — нажмите «Продолжить»" : "Приостановлено";
  }
  return job.status;
}

export function ImportProgressPanel({
  initialJob,
  pollWhenIdle = false,
}: {
  initialJob: ImportJobDto | null;
  pollWhenIdle?: boolean;
}) {
  const [job, setJob] = useState(initialJob);
  const [watching, setWatching] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/import/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { job: ImportJobDto | null };
      setJob(data.job);
      if (!data.job?.isRunning) {
        setWatching(false);
      }
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  useEffect(() => {
    const shouldPoll = job?.isRunning || watching || pollWhenIdle;
    if (!shouldPoll) return;

    void fetchStatus();
    const id = window.setInterval(() => void fetchStatus(), 2000);
    return () => window.clearInterval(id);
  }, [job?.isRunning, watching, pollWhenIdle, fetchStatus]);

  useEffect(() => {
    const onStart = () => setWatching(true);
    window.addEventListener("ta-admin-import-start", onStart);
    return () => window.removeEventListener("ta-admin-import-start", onStart);
  }, []);

  if (!job) {
    return (
      <section className={adminClass.panel}>
        <h2 className="text-lg font-semibold text-foreground">Прогресс синхронизации</h2>
        <p className="mt-2 text-sm text-muted">Импорт ещё не запускался.</p>
      </section>
    );
  }

  const phaseLabel = PHASE_LABELS[job.phase] ?? job.phase;
  const percent = job.progressPercent ?? 0;
  const sessionPercent =
    job.sessionTotal != null && job.sessionTotal > 0
      ? Math.min(100, Math.round((job.sessionProcessed / job.sessionTotal) * 100))
      : null;

  return (
    <section className={adminClass.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Прогресс синхронизации</h2>
        <span className={statusBadgeClass(job)}>{statusLabel(job)}</span>
      </div>

      {job.progressPercent != null ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Серии загружены</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(job.episodesLoaded)}
              {job.materialTotal > 0
                ? ` / ${formatNumber(job.materialTotal)} (${percent}%)`
                : ""}
            </span>
          </div>
          <ProgressBar percent={percent} />
        </div>
      ) : null}

      {job.phase === "sync" && sessionPercent != null ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Sync-сессия</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(job.sessionProcessed)} материалов ({sessionPercent}%)
            </span>
          </div>
          <ProgressBar percent={sessionPercent} />
        </div>
      ) : null}

      {job.phase === "episodes" && (job.sessionProcessed > 0 || job.sessionSkipped > 0) ? (
        <p className="mt-3 text-sm text-muted">
          Текущая сессия:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            +{formatNumber(job.sessionProcessed)}
          </span>
          {job.sessionSkipped > 0 ? (
            <>
              , пропущено{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatNumber(job.sessionSkipped)}
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Фаза</dt>
          <dd className="font-semibold text-foreground">{phaseLabel}</dd>
        </div>
        <div>
          <dt className="text-muted">Осталось без серий</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {formatNumber(job.pendingEpisodes)}
          </dd>
        </div>
        {job.remainingLabel && job.pendingEpisodes > 0 ? (
          <div>
            <dt className="text-muted">
              {job.isRunning ? "Осталось времени" : "Примерно до завершения"}
            </dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {job.remainingIsEstimate ? "~" : ""}
              {job.remainingLabel}
            </dd>
          </div>
        ) : null}
        {job.currentItem ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">Сейчас</dt>
            <dd className="truncate font-mono text-xs text-foreground">{job.currentItem}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-muted">Обновлено</dt>
          <dd className="font-semibold text-foreground">
            {new Date(job.updatedAt).toLocaleString("ru-RU")}
          </dd>
        </div>
      </dl>

      {job.lastError ? <p className={`mt-4 ${adminClass.alertError}`}>{job.lastError}</p> : null}
    </section>
  );
}
