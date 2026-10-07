"use client";

import { useEffect, useRef, useState } from "react";
import { adminClass } from "@/components/admin/admin-styles";
import type { HostRebootStatus } from "@/lib/admin/host-reboot-types";
import {
  formatLoadBytes,
  formatUptime,
  type ServerLoadSample,
  type ServerLoadSnapshot,
} from "@/lib/admin/server-load-types";

const POLL_MS = 4_000;
const POLL_REBOOT_MS = 2_000;
const FETCH_TIMEOUT_MS = 8_000;
const REBOOT_WATCH_KEY = "ta-admin-reboot-watch";
const RECOVERED_HOLD_MS = 10 * 60 * 1000;

type RebootWatchPhase = "scheduled" | "unreachable" | "recovered";

type RebootWatchState = {
  phase: RebootWatchPhase;
  scheduledAt: number;
  delayMinutes: number;
  uptimeBeforeSec: number | null;
  unreachableAt: number | null;
  recoveredAt: number | null;
  recoveredUptimeSec: number | null;
};

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

function readRebootWatch(): RebootWatchState | null {
  try {
    const raw = sessionStorage.getItem(REBOOT_WATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RebootWatchState;
    if (!parsed || typeof parsed.scheduledAt !== "number" || !parsed.phase) return null;
    if (parsed.phase === "recovered" && parsed.recoveredAt) {
      if (Date.now() - parsed.recoveredAt > RECOVERED_HOLD_MS) {
        sessionStorage.removeItem(REBOOT_WATCH_KEY);
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRebootWatch(state: RebootWatchState | null) {
  try {
    if (!state) {
      sessionStorage.removeItem(REBOOT_WATCH_KEY);
      return;
    }
    sessionStorage.setItem(REBOOT_WATCH_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function looksLikeFreshBoot(uptimeSec: number, watch: RebootWatchState): boolean {
  if (watch.uptimeBeforeSec != null && uptimeSec + 30 < watch.uptimeBeforeSec) return true;
  // После ребута uptime обычно меньше окна ожидания + запас
  const windowSec = watch.delayMinutes * 60 + 30 * 60;
  return uptimeSec < windowSec;
}

export function AdminServerLoadPanel() {
  const [snapshot, setSnapshot] = useState<ServerLoadSnapshot | null>(null);
  const [reboot, setReboot] = useState<HostRebootStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebootBusy, setRebootBusy] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const [watch, setWatch] = useState<RebootWatchState | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const watchRef = useRef<RebootWatchState | null>(null);

  useEffect(() => {
    const initial = readRebootWatch();
    watchRef.current = initial;
    setWatch(initial);
  }, []);

  useEffect(() => {
    watchRef.current = watch;
    writeRebootWatch(watch);
  }, [watch]);

  useEffect(() => {
    if (!watch || watch.phase === "recovered") return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [watch?.phase]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function scheduleNext(delayMs: number) {
      if (cancelled) return;
      timer = setTimeout(() => void tick(), delayMs);
    }

    async function tick() {
      const activeWatch = watchRef.current;
      const watchingReboot = Boolean(activeWatch && activeWatch.phase !== "recovered");
      const pollMs = watchingReboot ? POLL_REBOOT_MS : POLL_MS;

      try {
        const [loadRes, rebootRes] = await Promise.all([
          fetchWithTimeout("/api/admin/server-load"),
          fetchWithTimeout("/api/admin/host-reboot"),
        ]);
        if (!loadRes.ok) throw new Error(`HTTP ${loadRes.status}`);
        const data = (await loadRes.json()) as ServerLoadSnapshot;
        const rebootData = rebootRes.ok ? ((await rebootRes.json()) as HostRebootStatus) : null;

        if (cancelled) return;

        setSnapshot(data);
        if (rebootData) setReboot(rebootData);
        setError(null);

        const currentWatch = watchRef.current;
        if (currentWatch?.phase === "unreachable") {
          const uptime = data.current.uptimeSeconds;
          if (looksLikeFreshBoot(uptime, currentWatch)) {
            setWatch({
              ...currentWatch,
              phase: "recovered",
              recoveredAt: Date.now(),
              recoveredUptimeSec: uptime,
            });
          } else {
            // API снова отвечает — считаем вернувшимся даже без явного сброса uptime
            setWatch({
              ...currentWatch,
              phase: "recovered",
              recoveredAt: Date.now(),
              recoveredUptimeSec: uptime,
            });
          }
        } else if (currentWatch?.phase === "scheduled") {
          const dueAt = currentWatch.scheduledAt + currentWatch.delayMinutes * 60_000;
          if (Date.now() >= dueAt + 15_000 && looksLikeFreshBoot(data.current.uptimeSeconds, currentWatch)) {
            // Успели пропустить фазу unreachable (быстрый ребут / короткий простой)
            setWatch({
              ...currentWatch,
              phase: "recovered",
              unreachableAt: currentWatch.unreachableAt,
              recoveredAt: Date.now(),
              recoveredUptimeSec: data.current.uptimeSeconds,
            });
          }
        }

        scheduleNext(pollMs);
      } catch {
        if (cancelled) return;

        const currentWatch = watchRef.current;
        if (currentWatch && currentWatch.phase !== "recovered") {
          if (currentWatch.phase !== "unreachable") {
            setWatch({
              ...currentWatch,
              phase: "unreachable",
              unreachableAt: Date.now(),
            });
          }
          setError(null);
        } else {
          setError("Не удалось получить нагрузку");
        }
        scheduleNext(POLL_REBOOT_MS);
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
    setRebootError(null);
    try {
      const res = await fetchWithTimeout("/api/admin/host-reboot", { method: "POST" }, 20_000);
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        blockers?: Array<{ label: string }>;
        status?: HostRebootStatus;
        delayMinutes?: number;
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

      const delayMinutes = data.delayMinutes ?? delay;
      setWatch({
        phase: "scheduled",
        scheduledAt: Date.now(),
        delayMinutes,
        uptimeBeforeSec: snapshot?.current.uptimeSeconds ?? null,
        unreachableAt: null,
        recoveredAt: null,
        recoveredUptimeSec: null,
      });
    } catch {
      setRebootError("Не удалось отправить запрос на ребут");
    } finally {
      setRebootBusy(false);
    }
  }

  function dismissWatch() {
    setWatch(null);
  }

  const history = snapshot?.history ?? [];
  const current = snapshot?.current;
  const rebootBlocked = Boolean(reboot && (!reboot.enabled || reboot.blockers.length > 0 || reboot.scheduled));
  const dueAt = watch ? watch.scheduledAt + watch.delayMinutes * 60_000 : 0;
  const remainingMs = watch?.phase === "scheduled" ? dueAt - nowTick : 0;
  const offlineForMs =
    watch?.phase === "unreachable" && watch.unreachableAt ? nowTick - watch.unreachableAt : 0;

  let rebootBanner: { className: string; text: string } | null = null;
  if (watch?.phase === "scheduled") {
    rebootBanner = {
      className: adminClass.alertSuccess,
      text:
        remainingMs > 0
          ? `Ребут запланирован. До отключения ≈ ${formatCountdown(remainingMs)}. Слежу за доступностью…`
          : "Время ребута наступило. Жду, пока сервер станет недоступен…",
    };
  } else if (watch?.phase === "unreachable") {
    rebootBanner = {
      className: adminClass.alertError,
      text: `Сервер недоступен (перезагрузка). Жду возврата… ${
        offlineForMs > 0 ? `уже ${formatCountdown(offlineForMs)}` : ""
      }`.trim(),
    };
  } else if (watch?.phase === "recovered") {
    const up = watch.recoveredUptimeSec != null ? formatUptime(watch.recoveredUptimeSec) : null;
    rebootBanner = {
      className: adminClass.alertSuccess,
      text: `Сервер снова в сети${up ? ` · uptime ОС ${up}` : ""}. Метрики обновляются.`,
    };
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Нагрузка сервера</h2>
        {current && watch?.phase !== "unreachable" ? (
          <p className="text-xs text-muted">
            Load {current.loadAvg.join(" / ")} · ОС {formatUptime(current.uptimeSeconds)} · RSS{" "}
            {formatLoadBytes(current.processRssBytes)}
          </p>
        ) : null}
      </div>

      {rebootBanner ? (
        <div className={`flex flex-wrap items-start justify-between gap-2 ${rebootBanner.className}`}>
          <p className="text-sm">{rebootBanner.text}</p>
          {watch?.phase === "recovered" ? (
            <button type="button" className={adminClass.textLink} onClick={dismissWatch}>
              Скрыть
            </button>
          ) : null}
        </div>
      ) : null}

      {error && !watch ? <p className={adminClass.alertError}>{error}</p> : null}

      <div
        className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${
          watch?.phase === "unreachable" ? "opacity-60" : ""
        }`}
      >
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
            disabled={
              !reboot?.canReboot ||
              rebootBusy ||
              Boolean(watch && watch.phase !== "recovered")
            }
            className={adminClass.btnSecondary}
          >
            {rebootBusy
              ? "Планирую…"
              : watch?.phase === "scheduled" || watch?.phase === "unreachable" || reboot?.scheduled
                ? "Ребут идёт…"
                : "Перезагрузить"}
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

        {rebootError ? <p className={`mt-2 ${adminClass.alertError}`}>{rebootError}</p> : null}
      </div>
    </section>
  );
}
