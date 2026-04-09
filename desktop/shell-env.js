const { execFileSync } = require("node:child_process");
const os = require("node:os");

let cachedEnv = null;

function loadShellEnvironment() {
  if (cachedEnv) return cachedEnv;

  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const output = execFileSync(shell, ["-l", "-c", "env"], {
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });

    const env = {};
    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        env[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }

    cachedEnv = { ...process.env, ...env };
    return cachedEnv;
  } catch {
    cachedEnv = { ...process.env };
    return cachedEnv;
  }
}

module.exports = { loadShellEnvironment };
