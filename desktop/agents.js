const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadShellEnvironment } = require("./shell-env.js");
const db = require("./db.js");

const registry = new Map();
let logsDir = null;
let mainWindow = null;

const CLI_ARGS = {
  claude: (prompt) => ["-p", prompt, "--output-format", "text"],
  codex: (prompt) => ["--quiet", "--full-auto", prompt],
  gemini: (prompt) => ["-p", prompt],
};

function init(app, window) {
  logsDir = path.join(app.getPath("userData"), "agent-logs");
  fs.mkdirSync(logsDir, { recursive: true });
  mainWindow = window;

  // Mark any "running" or "pending" tasks as failed (app was restarted)
  const tasks = db.getAgentTasks();
  for (const task of tasks) {
    if (task.status === "running" || task.status === "pending") {
      db.updateAgentTask(task.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
      });
    }
  }
}

function setWindow(window) {
  mainWindow = window;
}

function startTask({ prId, taskType, cli, prompt, workingDir }) {
  const id = crypto.randomUUID();
  const logFile = path.join(logsDir, `${id}.log`);
  const env = loadShellEnvironment();
  const cwd = workingDir || undefined;

  const argsFn = CLI_ARGS[cli];
  const args = argsFn ? argsFn(prompt) : [prompt];

  // Persist to DB
  db.createAgentTask({ id, prId, taskType, cli });
  db.updateAgentTask(id, { status: "running", logFile });

  const child = spawn(cli, args, { env, cwd, detached: true });

  let output = "";
  const entry = {
    id,
    prId,
    taskType,
    cli,
    pid: child.pid,
    status: "running",
    result: null,
    tokenEstimate: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    logFile,
  };

  registry.set(id, entry);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const handleData = (chunk) => {
    const text = chunk.toString();
    logStream.write(text);
    output += text;
    entry.tokenEstimate = Math.round(output.length / 4);

    if (mainWindow) mainWindow.webContents.send("agent-task:output", { id, chunk: text });
  };

  child.stdout.on("data", handleData);
  child.stderr.on("data", handleData);

  child.on("close", (code) => {
    const status = code === 0 ? "done" : "failed";
    entry.status = status;
    entry.completedAt = new Date().toISOString();
    entry.tokenEstimate = Math.round(output.length / 4);
    entry.result = { exitCode: code, outputLength: output.length };
    logStream.end();

    db.updateAgentTask(id, {
      status,
      result: entry.result,
      tokenEstimate: entry.tokenEstimate,
      completedAt: entry.completedAt,
    });

    if (mainWindow) mainWindow.webContents.send("agent-task:update", toSerializable(entry));
  });

  child.on("error", (err) => {
    entry.status = "failed";
    entry.completedAt = new Date().toISOString();
    entry.result = { error: err.message };
    logStream.end();

    db.updateAgentTask(id, {
      status: "failed",
      result: entry.result,
      tokenEstimate: entry.tokenEstimate,
      completedAt: entry.completedAt,
    });

    if (mainWindow) mainWindow.webContents.send("agent-task:update", toSerializable(entry));
  });

  entry._child = child;

  if (mainWindow) mainWindow.webContents.send("agent-task:update", toSerializable(entry));
  return toSerializable(entry);
}

function cancelTask(id) {
  const entry = registry.get(id);
  if (!entry || entry.status !== "running" || !entry._child) return;

  const pid = entry._child.pid;
  try { process.kill(-pid, "SIGTERM"); } catch { entry._child.kill("SIGTERM"); }
  setTimeout(() => {
    if (entry.status === "running") {
      try { process.kill(-pid, "SIGKILL"); } catch {}
      entry.status = "failed";
      entry.completedAt = new Date().toISOString();
      entry.result = { cancelled: true };

      db.updateAgentTask(id, {
        status: "failed",
        result: entry.result,
        tokenEstimate: entry.tokenEstimate,
        completedAt: entry.completedAt,
      });

      if (mainWindow) mainWindow.webContents.send("agent-task:update", toSerializable(entry));
    }
  }, 3000);
}

function listTasks() {
  const dbTasks = db.getAgentTasks();
  return dbTasks.map((task) => {
    const live = registry.get(task.id);
    if (live && live.status === "running") {
      return toSerializable(live);
    }
    return task;
  });
}

function getTaskLogs(id) {
  // Try in-memory entry first for log file path
  const entry = registry.get(id);
  const logFile = entry ? entry.logFile : null;

  // Fall back to DB
  const filePath = logFile || (db.getAgentTask(id) || {}).logFile;
  if (!filePath) return "";
  try { return fs.readFileSync(filePath, "utf8"); } catch { return ""; }
}

function clearTask(id) {
  const entry = registry.get(id);
  if (entry && entry.status === "running") return;

  if (entry) {
    try { fs.unlinkSync(entry.logFile); } catch {}
    registry.delete(id);
  } else {
    const task = db.getAgentTask(id);
    if (task && task.logFile) {
      try { fs.unlinkSync(task.logFile); } catch {}
    }
  }
  db.clearAgentTask(id);
}

function clearAllCompleted() {
  // Clean up in-memory entries
  for (const [id, entry] of registry) {
    if (entry.status !== "running") {
      try { fs.unlinkSync(entry.logFile); } catch {}
      registry.delete(id);
    }
  }

  // Also clean up log files for DB-only tasks
  const tasks = db.getAgentTasks();
  for (const task of tasks) {
    if (task.status !== "running" && task.logFile) {
      try { fs.unlinkSync(task.logFile); } catch {}
    }
  }

  db.clearCompletedAgentTasks();
}

function createWorktree(repoPath, branch) {
  const id = crypto.randomUUID().slice(0, 8);
  const wtPath = path.join("/tmp", `workos-agent-${id}`);

  // Try to fetch the branch from origin (may fail, that's ok)
  try {
    execFileSync("git", ["fetch", "origin", branch], { cwd: repoPath, timeout: 30000 });
  } catch {}

  // Try origin/<branch> first
  try {
    execFileSync("git", ["worktree", "add", wtPath, `origin/${branch}`], { cwd: repoPath, timeout: 30000 });
    return { ok: true, path: wtPath };
  } catch {}

  // Fall back to local branch
  try {
    execFileSync("git", ["worktree", "add", wtPath, branch], { cwd: repoPath, timeout: 30000 });
    return { ok: true, path: wtPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function removeWorktree(repoPath, worktreePath) {
  try {
    execFileSync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoPath, timeout: 30000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function killAll() {
  for (const entry of registry.values()) {
    if (entry.status === "running" && entry._child) {
      try { process.kill(-entry._child.pid, "SIGTERM"); } catch { entry._child.kill("SIGTERM"); }
    }
  }
}

function getRunningCount() {
  let count = 0;
  for (const entry of registry.values()) {
    if (entry.status === "running") count++;
  }
  return count;
}

function toSerializable(entry) {
  const { _child, ...rest } = entry;
  return rest;
}

module.exports = {
  init, setWindow, startTask, cancelTask, listTasks, getTaskLogs,
  clearTask, clearAllCompleted, createWorktree, removeWorktree,
  killAll, getRunningCount,
};
