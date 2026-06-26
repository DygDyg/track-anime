import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");
const buildNumberPath = path.join(root, ".build-number");

if (!fs.existsSync(nextDir)) {
  console.error("write-build-info: .next not found — run next build first");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function readBuildNumberFile() {
  if (!fs.existsSync(buildNumberPath)) return null;
  const raw = fs.readFileSync(buildNumberPath, "utf8").trim();
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const envBuildNumber = Number.parseInt(process.env.BUILD_NUMBER ?? "", 10);
const buildNumber =
  Number.isFinite(envBuildNumber) && envBuildNumber > 0
    ? envBuildNumber
    : readBuildNumberFile();

const info = {
  version: pkg.version ?? "0.0.0",
  buildNumber,
  builtAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(nextDir, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(
  "write-build-info:",
  info.version,
  buildNumber != null ? `#${buildNumber}` : "(no build number)",
  info.builtAt,
);
