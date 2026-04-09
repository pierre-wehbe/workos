const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadShellEnvironment } = require("./shell-env.js");

const registry = new Map();
let logsDir = null;
let mainWindow = null;

const PORT_PATTERNS = [
  /listening on port (\d+)/i,
  /localhost:(\d+)/,
  /0\.0\.0\.0:(\d+)/,
  /http:\/\/[^:]+:(\d+)/,
  /on port (\d+)/i,
];

function init(app, window) {
  logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  mainWindow = window;
  cleanupOldLogs();
}

function setWindow(window) {
  mainWindow = window;
}

function cleanupOldLogs() {
  if (!logsDir) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    for (const file of fs.readdirSync(logsDir)) {
      const filePath = path.join(logsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {}
  for (const [id, entry] of registry) {
    if (entry.status !== "running" && !fs.existsSync(entry.logFile)) {
      registry.delete(id);
    }
  }
}

function detectPort(chunk) {
  for (const pattern of PORT_PATTERNS) {
    const match = chunk.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function startProcess({ projectId, projectName, workspaceId, workspaceName, toolName, command, workingDir }) {
  const id = crypto.randomUUID();
  const logFile = path.join(logsDir, `${id}.log`);
  const env = loadShellEnvironment();
  const cwd = workingDir || undefined;
  const child = spawn("/bin/zsh", ["-l", "-c", command], { env, cwd, timeout: 0 });

  const entry = {
    id,
    projectId,
    projectName,
    workspaceId,
    workspaceName,
    toolName,
    command,
    pid: child.pid,
    status: "running",
    exitCode: null,
    port: null,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    logFile,
  };

  registry.set(id, entry);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const handleData = (chunk) => {
    const text = chunk.toString();
    logStream.write(text);

    if (!entry.port) {
      const port = detectPort(text);
      if (port) {
        entry.port = port;
        if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
      }
    }

    if (mainWindow) mainWindow.webContents.send("process:on-output", { id, chunk: text });
  };

  child.stdout.on("data", handleData);
  child.stderr.on("data", handleData);

  child.on("close", (code) => {
    entry.status = code === 0 ? "stopped" : "errored";
    entry.exitCode = code;
    entry.stoppedAt = new Date().toISOString();
    logStream.end();
    if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
  });

  child.on("error", () => {
    entry.status = "errored";
    entry.exitCode = 1;
    entry.stoppedAt = new Date().toISOString();
    logStream.end();
    if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
  });

  entry._child = child;

  if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
  return toSerializable(entry);
}

function stopProcess(id) {
  const entry = registry.get(id);
  if (!entry || entry.status !== "running" || !entry._child) return;

  entry._child.kill("SIGTERM");
  setTimeout(() => {
    if (entry.status === "running" && entry._child) {
      entry._child.kill("SIGKILL");
    }
  }, 5000);
}

function clearProcess(id) {
  const entry = registry.get(id);
  if (!entry || entry.status === "running") return;
  try { fs.unlinkSync(entry.logFile); } catch {}
  registry.delete(id);
}

function clearAllStopped() {
  for (const [id, entry] of registry) {
    if (entry.status !== "running") {
      try { fs.unlinkSync(entry.logFile); } catch {}
      registry.delete(id);
    }
  }
}

function listProcesses() {
  return Array.from(registry.values()).map(toSerializable);
}

function getProcessLogs(id) {
  const entry = registry.get(id);
  if (!entry) return "";
  try { return fs.readFileSync(entry.logFile, "utf8"); } catch { return ""; }
}

function killAll() {
  for (const entry of registry.values()) {
    if (entry.status === "running" && entry._child) {
      entry._child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    for (const entry of registry.values()) {
      if (entry.status === "running" && entry._child) {
        entry._child.kill("SIGKILL");
      }
    }
  }, 5000);
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
  init, setWindow, startProcess, stopProcess, clearProcess, clearAllStopped,
  listProcesses, getProcessLogs, killAll, getRunningCount,
};
