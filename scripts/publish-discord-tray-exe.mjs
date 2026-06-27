#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "scripts", "discord-rpc-tray", "dist", "TrackAnimeDiscordRPC.exe");
const targetDir = path.join(root, "public", "downloads");
const target = path.join(targetDir, "TrackAnimeDiscordRPC.exe");

if (!fs.existsSync(source)) {
  console.error("publish-discord-tray-exe: сначала выполните npm run discord:tray:build");
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);

const sizeMb = (fs.statSync(target).size / (1024 * 1024)).toFixed(1);
console.log(`publish-discord-tray-exe: ${target} (${sizeMb} MB)`);
