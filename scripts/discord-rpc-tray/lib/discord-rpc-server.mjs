import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const RPC = require("discord-rpc");

const DEFAULT_PORT = 6738;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_LARGE_IMAGE = "logo";

const ALLOWED_ORIGINS = new Set([
  "https://ta.dygdyg.ru",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function createLogger(onLog) {
  const emit = (level, message) => {
    const line = `[discord-rpc] ${message}`;
    onLog?.({ level, line, time: Date.now() });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };

  return {
    info: (message) => emit("info", message),
    warn: (message) => emit("warn", message),
    error: (message) => emit("error", message),
  };
}

function formatEpisodeState(episodeNumber, paused, sitePageLabel) {
  const icon = paused ? "⏸" : "▶";
  let state = `Серия: ${episodeNumber} | ${icon}`;
  if (sitePageLabel) {
    state = `${state} · ${sitePageLabel}`;
  }
  return state.slice(0, 128);
}

function formatBrowseState(sitePageLabel) {
  return `На сайте: ${sitePageLabel}`.slice(0, 128);
}

function buildActivityPayload(data, defaultLargeImage) {
  const largeImageKey = data.largeImageKey ?? defaultLargeImage;
  const mode = data.mode === "browse" ? "browse" : "watch";
  const nowSec = Math.floor(Date.now() / 1000);

  if (mode === "browse") {
    const sitePageLabel = String(data.sitePageLabel ?? "Track Anime").slice(0, 64);
    const activity = {
      details: "Track Anime",
      state: formatBrowseState(sitePageLabel),
      largeImageKey,
      largeImageText: "Track Anime",
    };

    if (data.openButtonEnabled && data.pageUrl) {
      activity.buttons = [{ label: "Открыть", url: String(data.pageUrl).slice(0, 512) }];
    }

    return activity;
  }

  const positionSeconds = Math.max(0, Math.floor(Number(data.positionSeconds) || 0));
  const paused = Boolean(data.paused);
  const activity = {
    details: String(data.animeTitle ?? "Track Anime").slice(0, 128),
    state: formatEpisodeState(data.episodeNumber ?? 1, paused, data.sitePageLabel).slice(0, 128),
    startTimestamp: nowSec - positionSeconds,
    largeImageKey,
    largeImageText: "Track Anime",
  };

  if (paused) {
    activity.endTimestamp = nowSec;
  }

  if (data.openButtonEnabled && data.pageUrl) {
    activity.buttons = [{ label: "Открыть", url: String(data.pageUrl).slice(0, 512) }];
  }

  return activity;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/**
 * @param {{
 *   onLog?: (entry: { level: string; line: string; time: number }) => void;
 *   port?: number;
 *   host?: string;
 *   clientId?: string | null;
 *   largeImageKey?: string;
 * }} [options]
 */
export function startDiscordRpcServer(options = {}) {
  const log = createLogger(options.onLog);
  const port = options.port ?? Number(process.env.DISCORD_RPC_BRIDGE_PORT ?? DEFAULT_PORT);
  const host = options.host ?? process.env.DISCORD_RPC_BRIDGE_HOST ?? DEFAULT_HOST;
  const envClientId = process.env.DISCORD_APP_ID ?? process.env.NEXT_PUBLIC_DISCORD_APP_ID ?? null;
  const defaultClientId = options.clientId ?? envClientId;
  const defaultLargeImage = options.largeImageKey ?? process.env.DISCORD_RPC_LARGE_IMAGE ?? DEFAULT_LARGE_IMAGE;

  if (!defaultClientId) {
    log.warn("DISCORD_APP_ID не задан — ожидается applicationId от сайта в POST /presence");
  }

  const rpc = new RPC.Client({ transport: "ipc" });
  let rpcReady = false;
  let loggedInClientId = null;
  let pendingPresence = null;
  let loginRetryTimer = null;

  function clearLoginRetry() {
    if (loginRetryTimer) {
      clearTimeout(loginRetryTimer);
      loginRetryTimer = null;
    }
  }

  async function applyPresence(data) {
    pendingPresence = data;
    const clientId = data?.applicationId ?? defaultClientId ?? loggedInClientId;

    if (!data?.active) {
      if (!rpcReady) {
        pendingPresence = null;
        return;
      }
      pendingPresence = null;
      await rpc.clearActivity();
      return;
    }

    if (!clientId) {
      log.warn("applicationId не передан — задайте ID в админке сайта или DISCORD_APP_ID");
      return;
    }

    if (!rpcReady || loggedInClientId !== clientId) {
      await loginRpc(clientId);
    }

    if (!rpcReady) return;

    const largeImageKey = data.largeImageKey ?? defaultLargeImage;
    await rpc.setActivity(buildActivityPayload(data, largeImageKey));
  }

  async function loginRpc(clientId) {
    try {
      clearLoginRetry();
      if (rpcReady && loggedInClientId !== clientId) {
        rpc.destroy();
        rpcReady = false;
      }
      await rpc.login({ clientId });
      loggedInClientId = clientId;
      rpcReady = true;
      log.info(`connected (client ${clientId})`);
      if (pendingPresence) await applyPresence(pendingPresence);
    } catch (error) {
      rpcReady = false;
      const message = error instanceof Error ? error.message : String(error);
      log.error(`login failed: ${message}`);
      log.error("Убедитесь, что Discord desktop запущен");
      loginRetryTimer = setTimeout(() => void loginRpc(clientId), 5000);
    }
  }

  rpc.on("ready", () => {
    log.info("ready");
  });

  function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, discord: rpcReady }));
        return;
      }

      if (req.method === "POST" && req.url === "/presence") {
        const body = await readJsonBody(req);
        await applyPresence(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  server.listen(port, host, () => {
    log.info(`bridge http://${host}:${port}`);
    log.info("waiting for Discord desktop...");
    if (defaultClientId) void loginRpc(defaultClientId);
  });

  return {
    port,
    host,
    getDiscordReady: () => rpcReady,
    close() {
      clearLoginRetry();
      pendingPresence = null;

      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      server.close();

      if (rpcReady) {
        try {
          void rpc.clearActivity().catch(() => {});
        } catch {
          // ignore shutdown errors
        }
      }

      try {
        rpc.removeAllListeners();
        rpc.destroy();
      } catch {
        // ignore shutdown errors
      }

      rpcReady = false;
      loggedInClientId = null;
    },
  };
}
