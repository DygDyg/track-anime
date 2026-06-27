import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAutostartEnabled, setPortableAutostart } from "./autostart.mjs";
import { startDiscordRpcServer } from "./lib/discord-rpc-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_NAME = "Track Anime Discord RPC";
const APP_ID = "ru.dygdyg.trackanime.discord-rpc";
const LOG_LIMIT = 500;

/** @type {ReturnType<typeof startDiscordRpcServer> | null} */
let rpcServer = null;
/** @type {Tray | null} */
let tray = null;
/** @type {BrowserWindow | null} */
let consoleWindow = null;
/** @type {{ level: string; line: string; time: number }[]} */
const logHistory = [];
let isQuitting = false;

function shutdownRpcServer() {
  if (!rpcServer) return;
  rpcServer.close();
  rpcServer = null;
}

function destroyTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.destroy();
  tray = null;
}

function destroyConsoleWindow() {
  if (!consoleWindow || consoleWindow.isDestroyed()) return;
  consoleWindow.destroy();
  consoleWindow = null;
}

function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  shutdownRpcServer();
  destroyConsoleWindow();
  destroyTray();
  app.quit();
}

function iconPath() {
  return path.join(__dirname, "icon.png");
}

function loadAppIcon() {
  const image = nativeImage.createFromPath(iconPath());
  if (image.isEmpty()) return undefined;
  return image;
}

function loadTrayIcon() {
  const image = loadAppIcon();
  if (!image) return nativeImage.createEmpty();
  return image.resize({ width: 32, height: 32 });
}

function appendLog(entry) {
  logHistory.push(entry);
  if (logHistory.length > LOG_LIMIT) {
    logHistory.splice(0, logHistory.length - LOG_LIMIT);
  }
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    consoleWindow.webContents.send("log", entry);
  }
}

function rebuildTrayMenu() {
  if (!tray) return;

  const autostart = isAutostartEnabled(app);

  const menu = Menu.buildFromTemplate([
    {
      label: "Консоль",
      click: () => showConsoleWindow(),
    },
    { type: "separator" },
    {
      label: "Автозапуск",
      type: "checkbox",
      checked: autostart,
      click: (menuItem) => {
        void setPortableAutostart(app, menuItem.checked, {
          devMainPath: path.join(__dirname, "main.mjs"),
          onLog: appendLog,
        })
          .then(() => rebuildTrayMenu())
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            appendLog({
              level: "error",
              line: `[discord-rpc] автозапуск: ${message}`,
              time: Date.now(),
            });
            rebuildTrayMenu();
          });
      },
    },
    { type: "separator" },
    {
      label: "Выход",
      click: () => quitApp(),
    },
  ]);

  tray.setContextMenu(menu);
}

function showConsoleWindow() {
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    if (consoleWindow.isMinimized()) consoleWindow.restore();
    consoleWindow.show();
    consoleWindow.focus();
    return;
  }

  consoleWindow = new BrowserWindow({
    width: 720,
    height: 480,
    minWidth: 480,
    minHeight: 320,
    title: APP_NAME,
    icon: loadAppIcon(),
    autoHideMenuBar: true,
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  consoleWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    consoleWindow?.hide();
  });

  void consoleWindow.loadFile(path.join(__dirname, "console.html"));
}

function createTray() {
  tray = new Tray(loadTrayIcon());
  tray.setToolTip(APP_NAME);
  tray.on("click", () => showConsoleWindow());
  rebuildTrayMenu();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  if (process.platform === "win32") {
    app.setAppUserModelId(APP_ID);
  }

  app.on("second-instance", () => {
    showConsoleWindow();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    if (!fs.existsSync(iconPath())) {
      appendLog({
        level: "warn",
        line: "[discord-rpc] icon.png не найден",
        time: Date.now(),
      });
    }

    rpcServer = startDiscordRpcServer({
      onLog: appendLog,
    });

    appendLog({
      level: "info",
      line: `[discord-rpc] ${app.isPackaged ? "exe" : "tray"} mode — порт ${rpcServer.port}`,
      time: Date.now(),
    });

    createTray();
  });

  app.on("window-all-closed", (event) => {
    if (!isQuitting) {
      event.preventDefault();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    shutdownRpcServer();
    destroyTray();
  });

  ipcMain.handle("get-logs", () => logHistory.slice());
}
