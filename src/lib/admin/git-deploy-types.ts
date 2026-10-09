export type GitDeployState =
  | "idle"
  | "starting"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "unknown";

export type GitDeployTrigger = "admin" | "webhook" | "actions" | "cli" | string;

export type GitDeployStatusFile = {
  version: number;
  state: GitDeployState | string;
  trigger: GitDeployTrigger;
  branch: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  commitBefore: string | null;
  commitAfter: string | null;
  message: string;
  logFile: string;
};

export type GitDeployStatus = {
  enabled: boolean;
  configured: boolean;
  canDeploy: boolean;
  platform: NodeJS.Platform;
  branch: string;
  webhookConfigured: boolean;
  running: boolean;
  status: GitDeployStatusFile | null;
  logTail: string;
  exitCode: number | null;
  hint: string | null;
};
