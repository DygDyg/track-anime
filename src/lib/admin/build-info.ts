import fs from "node:fs";
import path from "node:path";

export type SiteBuildInfo = {
  version: string;
  buildNumber: number | null;
  builtAt: string | null;
  builtAtLabel: string | null;
};

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function formatBuiltAtLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseBuildNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function readConfiguredBuildNumber(): number | null {
  const fromEnv = parseBuildNumber(process.env.BUILD_NUMBER);
  if (fromEnv != null) return fromEnv;

  try {
    return parseBuildNumber(fs.readFileSync(path.join(process.cwd(), ".build-number"), "utf8").trim());
  } catch {
    return null;
  }
}

/** A stable value embedded into an HTML response and compared by open tabs. */
export function getSiteBuildFingerprint(): string | null {
  const buildNumber = readConfiguredBuildNumber();
  if (buildNumber != null) return `build:${buildNumber}`;

  try {
    const buildId = fs.readFileSync(path.join(process.cwd(), ".next/BUILD_ID"), "utf8").trim();
    return buildId ? `next:${buildId}` : null;
  } catch {
    return null;
  }
}

function readBuildInfoFile(): SiteBuildInfo | null {
  const infoPath = path.join(process.cwd(), ".next/build-info.json");
  const raw = JSON.parse(fs.readFileSync(infoPath, "utf8")) as {
    version?: string;
    buildNumber?: unknown;
    builtAt?: string;
  };

  if (typeof raw.builtAt !== "string") return null;

  const builtAt = raw.builtAt;
  return {
    version: raw.version ?? readPackageVersion(),
    buildNumber: parseBuildNumber(raw.buildNumber),
    builtAt,
    builtAtLabel: formatBuiltAtLabel(new Date(builtAt)),
  };
}

function readBuildIdFallback(): SiteBuildInfo | null {
  const buildIdPath = path.join(process.cwd(), ".next/BUILD_ID");
  const stat = fs.statSync(buildIdPath);
  const builtAt = stat.mtime.toISOString();

  return {
    version: readPackageVersion(),
    buildNumber: null,
    builtAt,
    builtAtLabel: formatBuiltAtLabel(stat.mtime),
  };
}

export async function getSiteBuildInfo(): Promise<SiteBuildInfo> {
  const version = readPackageVersion();

  try {
    const fromFile = readBuildInfoFile();
    if (fromFile) return fromFile;
  } catch {
    /* fall through */
  }

  try {
    const fromBuildId = readBuildIdFallback();
    if (fromBuildId) return fromBuildId;
  } catch {
    /* fall through */
  }

  return {
    version,
    buildNumber: null,
    builtAt: null,
    builtAtLabel: null,
  };
}
