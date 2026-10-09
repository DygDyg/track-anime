import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import type {
  GitDeployStatus,
  GitDeployStatusFile,
  GitDeployTrigger,
} from "@/lib/admin/git-deploy-types";

export type { GitDeployStatus, GitDeployStatusFile, GitDeployTrigger } from "@/lib/admin/git-deploy-types";

const execFileAsync = promisify(execFile);

const STATUS_FILE = process.env.GIT_DEPLOY_STATUS_FILE?.trim() || "/tmp/ta_deploy_status.json";
const LOG_FILE = process.env.DEPLOY_LOG?.trim() || "/tmp/ta_deploy.log";
const EXIT_FILE = "/tmp/ta_deploy.exit";
const SCREEN_SESSION = process.env.DEPLOY_SCREEN_SESSION?.trim() || "ta_deploy";
const DEFAULT_TRIGGER_BIN = "/usr/local/sbin/ta-git-deploy-trigger";

const IGNORE_PATH_PREFIXES = [
  "docs/",
  ".cursor/",
  ".obsidian/",
  ".github/",
  "AI_CONTEXT.md",
  "AI_RULES.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "BUSINESS_LOGIC.md",
  "CODEBASE_MAP.md",
  "CONVENTIONS.md",
  "DECISIONS.md",
  "PROJECT_OVERVIEW.md",
  "README.md",
  ".cursorrules",
];

function parseEnvFlag(raw: string | undefined): boolean | null {
  if (raw == null || !raw.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return null;
}

export function isGitDeployEnabled(): boolean {
  const flag = parseEnvFlag(process.env.GIT_DEPLOY_ENABLED);
  if (flag != null) return flag;
  return process.platform === "linux";
}

export function getGitDeployBranch(): string {
  return process.env.GIT_DEPLOY_BRANCH?.trim() || "master";
}

export function getGitDeployWebhookSecret(): string | null {
  const secret = process.env.GIT_DEPLOY_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

function getTriggerBin(): string {
  const custom = process.env.GIT_DEPLOY_COMMAND?.trim();
  if (custom) return custom;
  return `sudo -n ${DEFAULT_TRIGGER_BIN}`;
}

async function readJsonStatus(): Promise<GitDeployStatusFile | null> {
  try {
    const raw = await fs.readFile(STATUS_FILE, "utf8");
    const data = JSON.parse(raw) as GitDeployStatusFile;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

async function readExitCode(): Promise<number | null> {
  try {
    const raw = (await fs.readFile(EXIT_FILE, "utf8")).trim();
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function readLogTail(maxChars = 12_000): Promise<string> {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    if (raw.length <= maxChars) return raw;
    return raw.slice(raw.length - maxChars);
  } catch {
    return "";
  }
}

async function isScreenRunning(): Promise<boolean> {
  if (process.platform === "win32") return false;
  try {
    const { stdout } = await execFileAsync("screen", ["-list"], { timeout: 5_000 });
    const re = new RegExp(`[\\s:][0-9]+\\.${SCREEN_SESSION}[\\s(]`);
    return re.test(stdout);
  } catch (error) {
    const err = error as { stdout?: string; status?: number };
    if (typeof err.stdout === "string") {
      const re = new RegExp(`[\\s:][0-9]+\\.${SCREEN_SESSION}[\\s(]`);
      return re.test(err.stdout);
    }
    return false;
  }
}

export async function getGitDeployStatus(): Promise<GitDeployStatus> {
  const enabled = isGitDeployEnabled();
  const webhookConfigured = Boolean(getGitDeployWebhookSecret());
  const fileStatus = await readJsonStatus();
  const runningScreen = await isScreenRunning();
  const exitCode = (await readExitCode()) ?? fileStatus?.exitCode ?? null;
  const logTail = await readLogTail();

  let running = runningScreen;
  if (!running && fileStatus && (fileStatus.state === "starting" || fileStatus.state === "running")) {
    // короткий grace: screen ещё поднимается
    const started = fileStatus.startedAt ? Date.parse(fileStatus.startedAt) : NaN;
    running = !Number.isNaN(started) && Date.now() - started < 15_000 && exitCode == null;
  }

  const configured = enabled && process.platform === "linux";
  let hint: string | null = null;
  if (!enabled) {
    hint = "GIT_DEPLOY_ENABLED выключен";
  } else if (process.platform !== "linux") {
    hint = "Git-деплой рассчитан на Linux production";
  } else if (!webhookConfigured) {
    hint = "Задайте GIT_DEPLOY_WEBHOOK_SECRET для webhook с GitHub (кнопка админки работает без него)";
  }

  return {
    enabled,
    configured,
    canDeploy: configured && !running,
    platform: process.platform,
    branch: getGitDeployBranch(),
    webhookConfigured,
    running,
    status: fileStatus,
    logTail,
    exitCode,
    hint,
  };
}

export type StartGitDeployResult =
  | { ok: true; message: string; alreadyRunning?: boolean }
  | { ok: false; error: string; status: number };

export async function startGitDeploy(options: {
  trigger: GitDeployTrigger;
  force?: boolean;
}): Promise<StartGitDeployResult> {
  if (!isGitDeployEnabled()) {
    return { ok: false, status: 403, error: "Git-деплой выключен (GIT_DEPLOY_ENABLED)" };
  }
  if (process.platform !== "linux") {
    return { ok: false, status: 400, error: "Git-деплой доступен только на Linux-сервере" };
  }

  const current = await getGitDeployStatus();
  if (current.running) {
    return {
      ok: true,
      alreadyRunning: true,
      message: "Деплой уже выполняется (screen ta_deploy)",
    };
  }

  const trigger = String(options.trigger).replace(/[^a-z0-9_-]/gi, "") || "cli";
  const force = options.force ? "1" : "0";
  // Args survive sudo env reset: /usr/local/sbin/ta-git-deploy-trigger <trigger> <force>
  const command = `${getTriggerBin()} ${trigger} ${force}`;

  try {
    const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
      timeout: 20_000,
      env: process.env,
    });
    const combined = `${stdout}\n${stderr}`.trim();
    if (combined.includes("already running")) {
      return { ok: true, alreadyRunning: true, message: "Деплой уже выполняется" };
    }
    return {
      ok: true,
      message: `Деплой запущен (${trigger}) → ветка ${getGitDeployBranch()}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const err = error as { code?: number; stdout?: string; stderr?: string };
    if (err.code === 2 || `${err.stderr ?? ""}${err.stdout ?? ""}`.includes("already running")) {
      return { ok: true, alreadyRunning: true, message: "Деплой уже выполняется" };
    }
    return {
      ok: false,
      status: 500,
      error: `Не удалось запустить деплой (нужен sudoers на ${DEFAULT_TRIGGER_BIN}): ${detail}`,
    };
  }
}

export function verifyGitHubWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = getGitDeployWebhookSecret();
  if (!secret || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type GitHubPushPayload = {
  ref?: string;
  deleted?: boolean;
  repository?: { full_name?: string };
  commits?: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
  head_commit?: {
    added?: string[];
    modified?: string[];
    removed?: string[];
    id?: string;
    message?: string;
  } | null;
};

function pathIgnored(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  return IGNORE_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return p.startsWith(prefix);
    return p === prefix || p.startsWith(`${prefix}/`);
  });
}

export function shouldDeployFromGitHubPush(payload: unknown, branch: string): {
  deploy: boolean;
  reason: string;
} {
  const data = payload as GitHubPushPayload;
  const expectedRef = `refs/heads/${branch}`;
  if (data.deleted) {
    return { deploy: false, reason: "push deleted ref" };
  }
  if (data.ref !== expectedRef) {
    return { deploy: false, reason: `ref ${data.ref ?? "?"} ≠ ${expectedRef}` };
  }

  const paths = new Set<string>();
  for (const commit of data.commits ?? []) {
    for (const list of [commit.added, commit.modified, commit.removed]) {
      for (const p of list ?? []) paths.add(p);
    }
  }
  if (data.head_commit) {
    for (const list of [data.head_commit.added, data.head_commit.modified, data.head_commit.removed]) {
      for (const p of list ?? []) paths.add(p);
    }
  }

  if (paths.size === 0) {
    // empty commits array still may mean force-push / sync — deploy
    return { deploy: true, reason: "push without path list — deploy" };
  }

  const relevant = [...paths].filter((p) => !pathIgnored(p));
  if (relevant.length === 0) {
    return { deploy: false, reason: "только docs/meta — пропуск" };
  }
  return { deploy: true, reason: `изменено ${relevant.length} файлов кода` };
}

export function parseGitHubPushPayload(rawBody: string): unknown {
  return JSON.parse(rawBody) as unknown;
}
