const fs = require("node:fs");
const path = require("node:path");

function discoverScripts(projectPath) {
  const results = [];

  function scanDir(dir, prefix) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.scripts) {
          const runner = fs.existsSync(path.join(dir, "bun.lock")) ? "bun run"
            : fs.existsSync(path.join(dir, "yarn.lock")) ? "yarn"
            : "npm run";
          for (const [key, cmd] of Object.entries(pkg.scripts)) {
            results.push({
              name: prefix ? `${prefix}:${key}` : key,
              command: `${runner} ${key}`,
              workingDir: path.relative(projectPath, dir) || ".",
              source: "package.json",
              sourceKey: key,
            });
          }
        }
      } catch {}
    }

    const makefilePath = path.join(dir, "Makefile");
    if (fs.existsSync(makefilePath)) {
      try {
        const content = fs.readFileSync(makefilePath, "utf8");
        const targetRegex = /^([a-zA-Z_][a-zA-Z0-9_.-]*):/gm;
        let match;
        while ((match = targetRegex.exec(content)) !== null) {
          const target = match[1];
          if (target.startsWith(".") || target === "PHONY") continue;
          results.push({
            name: prefix ? `${prefix}:make ${target}` : `make ${target}`,
            command: `make ${target}`,
            workingDir: path.relative(projectPath, dir) || ".",
            source: "Makefile",
            sourceKey: target,
          });
        }
      } catch {}
    }
  }

  scanDir(projectPath, "");

  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const subdir = path.join(projectPath, entry.name);
      scanDir(subdir, entry.name);
    }
  } catch {}

  const launchPath = path.join(projectPath, ".vscode", "launch.json");
  if (fs.existsSync(launchPath)) {
    try {
      const raw = fs.readFileSync(launchPath, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const launch = JSON.parse(raw);
      if (launch.configurations) {
        for (const config of launch.configurations) {
          if (config.name) {
            results.push({
              name: config.name,
              command: null,
              workingDir: ".",
              source: "launch.json",
              sourceKey: config.name,
            });
          }
        }
      }
    } catch {}
  }

  return results;
}

module.exports = { discoverScripts };
