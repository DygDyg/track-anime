"use client";

import { useEffect, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { HostRebootStatus } from "@/lib/admin/host-reboot-types";
import {
  formatLoadBytes,
  formatUptime,
  type ServerLoadSample,
  type ServerLoadSnapshot,
} from "@/lib/admin/server-load-types";

const POLL_MS = 4_000;

function Sparkline({
  values,
  max = 100,
}: {
  values: Array<number | null | undefined>;
  max?: number;
}) {
  const nums = values.map((v) => (v == null || !Number.isFinite(v) ? 0 : Math.max(0, v)));
  const w = 120;
  const h = 28;
  if (nums.length < 2) {
    return (
      <div
        className="h-7 w-full rounded-sm"
        style={{ backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
      />
    );
  }

  const peak = Math.max(max, ...nums, 1);
  const step = w / (nums.length - 1);
  const points = nums
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / peak) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `0,${h} ${points} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <polygon points={area} fill="color-mix(in srgb, var(--accent) 22%, transparent)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function seriesStats(values: Array<number | null | undefined>): { avg: number | null; peak: number | null } {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return { avg: null, peak: null };
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round((sum / nums.length) * 10) / 10,
    peak: Math.round(Math.max(...nums) * 10) / 10,
  };
}

function MetricCard({
  label,
  percent,
  detail,
  hint,
  history,
}: {
  label: string;
  percent: number | null;
  detail: string;
  hint?: string;
  history: Array<number | null | undefined>;
}) {
  const stats = seriesStats(history);
  return (
    <div className={`${adminClass.panel} !p-3`}>
      <p className={adminClass.statLabel}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {percent == null ? "—" : `${percent.toFixed(1)}%`}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted" title={detail}>
        {detail}
      </p>
      {hint ? (
        <p className="truncate text-[11px] text-muted" title={hint}>
          {hint}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted">
        <span>ср. {stats.avg == null ? "—" : `${stats.avg}%`}</span>
        <span>пик {stats.peak == null ? "—" : `${stats.peak}%`}</span>
      </div>
      <div className="mt-1">
        <Sparkline values={history} />
      </div>
    </div>
  );
}

function cpuDetail(sample: ServerLoadSample): string {
  const ghzMatch = sample.cpuModel?.match(/([\d.]+)\s*GHz/i);
  const ghz = ghzMatch ? `${ghzMatch[1]} GHz` : null;
  const cores = `${sample.cpuCores} ядер`;
  return ghz ? `${cores} · ${ghz}` : cores;
}

export function AdminServerLoadPanel() {
  const [snapshot, setSnapshot] = useState<ServerLoadSnapshot | null>(null);
  const [reboot, setReboot] = useState<HostRebootStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebootBusy, setRebootBusy] = useState(false);
  const [rebootMessage, setRebootMessage] = useState<string | null>(null);
  const [rebootError, setRebootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const [loadRes, rebootRes] = await Promise.all([
          fetch("/api/admin/server-load", { cache: "no-store" }),
          fetch("/api/admin/host-reboot", { cache: "no-store" }),
        ]);
        if (!loadRes.ok) throw new Error(`HTTP ${loadRes.status}`);
        const data = (await loadRes.json()) as ServerLoadSnapshot;
        const rebootData = rebootRes.ok ? ((await rebootRes.json()) as HostRebootStatus) : null;
        if (!cancelled) {
          setSnapshot(data);
          if (rebootData) setReboot(rebootData);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Не удалось получить нагрузку");
      } finally {
        if (!cancelled) timer = setTimeout(tick, POLL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function requestReboot() {
    if (!reboot?.canReboot || rebootBusy) return;
    const delay = reboot.delayMinutes;
    if (
      !window.confirm(
        `Перезагрузить сервер через ${delay} мин.?\n\nПеред ребутом проверены бекап, импорт и синхронизация Kodik.`,
      )
    ) {
      return;
    }

    setRebootBusy(true);
    setRebootMessage(null);
    setRebootError(null);
    try {
      const res = await fetch("/api/admin/host-reboot", { method: "POST" });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        blockers?: Array<{ label: string }>;
        status?: HostRebootStatus;
      };
      if (data.status) setReboot(data.status);
      if (!res.ok) {
        const extra =
          data.blockers && data.blockers.length > 0
            ? `: ${data.blockers.map((b) => b.label).join("; ")}`
            : "";
        setRebootError(`${data.error ?? "Ошибка ребута"}${extra}`);
        return;
      }
      setRebootMessage(data.message ?? "Ребут запланирован");
    } catch {
      setRebootError("Не удалось отправить запрос на ребут");
    } finally {
      setRebootBusy(false);
    }
  }

  const history = snapshot?.history ?? [];
  const current = snapshot?.current;
  const rebootBlocked = Boolean(reboot && (!reboot.enabled || reboot.blockers.length > 0 || reboot.scheduled));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Нагрузка сервера</h2>
        {current ? (
          <p className="text-xs text-muted">
            Load {current.loadAvg.join(" / ")} · ОС {formatUptime(current.uptimeSeconds)} · RSS{" "}
            {formatLoadBytes(current.processRssBytes)}
          </p>
        ) : null}
      </div>

      {error ? <p className={adminClass.alertError}>{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="ЦП"
          percent={current?.cpuPercent ?? null}
          detail={current ? cpuDetail(current) : "…"}
          hint={current?.cpuModel ?? undefined}
          history={history.map((s) => s.cpuPercent)}
        />
        <MetricCard
          label="Память"
          percent={current?.memoryPercent ?? null}
          detail={
            current
              ? `${formatLoadBytes(current.memoryUsedBytes)} / ${formatLoadBytes(current.memoryTotalBytes)}`
              : "…"
          }
          history={history.map((s) => s.memoryPercent)}
        />
        <MetricCard
          label="Подкачка"
          percent={current?.swapPercent ?? null}
          detail={
            current?.swapTotalBytes != null
              ? `${formatLoadBytes(current.swapUsedBytes)} / ${formatLoadBytes(current.swapTotalBytes)}`
              : "нет данных"
          }
          history={history.map((s) => s.swapPercent)}
        />
        <MetricCard
          label="Диск"
          percent={current?.diskPercent ?? null}
          detail={
            current?.diskTotalBytes != null
              ? `${formatLoadBytes(current.diskUsedBytes)} / ${formatLoadBytes(current.diskTotalBytes)}`
              : "нет данных"
          }
          hint={
            current?.diskFreeBytes != null ? `Свободно ${formatLoadBytes(current.diskFreeBytes)}` : undefined
          }
          history={history.map((s) => s.diskPercent)}
        />
      </div>

      <div className={`${adminClass.panel} !p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">Перезагрузка сервера</p>
            <p className="text-xs text-muted">
              Перед ребутом проверяются WebDAV-бекап, очередь бекапа, импорт и синхронизация Kodik.
              {reboot ? ` Задержка: ${reboot.delayMinutes} мин.` : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void requestReboot()}
            disabled={!reboot?.canReboot || rebootBusy}
            className={adminClass.btnSecondary}
          >
            {rebootBusy ? "Планирую…" : reboot?.scheduled ? "Ребут запланирован" : "Перезагрузить"}
          </button>
        </div>

        {reboot && !reboot.enabled ? (
          <p className="mt-2 text-xs text-muted">
            Ребут выключен для этой среды. На Windows задайте{" "}
            <code className={adminClass.code}>HOST_REBOOT_ENABLED=1</code>.
          </p>
        ) : null}

        {rebootBlocked && reboot && reboot.blockers.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
            {reboot.blockers.map((b) => (
              <li key={b.id}>{b.label}</li>
            ))}
          </ul>
        ) : null}

        {rebootMessage ? <p className={`mt-2 ${adminClass.alertSuccess}`}>{rebootMessage}</p> : null}
        {rebootError ? <p className={`mt-2 ${adminClass.alertError}`}>{rebootError}</p> : null}
      </div>
    </section>
  );
}
