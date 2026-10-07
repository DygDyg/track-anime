import { execFile } from "node:child_process";
import fs from "node:fs";
import { statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ServerLoadSample, ServerLoadSnapshot } from "@/lib/admin/server-load-types";

export type { ServerLoadSample, ServerLoadSnapshot } from "@/lib/admin/server-load-types";
export { formatLoadBytes, formatUptime } from "@/lib/admin/server-load-types";

const execFileAsync = promisify(execFile);

const HISTORY_LIMIT = 60;
const SAMPLE_MIN_GAP_MS = 2_000;

type CpuTimesSnapshot = {
  at: number;
  idle: number;
  total: number;
};

const globalStore = globalThis as typeof globalThis & {
  __taServerLoadHistory?: ServerLoadSample[];
  __taServerLoadCpuPrev?: CpuTimesSnapshot | null;
  __taServerLoadLastSampleAt?: number;
};

function history(): ServerLoadSample[] {
  if (!globalStore.__taServerLoadHistory) {
    globalStore.__taServerLoadHistory = [];
  }
  return globalStore.__taServerLoadHistory;
}

function readCpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function computeCpuPercent(now: number): number | null {
  const current = readCpuTimes();
  const prev = globalStore.__taServerLoadCpuPrev ?? null;
  globalStore.__taServerLoadCpuPrev = { at: now, ...current };

  if (!prev || current.total <= prev.total) {
    const cores = Math.max(1, os.cpus().length);
    const load = os.loadavg()[0] ?? 0;
    if (process.platform === "win32" && load === 0) return null;
    return Math.max(0, Math.min(100, (load / cores) * 100));
  }

  const idleDelta = current.idle - prev.idle;
  const totalDelta = current.total - prev.total;
  if (totalDelta <= 0) return null;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

async function readSwap(): Promise<{ used: number; total: number } | null> {
  if (process.platform === "linux") {
    try {
      const text = await fs.promises.readFile("/proc/meminfo", "utf8");
      let totalKb: number | null = null;
      let freeKb: number | null = null;
      for (const line of text.split("\n")) {
        if (line.startsWith("SwapTotal:")) {
          totalKb = Number.parseInt(line.replace(/\D+/g, ""), 10);
        } else if (line.startsWith("SwapFree:")) {
          freeKb = Number.parseInt(line.replace(/\D+/g, ""), 10);
        }
      }
      if (totalKb == null || freeKb == null || !Number.isFinite(totalKb) || !Number.isFinite(freeKb)) {
        return null;
      }
      const total = totalKb * 1024;
      const used = Math.max(0, (totalKb - freeKb) * 1024);
      return { used, total };
    } catch {
      return null;
    }
  }

  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$p=Get-CimInstance Win32_PageFileUsage; $u=($p|Measure-Object CurrentUsage -Sum).Sum; $t=($p|Measure-Object AllocatedBaseSize -Sum).Sum; Write-Output \"$u $t\"",
        ],
        { timeout: 5_000, windowsHide: true },
      );
      const parts = stdout.trim().split(/\s+/);
      const usedMb = Number.parseFloat(parts[0] ?? "");
      const totalMb = Number.parseFloat(parts[1] ?? "");
      if (!Number.isFinite(usedMb) || !Number.isFinite(totalMb)) return null;
      return { used: usedMb * 1024 * 1024, total: totalMb * 1024 * 1024 };
    } catch {
      return null;
    }
  }

  return null;
}

async function readDisk(rootPath: string): Promise<{
  used: number;
  total: number;
  free: number;
} | null> {
  try {
    const stats = await statfs(rootPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (!Number.isFinite(total) || total <= 0) return null;
    const used = Math.max(0, total - free);
    return { used, total, free };
  } catch {
    /* fall through */
  }

  if (process.platform === "win32") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("df", ["-kP", rootPath], { timeout: 5_000 });
    const lines = stdout.trim().split(/\r?\n/);
    const data = lines[1];
    if (!data) return null;
    const parts = data.split(/\s+/);
    const totalKb = Number.parseInt(parts[1] ?? "", 10);
    const usedKb = Number.parseInt(parts[2] ?? "", 10);
    const availKb = Number.parseInt(parts[3] ?? "", 10);
    if (![totalKb, usedKb, availKb].every((n) => Number.isFinite(n))) return null;
    return {
      used: usedKb * 1024,
      total: totalKb * 1024,
      free: availKb * 1024,
    };
  } catch {
    return null;
  }
}

function percent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function collectServerLoadSample(): Promise<ServerLoadSample> {
  const now = Date.now();
  const cpus = os.cpus();
  const memoryTotalBytes = os.totalmem();
  const memoryFreeBytes = os.freemem();
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - memoryFreeBytes);
  const cpuPercentRaw = computeCpuPercent(now);
  const [swap, disk] = await Promise.all([readSwap(), readDisk(path.parse(process.cwd()).root || "/")]);
  const load = os.loadavg();
  const rss = process.memoryUsage().rss;

  return {
    at: now,
    cpuPercent: cpuPercentRaw == null ? null : round1(cpuPercentRaw),
    memoryUsedBytes,
    memoryTotalBytes,
    memoryPercent: round1(percent(memoryUsedBytes, memoryTotalBytes)),
    swapUsedBytes: swap?.used ?? null,
    swapTotalBytes: swap?.total ?? null,
    swapPercent: swap ? round1(percent(swap.used, swap.total)) : null,
    diskUsedBytes: disk?.used ?? null,
    diskTotalBytes: disk?.total ?? null,
    diskFreeBytes: disk?.free ?? null,
    diskPercent: disk ? round1(percent(disk.used, disk.total)) : null,
    loadAvg: [round1(load[0] ?? 0), round1(load[1] ?? 0), round1(load[2] ?? 0)],
    processRssBytes: rss,
    uptimeSeconds: Math.floor(os.uptime()),
    cpuModel: cpus[0]?.model?.trim() || null,
    cpuCores: cpus.length,
    cpuThreads: cpus.length,
    platform: process.platform,
  };
}

export async function getServerLoadSnapshot(): Promise<ServerLoadSnapshot> {
  const now = Date.now();
  const buf = history();
  const lastAt = globalStore.__taServerLoadLastSampleAt ?? 0;
  const shouldSample = now - lastAt >= SAMPLE_MIN_GAP_MS || buf.length === 0;

  let current: ServerLoadSample;
  if (shouldSample) {
    current = await collectServerLoadSample();
    globalStore.__taServerLoadLastSampleAt = current.at;
    buf.push(current);
    while (buf.length > HISTORY_LIMIT) buf.shift();
  } else {
    current = buf[buf.length - 1] ?? (await collectServerLoadSample());
  }

  return {
    current,
    history: [...buf],
  };
}
