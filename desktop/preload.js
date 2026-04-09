const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  setTheme: (mode) => ipcRenderer.invoke("theme:set", mode),
});
