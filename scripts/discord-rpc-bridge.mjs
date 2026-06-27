#!/usr/bin/env node
/**
 * Локальный мост Discord Rich Presence для Track Anime (консольный режим).
 *
 * Для Windows с иконкой в трее: npm run discord:tray
 * Portable exe: npm run discord:tray:build
 *
 * Запуск: npm run discord:bridge
 */
import { startDiscordRpcServer } from "./discord-rpc-tray/lib/discord-rpc-server.mjs";

const server = startDiscordRpcServer();

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
