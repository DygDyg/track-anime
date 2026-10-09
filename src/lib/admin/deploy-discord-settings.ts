import fs from "node:fs/promises";
import path from "node:path";
import "server-only";
import {
  DEPLOY_DISCORD_NOTIFY_USERNAME,
  type DeployDiscordNotifyFile,
  type DeployDiscordSettingsDto,
} from "@/lib/admin/deploy-discord-settings-types";
import { prisma } from "@/lib/prisma";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/site-url";

export type { DeployDiscordNotifyFile, DeployDiscordSettingsDto };
export { DEPLOY_DISCORD_NOTIFY_USERNAME };

export const DEPLOY_DISCORD_SETTINGS_ID = "default";
export const DEPLOY_DISCORD_NOTIFY_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "deploy-discord-notify.json",
);

type DeployDiscordSettingsRow = {
  webhookUrl: string;
  notifyStarted: boolean;
  notifyFinished: boolean;
  updatedAt: Date;
};

type DeployDiscordSettingsDelegate = {
  upsert(args: {
    where: { id: string };
    create: {
      id: string;
      webhookUrl: string;
      notifyStarted: boolean;
      notifyFinished: boolean;
    };
    update: Record<string, never>;
  }): Promise<DeployDiscordSettingsRow>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<DeployDiscordSettingsRow>;
  update(args: {
    where: { id: string };
    data: {
      webhookUrl?: string;
      notifyStarted?: boolean;
      notifyFinished?: boolean;
    };
  }): Promise<DeployDiscordSettingsRow>;
};

function getDelegate(): DeployDiscordSettingsDelegate | null {
  const delegate = (prisma as unknown as { deployDiscordSettings?: DeployDiscordSettingsDelegate })
    .deployDiscordSettings;
  return typeof delegate?.upsert === "function" ? delegate : null;
}

export function getDeployDiscordAvatarUrl(): string {
  return toAbsoluteUrl("/api/brand/favicon") ?? `${getSiteUrl()}/api/brand/favicon`;
}

function maskWebhookUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const tip = last.length > 4 ? `…${last.slice(-4)}` : "…";
    return `${parsed.origin}/api/webhooks/…/${tip}`;
  } catch {
    if (trimmed.length <= 12) return "…";
    return `${trimmed.slice(0, 24)}…`;
  }
}

function toDto(row: DeployDiscordSettingsRow): DeployDiscordSettingsDto {
  const webhookUrl = row.webhookUrl?.trim() ?? "";
  return {
    webhookConfigured: Boolean(webhookUrl),
    webhookUrlMasked: maskWebhookUrl(webhookUrl),
    notifyStarted: Boolean(row.notifyStarted),
    notifyFinished: Boolean(row.notifyFinished),
    username: DEPLOY_DISCORD_NOTIFY_USERNAME,
    avatarUrl: getDeployDiscordAvatarUrl(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function envWebhookFallback(): string {
  return process.env.DEPLOY_DISCORD_WEBHOOK_URL?.trim() ?? "";
}

export async function writeDeployDiscordNotifyFile(input: {
  webhookUrl: string;
  notifyStarted: boolean;
  notifyFinished: boolean;
}): Promise<void> {
  const payload: DeployDiscordNotifyFile = {
    version: 1,
    webhookUrl: input.webhookUrl.trim(),
    notifyStarted: Boolean(input.notifyStarted),
    notifyFinished: Boolean(input.notifyFinished),
    username: DEPLOY_DISCORD_NOTIFY_USERNAME,
    avatarUrl: getDeployDiscordAvatarUrl(),
    updatedAt: new Date().toISOString(),
  };

  const dir = path.dirname(DEPLOY_DISCORD_NOTIFY_FILE);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  await fs.writeFile(
    /* turbopackIgnore: true */ DEPLOY_DISCORD_NOTIFY_FILE,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

export async function ensureDeployDiscordSettings(): Promise<void> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma client устарел: выполните npm run db:push и перезапустите сервер");
  }

  await delegate.upsert({
    where: { id: DEPLOY_DISCORD_SETTINGS_ID },
    create: {
      id: DEPLOY_DISCORD_SETTINGS_ID,
      webhookUrl: envWebhookFallback(),
      notifyStarted: true,
      notifyFinished: true,
    },
    update: {},
  });
}

export async function getDeployDiscordSettingsDto(): Promise<DeployDiscordSettingsDto> {
  await ensureDeployDiscordSettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("DeployDiscordSettings delegate missing");

  let row = await delegate.findUniqueOrThrow({ where: { id: DEPLOY_DISCORD_SETTINGS_ID } });

  // One-time seed from .env if admin never set a URL yet
  if (!row.webhookUrl.trim()) {
    const fromEnv = envWebhookFallback();
    if (fromEnv) {
      row = await delegate.update({
        where: { id: DEPLOY_DISCORD_SETTINGS_ID },
        data: { webhookUrl: fromEnv },
      });
    }
  }

  await writeDeployDiscordNotifyFile({
    webhookUrl: row.webhookUrl,
    notifyStarted: row.notifyStarted,
    notifyFinished: row.notifyFinished,
  }).catch((error) => {
    console.warn("[deploy-discord] failed to sync notify file:", error);
  });

  return toDto(row);
}

export async function updateDeployDiscordSettings(input: {
  webhookUrl?: string;
  clearWebhook?: boolean;
  notifyStarted?: boolean;
  notifyFinished?: boolean;
}): Promise<DeployDiscordSettingsDto> {
  await ensureDeployDiscordSettings();
  const delegate = getDelegate();
  if (!delegate) throw new Error("DeployDiscordSettings delegate missing");

  const data: {
    webhookUrl?: string;
    notifyStarted?: boolean;
    notifyFinished?: boolean;
  } = {};

  if (input.clearWebhook) {
    data.webhookUrl = "";
  } else if (typeof input.webhookUrl === "string" && input.webhookUrl.trim()) {
    const url = input.webhookUrl.trim();
    if (!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i.test(url)) {
      throw new Error("Ожидается URL вида https://discord.com/api/webhooks/…");
    }
    data.webhookUrl = url;
  }

  if (typeof input.notifyStarted === "boolean") data.notifyStarted = input.notifyStarted;
  if (typeof input.notifyFinished === "boolean") data.notifyFinished = input.notifyFinished;

  if (Object.keys(data).length === 0) {
    return getDeployDiscordSettingsDto();
  }

  const row = await delegate.update({
    where: { id: DEPLOY_DISCORD_SETTINGS_ID },
    data,
  });

  await writeDeployDiscordNotifyFile({
    webhookUrl: row.webhookUrl,
    notifyStarted: row.notifyStarted,
    notifyFinished: row.notifyFinished,
  });

  return toDto(row);
}
