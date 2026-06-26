import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { getBackgroundImagesDir } from "@/lib/background-images";

const execFileAsync = promisify(execFile);

export type StoragePathStat = {
  label: string;
  path: string;
  bytes: number | null;
};

export type DatabaseSizeStat = {
  name: string;
  bytes: number;
};

export type DatabaseTableStat = {
  name: string;
  bytes: number;
};

export type AdminStorageStats = {
  site: {
    totalBytes: number | null;
    breakdown: StoragePathStat[];
  };
  databases: DatabaseSizeStat[];
  tables: DatabaseTableStat[];
};

export function formatStorageBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = -1;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

async function duSizeBytes(dir: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("du", ["-sk", dir], { timeout: 120_000 });
    const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? "", 10);
    return Number.isFinite(kb) ? kb * 1024 : null;
  } catch {
    return null;
  }
}

async function walkSizeBytes(dir: string): Promise<number | null> {
  try {
    let total = 0;
    const stack = [dir];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      const entries = await fs.promises.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        try {
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) {
            stack.push(fullPath);
          } else if (entry.isFile()) {
            const stat = await fs.promises.stat(fullPath);
            total += stat.size;
          }
        } catch {
          /* skip unreadable paths */
        }
      }
    }

    return total;
  } catch {
    return null;
  }
}

async function measurePath(label: string, absPath: string, relPath: string): Promise<StoragePathStat> {
  if (!fs.existsSync(absPath)) {
    return { label, path: relPath, bytes: null };
  }

  const heavyOnWindows = relPath === "node_modules" || relPath === ".next";
  if (process.platform === "win32" && heavyOnWindows) {
    return { label, path: relPath, bytes: null };
  }

  const canUseDu = process.platform !== "win32";
  const bytes = canUseDu ? await duSizeBytes(absPath) : await walkSizeBytes(absPath);
  return { label, path: relPath, bytes };
}

async function getSiteStorageStats(): Promise<AdminStorageStats["site"]> {
  const root = process.cwd();
  const bgDir = getBackgroundImagesDir();
  const bgRel = bgDir ? path.relative(root, bgDir) || "bg" : "bg";

  const breakdownTargets = [
    { label: "Сборка (.next)", relPath: ".next" },
    { label: "Зависимости (node_modules)", relPath: "node_modules" },
    { label: "Фоны (bg)", relPath: bgRel },
    { label: "Public", relPath: "public" },
  ];

  const breakdown = await Promise.all(
    breakdownTargets.map(({ label, relPath }) =>
      measurePath(label, path.join(root, relPath), relPath),
    ),
  );

  const canUseDu = process.platform !== "win32";
  const totalBytes = canUseDu ? await duSizeBytes(root) : null;

  return { totalBytes, breakdown };
}

async function getDatabaseStorageStats(): Promise<{
  databases: DatabaseSizeStat[];
  tables: DatabaseTableStat[];
}> {
  const [databases, tables] = await Promise.all([
    prisma.$queryRaw<DatabaseSizeStat[]>`
      SELECT
        datname AS name,
        pg_database_size(datname)::bigint AS bytes
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY bytes DESC
    `,
    prisma.$queryRaw<DatabaseTableStat[]>`
      SELECT
        c.relname AS name,
        pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY bytes DESC
      LIMIT 12
    `,
  ]);

  return {
    databases: databases.map((row) => ({
      name: row.name,
      bytes: Number(row.bytes),
    })),
    tables: tables.map((row) => ({
      name: row.name,
      bytes: Number(row.bytes),
    })),
  };
}

export async function getAdminStorageStats(): Promise<AdminStorageStats> {
  const [site, db] = await Promise.all([getSiteStorageStats(), getDatabaseStorageStats()]);
  return {
    site,
    databases: db.databases,
    tables: db.tables,
  };
}
