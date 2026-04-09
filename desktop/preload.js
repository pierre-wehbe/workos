const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  openInIDE: (p, ide) => ipcRenderer.invoke("app:open-in-ide", p, ide),
  openInFinder: (p) => ipcRenderer.invoke("app:open-in-finder", p),

  // Theme
  setTheme: (mode) => ipcRenderer.invoke("theme:set", mode),

  // Shell
  runSync: (cmd) => ipcRenderer.invoke("shell:run-sync", cmd),
  selectDirectory: () => ipcRenderer.invoke("shell:select-directory"),
  runStreaming: (id, cmd) => ipcRenderer.send("shell:run-streaming", { id, cmd }),
  cancelCommand: (id) => ipcRenderer.send("shell:cancel", { id }),
  onStdout: (cb) => {
    const handler = (_e, d) => cb(d.id, d.chunk);
    ipcRenderer.on("shell:stdout", handler);
    return () => ipcRenderer.removeListener("shell:stdout", handler);
  },
  onStderr: (cb) => {
    const handler = (_e, d) => cb(d.id, d.chunk);
    ipcRenderer.on("shell:stderr", handler);
    return () => ipcRenderer.removeListener("shell:stderr", handler);
  },
  onComplete: (cb) => {
    const handler = (_e, d) => cb(d.id, d.exitCode);
    ipcRenderer.on("shell:complete", handler);
    return () => ipcRenderer.removeListener("shell:complete", handler);
  },
  removeShellListeners: () => {
    ipcRenderer.removeAllListeners("shell:stdout");
    ipcRenderer.removeAllListeners("shell:stderr");
    ipcRenderer.removeAllListeners("shell:complete");
  },

  // Database
  getWorkspaces: () => ipcRenderer.invoke("db:get-workspaces"),
  createWorkspace: (data) => ipcRenderer.invoke("db:create-workspace", data),
  deleteWorkspace: (id) => ipcRenderer.invoke("db:delete-workspace", id),
  getActiveWorkspace: () => ipcRenderer.invoke("db:get-active-workspace"),
  setActiveWorkspace: (id) => ipcRenderer.invoke("db:set-active-workspace", id),
  getProjects: (wsId) => ipcRenderer.invoke("db:get-projects", wsId),
  createProject: (data) => ipcRenderer.invoke("db:create-project", data),
  updateProject: (id, data) => ipcRenderer.invoke("db:update-project", id, data),
  deleteProject: (id) => ipcRenderer.invoke("db:delete-project", id),
  getProject: (id) => ipcRenderer.invoke("db:get-project", id),
  setSetupComplete: (val) => ipcRenderer.invoke("db:set-setup-complete", val),
  exportConfig: () => ipcRenderer.invoke("db:export-config"),
  importConfig: (json) => ipcRenderer.invoke("db:import-config", json),
});
