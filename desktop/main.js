const { BrowserWindow, app, dialog, ipcMain, nativeTheme, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");
const { loadShellEnvironment } = require("./shell-env.js");
const db = require("./db.js");
const { runSync, runStreaming, cancelProcess, killAll } = require("./executor.js");
const { checkForUpdate } = require("./updater.js");

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1512" : "#f8faf9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  loadShellEnvironment();
  db.init(app);
  checkForUpdate(app, session, db);

  // --- App ---
  ipcMain.handle("app:get-config", () => ({
    setupComplete: db.getSetupComplete(),
    activeWorkspaceId: db.getMeta("active_workspace_id"),
    appVersion: app.getVersion(),
  }));

  ipcMain.handle("app:open-in-ide", (_e, targetPath, ide) => {
    const cmd = ide === "xcode" ? "open" : ide === "vscode" ? "code" : "cursor";
    const args = ide === "xcode" ? ["-a", "Xcode", targetPath] : [targetPath];
    spawn(cmd, args, { env: loadShellEnvironment(), detached: true, stdio: "ignore" }).unref();
  });

  ipcMain.handle("app:open-in-finder", (_e, targetPath) => {
    spawn("open", [targetPath], { detached: true, stdio: "ignore" }).unref();
  });

  // --- Theme ---
  ipcMain.handle("theme:set", (_e, mode) => { nativeTheme.themeSource = mode; });

  // --- Shell ---
  ipcMain.handle("shell:run-sync", (_e, cmd) => runSync(cmd));
  ipcMain.handle("shell:select-directory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("shell:scan-repos", (_e, wsPath) => {
    const env = loadShellEnvironment();
    const entries = fs.readdirSync(wsPath, { withFileTypes: true });
    const repos = [];

    // Check if workspace itself is a repo
    if (fs.existsSync(path.join(wsPath, ".git"))) {
      const name = path.basename(wsPath);
      let repoUrl = "";
      try { repoUrl = execFileSync("git", ["-C", wsPath, "remote", "get-url", "origin"], { encoding: "utf8", env, timeout: 5000 }).trim(); } catch {}
      repos.push({ name, localPath: wsPath, repoUrl });
    }

    // Check 1 level deep
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const fullPath = path.join(wsPath, entry.name);
      if (!fs.existsSync(path.join(fullPath, ".git"))) continue;
      let repoUrl = "";
      try { repoUrl = execFileSync("git", ["-C", fullPath, "remote", "get-url", "origin"], { encoding: "utf8", env, timeout: 5000 }).trim(); } catch {}
      repos.push({ name: entry.name, localPath: fullPath, repoUrl });
    }

    return repos;
  });
  ipcMain.handle("shell:init-repo", (_e, projectPath) => {
    const env = loadShellEnvironment();
    fs.mkdirSync(projectPath, { recursive: true });
    try {
      execFileSync("git", ["init", "-b", "main"], { cwd: projectPath, encoding: "utf8", env, timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("shell:clone-repo", (_e, repoUrl, targetPath) => {
    const env = loadShellEnvironment();
    try {
      execFileSync("git", ["clone", repoUrl, targetPath], { encoding: "utf8", env, timeout: 120000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });
  ipcMain.handle("shell:is-git-repo", (_e, dirPath) => {
    return fs.existsSync(path.join(dirPath, ".git"));
  });
  ipcMain.handle("shell:git-branch", (_e, dirPath) => {
    const env = loadShellEnvironment();
    try {
      return execFileSync("git", ["-C", dirPath, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", env, timeout: 5000 }).trim();
    } catch {
      return null;
    }
  });
  ipcMain.handle("shell:delete-directory", (_e, dirPath) => {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.on("shell:run-streaming", (_e, { id, cmd }) => { if (mainWindow) runStreaming(id, cmd, mainWindow); });
  ipcMain.on("shell:cancel", (_e, { id }) => { cancelProcess(id); });

  // --- Database ---
  ipcMain.handle("db:get-workspaces", () => db.getWorkspaces());
  ipcMain.handle("db:create-workspace", (_e, data) => db.createWorkspace(data));
  ipcMain.handle("db:delete-workspace", (_e, id) => db.deleteWorkspace(id));
  ipcMain.handle("db:get-active-workspace", () => db.getActiveWorkspace());
  ipcMain.handle("db:set-active-workspace", (_e, id) => db.setActiveWorkspace(id));
  ipcMain.handle("db:get-projects", (_e, wsId) => db.getProjects(wsId));
  ipcMain.handle("db:create-project", (_e, data) => db.createProject(data));
  ipcMain.handle("db:update-project", (_e, id, data) => db.updateProject(id, data));
  ipcMain.handle("db:delete-project", (_e, id) => db.deleteProject(id));
  ipcMain.handle("db:get-project", (_e, id) => db.getProjectById(id));
  ipcMain.handle("db:set-setup-complete", (_e, val) => db.setSetupComplete(val));
  ipcMain.handle("db:export-config", () => db.exportConfig());
  ipcMain.handle("db:import-config", (_e, json) => db.importConfig(json));

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => { killAll(); });
app.on("window-all-closed", () => { app.quit(); });
