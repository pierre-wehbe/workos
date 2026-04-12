const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadShellEnvironment } = require("./shell-env.js");
const db = require("./db.js");

const registry = new Map();
let logsDir = null;
let mainWindow = null;

// Strip ANSI escape codes and extract clean content from CLI output.
// Codex output has a session header, tool-call logs, and ANSI formatting.
// We extract the last substantial text block (the actual response).
function cleanAgentOutput(raw) {
  // Strip ANSI escape sequences
  const stripped = raw.replace(/\x1b\[[0-9;]*m/g, "");

  // For codex: the final output is duplicated at the end after "tokens used\nN\n"
  // Try to find that marker and take everything after it
  const tokenMarker = /tokens used\s*\n\s*[\d,]+\s*\n/;
  const tokenMatch = stripped.match(tokenMarker);
  if (tokenMatch) {
    const afterTokens = stripped.slice(tokenMatch.index + tokenMatch[0].length).trim();
    if (afterTokens.length > 50) return afterTokens;
  }

  // For claude/gemini: output is cleaner, just strip ANSI
  // Try to find the substantive content by skipping header lines
  const lines = stripped.split("\n");
  // Skip lines that look like CLI boilerplate
  const contentStart = lines.findIndex((l) =>
    l.startsWith("**") || l.startsWith("##") || l.startsWith("This PR") || l.startsWith("Summary")
  );
  if (contentStart > 0) return lines.slice(contentStart).join("\n").trim();

  return stripped.trim();
}

// Resolve "auto" reasoning effort based on PR size
function resolveReasoningEffort(effort, changedFiles, changedLines) {
  if (effort !== "auto") return effort;
  if (changedFiles <= 3 && changedLines <= 100) return "low";
  if (changedFiles <= 8 && changedLines <= 300) return "medium";
  if (changedFiles <= 20 && changedLines <= 800) return "high";
  return "xhigh";
}

// Returns { args, stdin } — stdin is non-null when the prompt should be piped
function cliCommand(cli, prompt, reasoningEffort) {
  if (cli === "claude") return { args: ["-p", prompt, "--output-format", "text"], stdin: null };
  if (cli === "codex") {
    const args = ["exec"];
    if (reasoningEffort && reasoningEffort !== "auto") {
      args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
    }
    args.push("-");
    return { args, stdin: prompt };
  }
  if (cli === "gemini") return { args: ["-p", prompt], stdin: null };
  return { args: [prompt], stdin: null };
}

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

function startTask({ prId, taskType, cli, prompt, workingDir, reasoningEffort, changedFiles, changedLines }) {
  const id = crypto.randomUUID();
  const logFile = path.join(logsDir, `${id}.log`);
  const env = loadShellEnvironment();
  const cwd = workingDir || undefined;

  const effort = resolveReasoningEffort(reasoningEffort || "auto", changedFiles || 0, changedLines || 0);
  const { args, stdin } = cliCommand(cli, prompt, effort);

  // Persist to DB
  db.createAgentTask({ id, prId, taskType, cli });
  db.updateAgentTask(id, { status: "running", logFile });

  const child = spawn(cli, args, { env, cwd, detached: true });

  // Pipe prompt via stdin if needed (e.g. codex exec reads from stdin)
  if (stdin) {
    child.stdin.write(stdin);
    child.stdin.end();
  }

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
    entry.status = code === 0 ? "completed" : "failed";
    entry.completedAt = new Date().toISOString();
    entry.tokenEstimate = Math.round(output.length / 4);
    entry.result = cleanAgentOutput(output);
    logStream.end();

    db.updateAgentTask(id, {
      status: entry.status,
      result: output,
      tokenEstimate: entry.tokenEstimate,
      completedAt: entry.completedAt,
    });

    if (mainWindow) mainWindow.webContents.send("agent-task:update", toSerializable(entry));
  });

  child.on("error", (err) => {
    entry.status = "failed";
    entry.completedAt = new Date().toISOString();
    entry.result = err.message;
    logStream.end();

    db.updateAgentTask(id, {
      status: "failed",
      result: err.message,
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
      entry.status = "cancelled";
      entry.completedAt = new Date().toISOString();
      entry.result = "Cancelled by user";

      db.updateAgentTask(id, {
        status: "cancelled",
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
