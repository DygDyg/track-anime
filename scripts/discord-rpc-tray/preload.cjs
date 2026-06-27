const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rpcTray", {
  getHistory: () => ipcRenderer.invoke("get-logs"),
  onLog: (callback) => {
    ipcRenderer.on("log", (_event, entry) => callback(entry));
  },
});
