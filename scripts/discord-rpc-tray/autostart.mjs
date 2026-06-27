import fs from "node:fs";
import path from "node:path";

export const INSTALL_DIR_NAME = "Track Anime Discord RPC";
export const INSTALL_EXE_NAME = "TrackAnimeDiscordRPC.exe";

export function getInstallDir(appDataPath) {
  return path.join(appDataPath, INSTALL_DIR_NAME);
}

export function getInstallExePath(appDataPath) {
  return path.join(getInstallDir(appDataPath), INSTALL_EXE_NAME);
}

export function pathsEqual(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

/**
 * Копирует portable exe в %APPDATA%\Track Anime Discord RPC\.
 * @returns {Promise<string>} путь к exe в AppData
 */
export async function installPortableExeToAppData(sourceExePath, appDataPath) {
  const installExe = getInstallExePath(appDataPath);
  await fs.promises.mkdir(path.dirname(installExe), { recursive: true });

  if (pathsEqual(sourceExePath, installExe)) {
    return installExe;
  }

  const tempPath = `${installExe}.tmp`;
  await fs.promises.copyFile(sourceExePath, tempPath);
  await fs.promises.rename(tempPath, installExe);
  return installExe;
}

/**
 * @param {import("electron").App} electronApp
 * @param {boolean} enabled
 * @param {{ onLog?: (entry: { level: string; line: string; time: number }) => void; devMainPath?: string }} [options]
 */
export async function setPortableAutostart(electronApp, enabled, options = {}) {
  const { onLog, devMainPath } = options;
  const log = (level, line) => {
    onLog?.({ level, line, time: Date.now() });
  };

  if (!electronApp.isPackaged) {
    electronApp.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: process.execPath,
      args: devMainPath ? [devMainPath] : [],
    });
    return;
  }

  if (process.platform !== "win32") {
    electronApp.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: process.execPath,
    });
    return;
  }

  const installExe = getInstallExePath(electronApp.getPath("appData"));

  if (enabled) {
    const target = await installPortableExeToAppData(process.execPath, electronApp.getPath("appData"));
    electronApp.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: target,
    });
    log("info", `[discord-rpc] автозапуск: копия в ${target}`);
    return;
  }

  electronApp.setLoginItemSettings({
    openAtLogin: false,
    openAsHidden: true,
    path: installExe,
  });
  log("info", "[discord-rpc] автозапуск отключён");
}

export function isAutostartEnabled(electronApp) {
  return electronApp.getLoginItemSettings().openAtLogin;
}
