#!/usr/bin/env tsx
/**
 * VK-бот сообщества для привязки аккаунта (Long Poll).
 * Запуск: npm run notifications:vk-bot
 *
 * Должен работать в одном экземпляре на токен.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  isValidVkBotToken,
  isValidVkGroupId,
} from "../src/lib/admin/notification-settings.js";
import { normalizeVkGroupId } from "../src/lib/notifications/channels/vk.js";
import { consumeVkLinkToken } from "../src/lib/notifications/link.js";
import { getNotificationRuntimeConfig } from "../src/lib/notifications/runtime-config.js";
import { prisma } from "../src/lib/prisma.js";

const VK_API_VERSION = "5.199";
const LOCK_FILE = path.join(process.cwd(), ".vk-bot.lock");

type VkLongPollServer = {
  key: string;
  server: string;
  ts: string;
};

type VkMessage = {
  id?: number;
  from_id?: number;
  peer_id?: number;
  text?: string;
  ref?: string;
};

type VkLongPollUpdate = {
  type?: string;
  object?: {
    message?: VkMessage;
  };
};

type VkLongPollResponse = {
  failed?: number;
  ts?: string;
  updates?: VkLongPollUpdate[];
};

let activeToken: string | null = null;
let activeGroupId: string | null = null;
let longPoll: VkLongPollServer | null = null;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, "utf8").trim();
      const pid = Number.parseInt(raw, 10);
      if (Number.isFinite(pid) && pid > 0 && isProcessAlive(pid)) {
        return false;
      }
      fs.unlinkSync(LOCK_FILE);
    }

    fs.writeFileSync(LOCK_FILE, String(process.pid), "utf8");
    return true;
  } catch {
    return true;
  }
}

function releaseLock(): void {
  try {
    if (!fs.existsSync(LOCK_FILE)) return;
    const raw = fs.readFileSync(LOCK_FILE, "utf8").trim();
    if (raw === String(process.pid)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    /* ignore */
  }
}

async function vkApiRequest<T>(
  method: string,
  token: string,
  params: Record<string, string | number>,
): Promise<T | null> {
  const url = new URL(`https://api.vk.com/method/${method}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("v", VK_API_VERSION);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url);
    const data = (await response.json()) as { response?: T; error?: { error_msg?: string } };
    if (data.error) {
      console.error(`[vk-bot] ${method} failed`, data.error.error_msg ?? "unknown");
      return null;
    }
    return data.response ?? null;
  } catch (error) {
    console.error(`[vk-bot] ${method} request error`, error);
    return null;
  }
}

async function resolveBotConfig(): Promise<{ token: string; groupId: string } | null> {
  const config = await getNotificationRuntimeConfig();
  const token = config.vkBotToken;
  const groupId = config.vkGroupId;

  if (!token || !groupId || !isValidVkBotToken(token) || !isValidVkGroupId(groupId)) {
    return null;
  }

  return { token, groupId: normalizeVkGroupId(groupId) };
}

async function refreshLongPollServer(token: string, groupId: string): Promise<VkLongPollServer | null> {
  const response = await vkApiRequest<VkLongPollServer>("groups.getLongPollServer", token, {
    group_id: groupId,
  });
  if (!response?.key || !response.server || !response.ts) return null;
  return response;
}

async function sendMessage(token: string, peerId: number, text: string): Promise<void> {
  const randomId = Math.floor(Math.random() * 2_000_000_000);
  await vkApiRequest("messages.send", token, {
    peer_id: peerId,
    random_id: randomId,
    message: text,
  });
}

function readLinkToken(message: VkMessage): string | null {
  if (message.ref?.trim()) return message.ref.trim();

  const text = message.text?.trim() ?? "";
  const startMatch = /^\/start(?:@\w+)?\s+(.+)$/i.exec(text);
  if (startMatch?.[1]) return startMatch[1].trim();

  return null;
}

async function handleMessage(token: string, message: VkMessage): Promise<void> {
  const fromId = message.from_id;
  if (!fromId || fromId < 0) return;

  const linkToken = readLinkToken(message);
  const peerId = message.peer_id ?? fromId;

  if (!linkToken) {
    if (message.text?.trim().toLowerCase() === "начать" || message.text?.trim() === "/start") {
      await sendMessage(
        token,
        peerId,
        "Откройте ссылку привязки в настройках Track Anime (Настройки → Уведомления → VK).",
      );
    }
    return;
  }

  const result = await consumeVkLinkToken(linkToken, String(fromId));

  if (!result.ok) {
    const messages: Record<string, string> = {
      empty_token: "Пустой код привязки.",
      invalid_token: "Код привязки не найден. Запросите новую ссылку на сайте.",
      expired_token: "Код привязки истёк. Запросите новую ссылку на сайте.",
      user_already_linked: "Этот VK уже привязан к другому аккаунту.",
    };
    await sendMessage(token, peerId, messages[result.reason] ?? "Не удалось привязать аккаунт.");
    return;
  }

  await prisma.userNotificationPreferences.upsert({
    where: { userId: result.userId },
    create: {
      userId: result.userId,
      historyNewEnabled: true,
      vkEnabled: true,
    },
    update: {
      historyNewEnabled: true,
      vkEnabled: true,
    },
  });

  await sendMessage(
    token,
    peerId,
    "Готово! Track Anime привязан. Уведомления о новых сериях из вашей истории можно включить в настройках сайта.",
  );
}

function buildLongPollRequestUrl(server: string): URL {
  const trimmed = server.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return new URL(trimmed);
  }
  return new URL(`https://${trimmed}`);
}

async function poll(): Promise<void> {
  const config = await resolveBotConfig();
  if (!config) {
    if (activeToken) {
      console.warn("[vk-bot] token or group id invalid or removed, waiting...");
      activeToken = null;
      activeGroupId = null;
      longPoll = null;
    } else {
      console.warn("[vk-bot] VK_BOT_TOKEN / VK_GROUP_ID не заданы (env или админка), ждём...");
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return;
  }

  if (config.token !== activeToken || config.groupId !== activeGroupId || !longPoll) {
    activeToken = config.token;
    activeGroupId = config.groupId;
    longPoll = await refreshLongPollServer(config.token, config.groupId);
    if (!longPoll) {
      console.error("[vk-bot] failed to get long poll server");
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return;
    }
    console.log("[vk-bot] long poll connected");
  }

  const pollUrl = buildLongPollRequestUrl(longPoll.server);
  pollUrl.searchParams.set("act", "a_check");
  pollUrl.searchParams.set("key", longPoll.key);
  pollUrl.searchParams.set("ts", longPoll.ts);
  pollUrl.searchParams.set("wait", "25");

  let data: VkLongPollResponse;
  try {
    const response = await fetch(pollUrl);
    data = (await response.json()) as VkLongPollResponse;
  } catch (error) {
    console.error("[vk-bot] long poll request failed", error);
    longPoll = null;
    return;
  }

  if (data.failed === 1 && data.ts) {
    longPoll.ts = data.ts;
    return;
  }

  if (data.failed === 2 || data.failed === 3) {
    longPoll = null;
    return;
  }

  if (data.ts) {
    longPoll.ts = data.ts;
  }

  if (!data.updates?.length) return;

  for (const update of data.updates) {
    if (update.type !== "message_new") continue;
    const message = update.object?.message;
    if (!message) continue;

    try {
      await handleMessage(activeToken, message);
    } catch (error) {
      console.error("[vk-bot] handle message failed", error);
    }
  }
}

async function main() {
  if (!acquireLock()) {
    console.error(`[vk-bot] Уже запущен другой экземпляр (lock: ${LOCK_FILE}). Завершите лишний процесс.`);
    process.exitCode = 1;
    return;
  }

  const cleanup = () => releaseLock();
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  console.log("[vk-bot] starting");
  while (true) {
    try {
      await poll();
    } catch (error) {
      console.error("[vk-bot] poll error", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    releaseLock();
    await prisma.$disconnect();
  });
