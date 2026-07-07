import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientMarker = path.join(root, "node_modules", ".prisma", "client", "index.js");

const result = spawnSync("npx prisma generate", {
  cwd: root,
  encoding: "utf8",
  shell: true,
  env: process.env,
});

if (result.status === 0) {
  process.exit(0);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const engineLocked = /EPERM|operation not permitted/i.test(output);

if (engineLocked && existsSync(clientMarker)) {
  console.warn(
    "[dev] prisma generate пропущен: query engine занят другим процессом " +
      "(telegram-bot, старый dev-server). Если меняли schema — остановите процессы и запустите npm run db:generate.",
  );
  process.exit(0);
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
