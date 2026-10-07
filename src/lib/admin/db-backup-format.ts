export type DbBackupTableStat = {
  name: string;
  label: string;
  bytes: number;
  rowEstimate: number;
  enabled: boolean;
};

export type DbBackupRunDto = {
  id: string;
  trigger: string;
  status: string;
  remoteFolder: string | null;
  uploadedFiles: number;
  uploadedBytes: string;
  tablesTotal: number;
  tablesDone: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type DbBackupHistoryDto = {
  runs: DbBackupRunDto[];
  running: boolean;
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
