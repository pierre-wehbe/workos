const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  openInIDE: (p, ide) => ipcRenderer.invoke("app:open-in-ide", p, ide),
  openInFinder: (p) => ipcRenderer.invoke("app:open-in-finder", p),
  getDbPath: () => ipcRenderer.invoke("app:get-db-path"),
  revealDb: () => ipcRenderer.invoke("app:reveal-db"),

  // AI CLI
  setAICli: (cli) => ipcRenderer.invoke("ai:set-cli", cli),
  getAIStatus: (cli) => ipcRenderer.invoke("ai:get-status", cli),

  // Theme
  setTheme: (mode) => ipcRenderer.invoke("theme:set", mode),

  // Shell
  runSync: (cmd) => ipcRenderer.invoke("shell:run-sync", cmd),
  selectDirectory: () => ipcRenderer.invoke("shell:select-directory"),
  scanRepos: (wsPath) => ipcRenderer.invoke("shell:scan-repos", wsPath),
  initRepo: (projectPath) => ipcRenderer.invoke("shell:init-repo", projectPath),
  cloneRepo: (repoUrl, targetPath) => ipcRenderer.invoke("shell:clone-repo", repoUrl, targetPath),
  isGitRepo: (dirPath) => ipcRenderer.invoke("shell:is-git-repo", dirPath),
  gitBranch: (dirPath) => ipcRenderer.invoke("shell:git-branch", dirPath),
  deleteDirectory: (dirPath) => ipcRenderer.invoke("shell:delete-directory", dirPath),
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
  getTools: (projectId) => ipcRenderer.invoke("db:get-tools", projectId),
  createTool: (data) => ipcRenderer.invoke("db:create-tool", data),
  deleteTool: (id) => ipcRenderer.invoke("db:delete-tool", id),
  updateTool: (id, data) => ipcRenderer.invoke("db:update-tool", id, data),
  discoverScripts: (projectPath) => ipcRenderer.invoke("shell:discover-scripts", projectPath),

  // Machine
  scanMachine: () => ipcRenderer.invoke("machine:scan"),
  fixShellConfig: (file, line) => ipcRenderer.invoke("machine:fix-shell", file, line),
  checkBrewOutdated: () => ipcRenderer.invoke("machine:brew-outdated"),
  setPyenvGlobal: (version) => ipcRenderer.invoke("machine:pyenv-global", version),
  checkMachineUpdates: () => ipcRenderer.invoke("machine:check-updates"),

  // GitHub
  githubFetch: () => ipcRenderer.invoke("github:fetch"),
  githubCache: () => ipcRenderer.invoke("github:cache"),
  githubCheck: () => ipcRenderer.invoke("github:check"),
  githubUserOrgs: () => ipcRenderer.invoke("github:user-orgs"),
  updateWorkspace: (id, data) => ipcRenderer.invoke("db:update-workspace", id, data),
  onGithubUpdate: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on("github:update", handler);
    return () => ipcRenderer.removeListener("github:update", handler);
  },

  // Processes
  startProcess: (data) => ipcRenderer.invoke("process:start", data),
  stopProcess: (id) => ipcRenderer.invoke("process:stop", id),
  listProcesses: () => ipcRenderer.invoke("process:list"),
  clearProcess: (id) => ipcRenderer.invoke("process:clear", id),
  clearAllStopped: () => ipcRenderer.invoke("process:clear-all-stopped"),
  getProcessLogs: (id) => ipcRenderer.invoke("process:logs", id),
  getRunningCount: () => ipcRenderer.invoke("process:running-count"),
  getProcessEnv: (id) => ipcRenderer.invoke("process:env", id),
  onProcessUpdate: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on("process:on-update", handler);
    return () => ipcRenderer.removeListener("process:on-update", handler);
  },
  onProcessOutput: (cb) => {
    const handler = (_e, d) => cb(d.id, d.chunk);
    ipcRenderer.on("process:on-output", handler);
    return () => ipcRenderer.removeListener("process:on-output", handler);
  },
});
