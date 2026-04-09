const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadShellEnvironment } = require("./shell-env.js");

function run(cmd, opts = {}) {
  const env = loadShellEnvironment();
  try {
    return execFileSync("/bin/zsh", ["-l", "-c", cmd], {
      encoding: "utf8", env, timeout: 15000, maxBuffer: 1024 * 1024, ...opts,
    }).trim();
  } catch (e) {
    return null;
  }
}

function shellFileContains(filePath, pattern) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes(pattern);
  } catch {
    return false;
  }
}

const HOME = os.homedir();
const ZSHRC = path.join(HOME, ".zshrc");
const ZPROFILE = path.join(HOME, ".zprofile");

// ─── Homebrew ───

function detectHomebrew() {
  const version = run("brew --version");
  if (!version) return { installed: false, version: null, path: null, shellConfigured: false, outdated: null };

  const brewPath = run("command -v brew");
  const shellOk = shellFileContains(ZPROFILE, "brew shellenv");
  const outdatedRaw = run("brew outdated --json=v2");
  let outdatedCount = 0;
  try {
    const parsed = JSON.parse(outdatedRaw || "{}");
    outdatedCount = (parsed.formulae?.length || 0) + (parsed.casks?.length || 0);
  } catch {}

  return {
    installed: true,
    version: version.split("\n")[0]?.replace("Homebrew ", "") ?? version,
    path: brewPath,
    shellConfigured: shellOk,
    outdatedCount,
  };
}

// ─── Python (pyenv + poetry) ───

function detectPython() {
  const pyenvVersion = run("pyenv --version");
  const pyenvInstalled = !!pyenvVersion;

  let installedVersions = [];
  let globalVersion = null;
  let shellConfigured = false;

  if (pyenvInstalled) {
    const versionsRaw = run("pyenv versions --bare");
    installedVersions = versionsRaw ? versionsRaw.split("\n").map(v => v.trim()).filter(Boolean) : [];
    globalVersion = run("pyenv global");
    shellConfigured = shellFileContains(ZSHRC, "pyenv init");
  }

  const poetryVersion = run("poetry --version");
  const poetryInstalled = !!poetryVersion;
  const poetryPath = poetryInstalled ? run("command -v poetry") : null;
  const poetryShellConfigured = shellFileContains(ZSHRC, ".local/bin");

  // System python as fallback
  const systemPython = run("python3 --version");

  // Check for available pyenv versions (latest 3.x)
  let latestAvailable = null;
  if (pyenvInstalled) {
    const available = run("pyenv install --list 2>/dev/null | grep -E '^\\s+3\\.' | grep -v dev | grep -v rc | tail -1");
    latestAvailable = available?.trim() || null;
  }

  return {
    pyenv: {
      installed: pyenvInstalled,
      version: pyenvVersion?.replace("pyenv ", "") ?? null,
      shellConfigured,
      installedVersions,
      globalVersion: globalVersion?.trim() || null,
      latestAvailable,
    },
    poetry: {
      installed: poetryInstalled,
      version: poetryVersion?.replace("Poetry (version ", "").replace(")", "").replace("Poetry ", "") ?? null,
      path: poetryPath,
      shellConfigured: poetryShellConfigured,
    },
    systemPython: systemPython?.replace("Python ", "") ?? null,
  };
}

// ─── Node (bun) ───

function detectNode() {
  const bunVersion = run("bun --version");
  const bunInstalled = !!bunVersion;
  const bunPath = bunInstalled ? run("command -v bun") : null;

  // Also check for node/npm as they may coexist
  const nodeVersion = run("node --version");
  const npmVersion = run("npm --version");
  const nvmDir = process.env.NVM_DIR || path.join(HOME, ".nvm");
  const nvmInstalled = fs.existsSync(path.join(nvmDir, "nvm.sh"));

  // Check for bun update
  let bunLatest = null;
  if (bunInstalled) {
    // bun doesn't have a built-in "check for update" — we'll compare with brew
    const brewBunInfo = run("brew info oven-sh/bun/bun --json=v2 2>/dev/null");
    try {
      const parsed = JSON.parse(brewBunInfo || "{}");
      const formula = parsed.formulae?.[0];
      if (formula) bunLatest = formula.versions?.stable || null;
    } catch {}
  }

  return {
    bun: {
      installed: bunInstalled,
      version: bunVersion ?? null,
      path: bunPath,
      latestVersion: bunLatest,
    },
    node: {
      installed: !!nodeVersion,
      version: nodeVersion?.replace("v", "") ?? null,
    },
    npm: {
      installed: !!npmVersion,
      version: npmVersion ?? null,
    },
    nvm: {
      installed: nvmInstalled,
    },
  };
}

// ─── Rust ───

function detectRust() {
  const rustupVersion = run("rustup --version");
  const rustupInstalled = !!rustupVersion;

  let activeToolchain = null;
  let installedToolchains = [];
  let installedTargets = [];
  let rustcVersion = null;
  let cargoVersion = null;
  let shellConfigured = false;

  if (rustupInstalled) {
    activeToolchain = run("rustup show active-toolchain")?.split(" ")[0] ?? null;
    const toolchainsRaw = run("rustup toolchain list");
    installedToolchains = toolchainsRaw ? toolchainsRaw.split("\n").map(t => t.trim()).filter(Boolean) : [];
    const targetsRaw = run("rustup target list --installed");
    installedTargets = targetsRaw ? targetsRaw.split("\n").map(t => t.trim()).filter(Boolean) : [];
    rustcVersion = run("rustc --version")?.replace("rustc ", "").split(" ")[0] ?? null;
    cargoVersion = run("cargo --version")?.replace("cargo ", "").split(" ")[0] ?? null;
    shellConfigured = shellFileContains(ZSHRC, ".cargo/bin") || shellFileContains(ZPROFILE, ".cargo/bin");
  }

  // Check for update
  let updateAvailable = false;
  if (rustupInstalled) {
    const check = run("rustup check 2>/dev/null");
    updateAvailable = check ? check.includes("Update available") : false;
  }

  return {
    rustup: {
      installed: rustupInstalled,
      version: rustupVersion?.split(" ")[1] ?? null,
    },
    rustc: { version: rustcVersion },
    cargo: { version: cargoVersion },
    activeToolchain,
    installedToolchains,
    installedTargets,
    shellConfigured,
    updateAvailable,
  };
}

// ─── Android ───

function detectAndroid() {
  const studioExists = fs.existsSync("/Applications/Android Studio.app");
  const androidHome = process.env.ANDROID_HOME || path.join(HOME, "Library/Android/sdk");
  const sdkExists = fs.existsSync(androidHome);
  const sdkmanager = sdkExists ? path.join(androidHome, "cmdline-tools/latest/bin/sdkmanager") : null;
  const shellConfigured = shellFileContains(ZSHRC, "ANDROID_HOME") || shellFileContains(ZPROFILE, "ANDROID_HOME");

  let installedPackages = [];
  if (sdkmanager && fs.existsSync(sdkmanager)) {
    const raw = run(`"${sdkmanager}" --list_installed 2>/dev/null`);
    if (raw) {
      installedPackages = raw.split("\n")
        .filter(l => l.includes("|"))
        .map(l => l.split("|").map(s => s.trim()))
        .filter(parts => parts.length >= 2 && parts[0] && !parts[0].startsWith("---") && !parts[0].startsWith("Installed"))
        .map(parts => ({ package: parts[0], version: parts[1] }));
    }
  }

  const kotlinVersion = run("kotlin -version 2>/dev/null");

  return {
    studio: { installed: studioExists },
    sdk: { installed: sdkExists, path: androidHome },
    shellConfigured,
    installedPackages,
    kotlin: { version: kotlinVersion?.replace("Kotlin version ", "")?.split(" ")[0] ?? null },
  };
}

// ─── Swift / Xcode ───

function detectSwift() {
  const xcodeSelect = run("xcode-select -p");
  const xcodeInstalled = !!xcodeSelect;
  const xcodeVersion = run("xcodebuild -version 2>/dev/null")?.split("\n")[0]?.replace("Xcode ", "") ?? null;
  const swiftVersion = run("swift --version")?.match(/Swift version ([\d.]+)/)?.[1] ?? null;
  const swiftformatVersion = run("swiftformat --version");
  const swiftlintVersion = run("swiftlint version");
  const cocoapodsVersion = run("pod --version");

  return {
    xcode: {
      installed: xcodeInstalled,
      path: xcodeSelect,
      version: xcodeVersion,
    },
    swift: { version: swiftVersion },
    tools: {
      swiftformat: swiftformatVersion ?? null,
      swiftlint: swiftlintVersion ?? null,
      cocoapods: cocoapodsVersion ?? null,
    },
  };
}

// ─── Shell Config Audit ───

function auditShellConfig() {
  const issues = [];
  const zshrcExists = fs.existsSync(ZSHRC);
  const zprofileExists = fs.existsSync(ZPROFILE);
  let zshrcContent = "";
  let zprofileContent = "";
  try { zshrcContent = fs.readFileSync(ZSHRC, "utf8"); } catch {}
  try { zprofileContent = fs.readFileSync(ZPROFILE, "utf8"); } catch {}

  const checks = [
    { file: ZPROFILE, pattern: "brew shellenv", label: "Homebrew shellenv", fix: 'eval "$(/opt/homebrew/bin/brew shellenv)"' },
    { file: ZSHRC, pattern: "pyenv init", label: "pyenv init", fix: 'eval "$(pyenv init -)"' },
    { file: ZSHRC, pattern: ".local/bin", label: "Poetry PATH", fix: 'export PATH="$HOME/.local/bin:$PATH"' },
    { file: ZSHRC, pattern: ".cargo/bin", label: "Cargo PATH", fix: 'export PATH="$HOME/.cargo/bin:$PATH"' },
    { file: ZSHRC, pattern: "ANDROID_HOME", label: "ANDROID_HOME", fix: 'export ANDROID_HOME="$HOME/Library/Android/sdk"\nexport PATH="$ANDROID_HOME/platform-tools:$PATH"' },
  ];

  for (const check of checks) {
    const content = check.file === ZPROFILE ? zprofileContent : zshrcContent;
    issues.push({
      file: check.file === ZPROFILE ? ".zprofile" : ".zshrc",
      label: check.label,
      configured: content.includes(check.pattern),
      fix: check.fix,
    });
  }

  return { zshrcExists, zprofileExists, issues };
}

// ─── Full Scan ───

function scanMachine() {
  return {
    homebrew: detectHomebrew(),
    python: detectPython(),
    node: detectNode(),
    rust: detectRust(),
    android: detectAndroid(),
    swift: detectSwift(),
    shell: auditShellConfig(),
  };
}

function fixShellConfig(file, line) {
  const filePath = file === ".zprofile" ? ZPROFILE : ZSHRC;
  try {
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    if (content.includes(line.split("\n")[0])) return { ok: true, message: "Already configured" };
    fs.appendFileSync(filePath, `\n# Added by WorkOS\n${line}\n`);
    return { ok: true, message: "Added to " + file };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = { scanMachine, fixShellConfig };
