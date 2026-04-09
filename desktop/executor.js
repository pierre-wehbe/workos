const { spawn } = require("node:child_process");
const { loadShellEnvironment } = require("./shell-env.js");

const runningProcesses = new Map();

function runSync(command) {
  const env = loadShellEnvironment();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("/bin/zsh", ["-l", "-c", command], { env, timeout: 15000 });

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on("error", (err) => resolve({ ok: false, stdout: stdout.trim(), stderr: err.message }));
  });
}

function runStreaming(id, command, window) {
  const env = loadShellEnvironment();
  const child = spawn("/bin/zsh", ["-l", "-c", command], { env, timeout: 0 });

  runningProcesses.set(id, child);

  child.stdout.on("data", (d) => {
    window.webContents.send("shell:stdout", { id, chunk: d.toString() });
  });
  child.stderr.on("data", (d) => {
    window.webContents.send("shell:stderr", { id, chunk: d.toString() });
  });
  child.on("close", (code) => {
    runningProcesses.delete(id);
    window.webContents.send("shell:complete", { id, exitCode: code ?? 1 });
  });
  child.on("error", () => {
    runningProcesses.delete(id);
    window.webContents.send("shell:complete", { id, exitCode: 1 });
  });
}

function cancelProcess(id) {
  const child = runningProcesses.get(id);
  if (!child) return;

  child.kill("SIGTERM");
  setTimeout(() => {
    if (runningProcesses.has(id)) {
      child.kill("SIGKILL");
      runningProcesses.delete(id);
    }
  }, 5000);
}

function killAll() {
  for (const [id, child] of runningProcesses) {
    child.kill("SIGTERM");
  }
  runningProcesses.clear();
}

module.exports = { runSync, runStreaming, cancelProcess, killAll };
