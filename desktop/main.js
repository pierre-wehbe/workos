const { BrowserWindow, app, dialog, ipcMain, nativeTheme, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");
const { loadShellEnvironment } = require("./shell-env.js");
const db = require("./db.js");
const { runSync, runStreaming, cancelProcess, killAll } = require("./executor.js");
const { checkForUpdate } = require("./updater.js");
const processes = require("./processes.js");
const github = require("./github.js");
const prDetail = require("./pr-detail.js");
const agents = require("./agents.js");
const rubric = require("./rubric.js");

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    icon: path.join(__dirname, process.platform === "darwin" ? "../assets/icon.icns" : "../assets/icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1512" : "#f8faf9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setTitle("WorkOS");

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  app.setName("WorkOS");
  loadShellEnvironment();
  db.init(app);
  db.cleanupPrCache();
  checkForUpdate(app, session, db);

  // Set dock icon on macOS
  if (process.platform === "darwin" && app.dock) {
    const iconPath = path.join(__dirname, "../assets/icon.png");
    if (require("node:fs").existsSync(iconPath)) {
      app.dock.setIcon(iconPath);
    }
  }

  // --- App ---
  ipcMain.handle("app:get-config", () => ({
    setupComplete: db.getSetupComplete(),
    activeWorkspaceId: db.getMeta("active_workspace_id"),
    appVersion: app.getVersion(),
    selectedAICli: db.getMeta("selected_ai_cli") || "codex",
  }));

  // --- AI CLI ---
  ipcMain.handle("ai:set-cli", (_e, cli) => { db.setMeta("selected_ai_cli", cli); });
  ipcMain.handle("ai:get-status", async (_e, cli) => {
    const { execFile: ef } = require("node:child_process");
    const { promisify } = require("node:util");
    const fss = require("node:fs");
    const os = require("node:os");
    const execAsync = promisify(ef);
    const env = { ...loadShellEnvironment(), HOMEBREW_NO_AUTO_UPDATE: "1" };
    const run = async (cmd) => {
      try {
        const { stdout } = await execAsync("/bin/zsh", ["-l", "-c", cmd], { encoding: "utf8", env, timeout: 10000 });
        return stdout.trim();
      } catch { return null; }
    };
    const version = await run(`${cli} --version 2>/dev/null`);
    if (!version) return { installed: false, authenticated: false, version: null };

    // Per-CLI auth detection
    let authenticated = false;
    if (cli === "claude") {
      const authRaw = await run("claude auth status 2>&1");
      try { authenticated = JSON.parse(authRaw || "{}").loggedIn === true; } catch {
        authenticated = (authRaw || "").includes("loggedIn");
      }
    } else if (cli === "codex") {
      // Codex has no auth status command — check if auth.json exists
      const authFile = path.join(os.homedir(), ".codex", "auth.json");
      try {
        const content = fss.readFileSync(authFile, "utf8");
        authenticated = content.length > 10; // Has meaningful content
      } catch { authenticated = false; }
    } else if (cli === "gemini") {
      const authRaw = await run("gemini auth status 2>&1");
      authenticated = (authRaw || "").includes("cached credentials") || (authRaw || "").includes("Logged in");
    }

    return { installed: true, authenticated, version: version.split("\n")[0] };
  });

  ipcMain.handle("app:open-in-ide", (_e, targetPath, ide) => {
    const cmd = ide === "xcode" ? "open" : ide === "vscode" ? "code" : "cursor";
    const args = ide === "xcode" ? ["-a", "Xcode", targetPath] : [targetPath];
    spawn(cmd, args, { env: loadShellEnvironment(), detached: true, stdio: "ignore" }).unref();
  });

  ipcMain.handle("app:open-in-finder", (_e, targetPath) => {
    spawn("open", [targetPath], { detached: true, stdio: "ignore" }).unref();
  });

  ipcMain.handle("app:get-db-path", () => {
    return path.join(app.getPath("userData"), "workos.db");
  });

  ipcMain.handle("app:reveal-db", () => {
    const dbPath = path.join(app.getPath("userData"), "workos.db");
    spawn("open", ["-R", dbPath], { detached: true, stdio: "ignore" }).unref();
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

  // --- Discovery ---
  ipcMain.handle("shell:discover-scripts", (_e, projectPath) => {
    const { discoverScripts } = require("./discovery.js");
    return discoverScripts(projectPath);
  });

  // --- Tools ---
  ipcMain.handle("db:get-tools", (_e, projectId) => db.getTools(projectId));
  ipcMain.handle("db:create-tool", (_e, data) => db.createTool(data));
  ipcMain.handle("db:delete-tool", (_e, id) => db.deleteTool(id));
  ipcMain.handle("db:update-tool", (_e, id, data) => db.updateTool(id, data));

  // --- Machine ---
  const machine = require("./machine.js");
  ipcMain.handle("machine:scan", () => machine.scanMachine());
  ipcMain.handle("machine:fix-shell", (_e, file, line) => machine.fixShellConfig(file, line));
  ipcMain.handle("machine:brew-outdated", () => machine.checkBrewOutdated());
  ipcMain.handle("machine:pyenv-global", (_e, version) => machine.setPyenvGlobal(version));
  ipcMain.handle("machine:check-updates", () => machine.checkUpdates());

  // --- GitHub --- (init called after createWindow below)
  ipcMain.handle("github:fetch", () => github.fetchAll());
  ipcMain.handle("github:cache", () => github.getCache());
  ipcMain.handle("github:user-orgs", () => github.getUserOrgs());
  ipcMain.handle("db:update-workspace", (_e, id, data) => db.updateWorkspace(id, data));
  ipcMain.handle("github:check", () => github.checkGhInstalled());

  // --- PR Detail ---
  ipcMain.handle("pr:fetch-detail", (_e, owner, repo, number) => prDetail.fetchPRDetail(owner, repo, number));
  ipcMain.handle("pr:post-comment", (_e, owner, repo, number, body) => prDetail.postComment(owner, repo, number, body));
  ipcMain.handle("pr:reply-to-thread", (_e, owner, repo, number, commentId, body) => prDetail.replyToThread(owner, repo, number, commentId, body));
  ipcMain.handle("pr:submit-review", (_e, owner, repo, number, event, body) => prDetail.submitReview(owner, repo, number, event, body));
  ipcMain.handle("pr:resolve-thread", (_e, owner, repo, number, threadId) => prDetail.resolveThread(owner, repo, number, threadId));

  // --- Agents ---
  ipcMain.handle("agent:start", (_e, data) => agents.startTask(data));
  ipcMain.handle("agent:cancel", (_e, id) => agents.cancelTask(id));
  ipcMain.handle("agent:list", () => agents.listTasks());
  ipcMain.handle("agent:logs", (_e, id) => agents.getTaskLogs(id));
  ipcMain.handle("agent:clear", (_e, id) => agents.clearTask(id));
  ipcMain.handle("agent:clear-all-completed", () => agents.clearAllCompleted());
  ipcMain.handle("agent:running-count", () => agents.getRunningCount());
  ipcMain.handle("agent:create-worktree", (_e, repoPath, branch) => agents.createWorktree(repoPath, branch));
  ipcMain.handle("agent:remove-worktree", (_e, repoPath, worktreePath) => agents.removeWorktree(repoPath, worktreePath));

  // --- Rubric ---
  ipcMain.handle("rubric:get-categories", () => rubric.getCategories());
  ipcMain.handle("rubric:save-categories", (_e, categories) => rubric.saveCategories(categories));
  ipcMain.handle("rubric:get-thresholds", () => rubric.getThresholds());
  ipcMain.handle("rubric:save-thresholds", (_e, thresholds) => rubric.saveThresholds(thresholds));

  // --- PR Cache ---
  ipcMain.handle("pr-cache:get", (_e, prId) => db.getPrCache(prId));
  ipcMain.handle("pr-cache:upsert", (_e, prId, fields) => db.upsertPrCache(prId, fields));
  ipcMain.handle("pr-cache:cleanup", () => db.cleanupPrCache());

  // --- Processes ---
  ipcMain.handle("process:start", (_e, data) => processes.startProcess(data));
  ipcMain.handle("process:stop", (_e, id) => processes.stopProcess(id));
  ipcMain.handle("process:list", () => processes.listProcesses());
  ipcMain.handle("process:clear", (_e, id) => processes.clearProcess(id));
  ipcMain.handle("process:clear-all-stopped", () => processes.clearAllStopped());
  ipcMain.handle("process:logs", (_e, id) => processes.getProcessLogs(id));
  ipcMain.handle("process:running-count", () => processes.getRunningCount());
  ipcMain.handle("process:env", (_e, id) => processes.getProcessEnv(id));

  createWindow();
  agents.init(app, mainWindow);
  processes.init(app, mainWindow);
  github.init(mainWindow);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => { killAll(); processes.killAll(); agents.killAll(); github.destroy(); });
app.on("window-all-closed", () => { app.quit(); });
