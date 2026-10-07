export type ServerLoadSample = {
  at: number;
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  swapPercent: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  diskPercent: number | null;
  loadAvg: [number, number, number];
  processRssBytes: number;
  uptimeSeconds: number;
  cpuModel: string | null;
  cpuCores: number;
  cpuThreads: number;
  platform: string;
};

export type ServerLoadSnapshot = {
  current: ServerLoadSample;
  history: ServerLoadSample[];
};

export function formatLoadBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex <= 0 ? 0 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}
