#!/usr/bin/env tsx
/**
 * Telegram-бот для привязки аккаунта и (опционально) обработки очереди.
 * Запуск: npm run notifications:telegram-bot
 *
 * Должен работать в одном экземпляре на токен (иначе Telegram API 409 Conflict).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getNotificationRuntimeConfig } from "../src/lib/notifications/runtime-config.js";
import { isValidTelegramBotToken } from "../src/lib/admin/notification-settings.js";
import { consumeTelegramLinkToken } from "../src/lib/notifications/link.js";
import { prisma } from "../src/lib/prisma.js";

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
};

type TelegramApiResponse = {
  ok?: boolean;
  error_code?: number;
  description?: string;
  result?: TelegramUpdate[];
};

const LOCK_FILE = path.join(process.cwd(), ".telegram-bot.lock");
const CONFLICT_BACKOFF_MS = 30_000;

let offset = 0;
let activeToken: string | null = null;
let conflictWarned = false;

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

async function resolveBotToken(): Promise<string | null> {
  const config = await getNotificationRuntimeConfig();
  return config.telegramBotToken;
}

function readStartToken(text: string | undefined): string | null {
  if (!text) return null;
  const match = /^\/start(?:@\w+)?\s+(.+)$/i.exec(text.trim());
  return match?.[1]?.trim() ?? null;
}

async function readTelegramApiResponse(response: Response): Promise<TelegramApiResponse | null> {
  try {
    return (await response.json()) as TelegramApiResponse;
  } catch {
    console.error("[telegram-bot] invalid telegram api json", response.status, await response.text());
    return null;
  }
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!activeToken) {
    console.error("[telegram-bot] sendMessage skipped: token not configured");
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await readTelegramApiResponse(response);
  if (!response.ok || !data?.ok) {
    console.error(
      "[telegram-bot] sendMessage failed",
      response.status,
      data?.description ?? (await response.text().catch(() => "")),
    );
  }
}

async function ensurePollingMode(token: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
  });

  const data = await readTelegramApiResponse(response);
  if (!response.ok || !data?.ok) {
    console.error(
      "[telegram-bot] deleteWebhook failed",
      response.status,
      data?.description ?? (await response.text().catch(() => "")),
    );
  }
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = String(message.chat.id);
  const linkToken = readStartToken(message.text);

  if (!linkToken) {
    if (message.text.startsWith("/start")) {
      await sendMessage(
        message.chat.id,
        "Откройте ссылку привязки в настройках Track Anime (Настройки → Уведомления → Telegram).",
      );
    }
    return;
  }

  const result = await consumeTelegramLinkToken(linkToken, chatId);

  if (!result.ok) {
    const messages: Record<string, string> = {
      empty_token: "Пустой код привязки.",
      invalid_token: "Код привязки не найден. Запросите новую ссылку на сайте.",
      expired_token: "Код привязки истёк. Запросите новую ссылку на сайте.",
      chat_already_linked: "Этот Telegram уже привязан к другому аккаунту.",
    };
    await sendMessage(message.chat.id, messages[result.reason] ?? "Не удалось привязать аккаунт.");
    return;
  }

  await prisma.userNotificationPreferences.upsert({
    where: { userId: result.userId },
    create: {
      userId: result.userId,
      historyNewEnabled: true,
      telegramEnabled: true,
    },
    update: {
      historyNewEnabled: true,
      telegramEnabled: true,
    },
  });

  await sendMessage(
    message.chat.id,
    "Готово! Track Anime привязан. Уведомления о новых сериях из вашей истории можно включить в настройках сайта.",
  );
}

async function poll(): Promise<void> {
  const token = await resolveBotToken();
  if (!token || !isValidTelegramBotToken(token)) {
    if (activeToken) {
      console.warn("[telegram-bot] token invalid or removed from config, waiting...");
      activeToken = null;
    } else if (token) {
      console.error(
        "[telegram-bot] некорректный TELEGRAM_BOT_TOKEN в настройках (нужен формат 123456789:AAH... из @BotFather)",
      );
    } else {
      console.warn("[telegram-bot] TELEGRAM_BOT_TOKEN не задан (env или админка), ждём...");
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return;
  }

  if (token !== activeToken) {
    activeToken = token;
    await ensurePollingMode(token);
    console.log("[telegram-bot] token loaded, polling mode enabled");
  }

  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set("timeout", "30");
  if (offset > 0) url.searchParams.set("offset", String(offset));

  const response = await fetch(url);
  const data = await readTelegramApiResponse(response);

  if (!response.ok || !data?.ok) {
    if (data?.error_code === 409) {
      if (!conflictWarned) {
        conflictWarned = true;
        console.error(
          "[telegram-bot] Conflict 409: одновременно запущено несколько экземпляров бота с одним токеном.",
        );
        console.error(
          "[telegram-bot] Оставьте один процесс: либо tg_bot.bat локально, либо systemd track-anime-telegram-bot на сервере.",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, CONFLICT_BACKOFF_MS));
      return;
    }

    console.error(
      "[telegram-bot] getUpdates failed",
      response.status,
      data?.description ?? (await response.text().catch(() => "")),
    );
    return;
  }

  conflictWarned = false;

  if (!data.result) return;

  for (const update of data.result) {
    offset = update.update_id + 1;
    try {
      await handleUpdate(update);
    } catch (error) {
      console.error("[telegram-bot] handle update failed", error);
    }
  }
}

async function main() {
  if (!acquireLock()) {
    console.error(
      `[telegram-bot] Уже запущен другой экземпляр (lock: ${LOCK_FILE}). Завершите лишний процесс.`,
    );
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

  console.log("[telegram-bot] starting");
  while (true) {
    try {
      await poll();
    } catch (error) {
      console.error("[telegram-bot] poll error", error);
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
