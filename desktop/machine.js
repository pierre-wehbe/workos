const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadShellEnvironment } = require("./shell-env.js");

const execFileAsync = promisify(execFile);

async function run(cmd) {
  const env = { ...loadShellEnvironment(), HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_ENV_HINTS: "1" };
  try {
    const { stdout } = await execFileAsync("/bin/zsh", ["-l", "-c", cmd], {
      encoding: "utf8", env, timeout: 30000, maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

function shellFileContains(filePath, pattern) {
  try { return fs.readFileSync(filePath, "utf8").includes(pattern); } catch { return false; }
}

const HOME = os.homedir();
const ZSHRC = path.join(HOME, ".zshrc");
const ZPROFILE = path.join(HOME, ".zprofile");

// ─── Homebrew ───

async function detectHomebrew() {
  const version = await run("brew --version");
  if (!version) return { installed: false, version: null, path: null, shellConfigured: false, outdatedCount: null };

  const brewPath = await run("command -v brew");
  const shellOk = shellFileContains(ZPROFILE, "brew shellenv");

  // Don't check outdated on scan — it's slow. User triggers manually.
  return {
    installed: true,
    version: version.split("\n")[0]?.replace("Homebrew ", "") ?? version,
    path: brewPath,
    shellConfigured: shellOk,
    outdatedCount: null, // null = not checked yet
  };
}

async function checkBrewOutdated() {
  const outdatedRaw = await run("brew outdated --json=v2");
  try {
    const parsed = JSON.parse(outdatedRaw || "{}");
    return (parsed.formulae?.length || 0) + (parsed.casks?.length || 0);
  } catch { return 0; }
}

// ─── Python (pyenv + poetry) ───

async function detectPython() {
  const [pyenvVersion, poetryVersion, systemPython] = await Promise.all([
    run("pyenv --version"),
    run("poetry --version"),
    run("python3 --version"),
  ]);

  const pyenvInstalled = !!pyenvVersion;
  let installedVersions = [];
  let globalVersion = null;
  let latestAvailable = null;

  if (pyenvInstalled) {
    const [versionsRaw, globalRaw] = await Promise.all([
      run("pyenv versions --bare"),
      run("pyenv global"),
    ]);
    installedVersions = versionsRaw ? versionsRaw.split("\n").map(v => v.trim()).filter(Boolean) : [];
    globalVersion = globalRaw?.trim() || null;
  }

  const poetryInstalled = !!poetryVersion;
  const poetryPath = poetryInstalled ? await run("command -v poetry") : null;

  return {
    pyenv: {
      installed: pyenvInstalled,
      version: pyenvVersion?.replace("pyenv ", "") ?? null,
      shellConfigured: shellFileContains(ZSHRC, "pyenv init") || shellFileContains(ZSHRC, "pyenv") || shellFileContains(ZPROFILE, "pyenv"),
      installedVersions,
      globalVersion,
      latestAvailable,
    },
    poetry: {
      installed: poetryInstalled,
      version: poetryVersion?.replace("Poetry (version ", "").replace(")", "").replace("Poetry ", "") ?? null,
      path: poetryPath,
      shellConfigured: shellFileContains(ZSHRC, ".local/bin"),
    },
    systemPython: systemPython?.replace("Python ", "") ?? null,
  };
}

// ─── Node (bun) ───

async function detectNode() {
  const [bunVersion, nodeVersion, npmVersion] = await Promise.all([
    run("bun --version"),
    run("node --version"),
    run("npm --version"),
  ]);

  const bunInstalled = !!bunVersion;
  const bunPath = bunInstalled ? await run("command -v bun") : null;
  const nvmDir = process.env.NVM_DIR || path.join(HOME, ".nvm");
  const nvmInstalled = fs.existsSync(path.join(nvmDir, "nvm.sh"));

  let bunLatest = null;
  if (bunInstalled) {
    const brewBunInfo = await run("brew info oven-sh/bun/bun --json=v2 2>/dev/null");
    try {
      const parsed = JSON.parse(brewBunInfo || "{}");
      bunLatest = parsed.formulae?.[0]?.versions?.stable || null;
    } catch {}
  }

  return {
    bun: { installed: bunInstalled, version: bunVersion ?? null, path: bunPath, latestVersion: bunLatest },
    node: { installed: !!nodeVersion, version: nodeVersion?.replace("v", "") ?? null },
    npm: { installed: !!npmVersion, version: npmVersion ?? null },
    nvm: { installed: nvmInstalled },
  };
}

// ─── Rust ───

async function detectRust() {
  const rustupVersion = await run("rustup --version");
  if (!rustupVersion) {
    return {
      rustup: { installed: false, version: null },
      rustc: { version: null }, cargo: { version: null },
      activeToolchain: null, installedToolchains: [], installedTargets: [],
      shellConfigured: false, updateAvailable: false,
    };
  }

  const [toolchainRaw, toolchainsRaw, targetsRaw, rustcRaw, cargoRaw] = await Promise.all([
    run("rustup show active-toolchain"),
    run("rustup toolchain list"),
    run("rustup target list --installed"),
    run("rustc --version"),
    run("cargo --version"),
  ]);

  return {
    rustup: { installed: true, version: rustupVersion.split(" ")[1] ?? null },
    rustc: { version: rustcRaw?.replace("rustc ", "").split(" ")[0] ?? null },
    cargo: { version: cargoRaw?.replace("cargo ", "").split(" ")[0] ?? null },
    activeToolchain: toolchainRaw?.split(" ")[0] ?? null,
    installedToolchains: toolchainsRaw ? toolchainsRaw.split("\n").map(t => t.trim()).filter(Boolean) : [],
    installedTargets: targetsRaw ? targetsRaw.split("\n").map(t => t.trim()).filter(Boolean) : [],
    shellConfigured: shellFileContains(ZSHRC, ".cargo/bin") || shellFileContains(ZPROFILE, ".cargo/bin"),
    updateAvailable: null, // checked on demand via machine:check-updates
  };
}

// ─── Android ───

async function detectAndroid() {
  const studioExists = fs.existsSync("/Applications/Android Studio.app");
  const androidHome = process.env.ANDROID_HOME || path.join(HOME, "Library/Android/sdk");
  const sdkExists = fs.existsSync(androidHome);
  const shellConfigured = shellFileContains(ZSHRC, "ANDROID_HOME") || shellFileContains(ZPROFILE, "ANDROID_HOME");

  let installedPackages = [];
  const sdkmanager = path.join(androidHome, "cmdline-tools/latest/bin/sdkmanager");
  if (sdkExists && fs.existsSync(sdkmanager)) {
    const raw = await run(`"${sdkmanager}" --list_installed 2>/dev/null`);
    if (raw) {
      installedPackages = raw.split("\n")
        .filter(l => l.includes("|"))
        .map(l => l.split("|").map(s => s.trim()))
        .filter(parts => parts.length >= 2 && parts[0] && !parts[0].startsWith("---") && !parts[0].startsWith("Installed"))
        .map(parts => ({ package: parts[0], version: parts[1] }));
    }
  }

  const kotlinVersion = await run("kotlin -version 2>/dev/null");

  return {
    studio: { installed: studioExists },
    sdk: { installed: sdkExists, path: androidHome },
    shellConfigured,
    installedPackages,
    kotlin: { version: kotlinVersion?.replace("Kotlin version ", "")?.split(" ")[0] ?? null },
  };
}

// ─── Swift / Xcode ───

async function detectSwift() {
  const [xcodeSelect, xcodeVersionRaw, swiftRaw, swiftformatRaw, swiftlintRaw, cocoapodsRaw] = await Promise.all([
    run("xcode-select -p"),
    run("xcodebuild -version 2>/dev/null"),
    run("swift --version"),
    run("swiftformat --version"),
    run("swiftlint version"),
    run("pod --version"),
  ]);

  return {
    xcode: {
      installed: !!xcodeSelect,
      path: xcodeSelect,
      version: xcodeVersionRaw?.split("\n")[0]?.replace("Xcode ", "") ?? null,
    },
    swift: { version: swiftRaw?.match(/Swift version ([\d.]+)/)?.[1] ?? null },
    tools: {
      swiftformat: swiftformatRaw ?? null,
      swiftlint: swiftlintRaw ?? null,
      cocoapods: cocoapodsRaw ?? null,
    },
  };
}

// ─── Shell Config Audit ───

function auditShellConfig() {
  const checks = [
    { file: ".zprofile", pattern: "brew shellenv", label: "Homebrew shellenv", fix: 'eval "$(/opt/homebrew/bin/brew shellenv)"' },
    { file: ".zshrc", pattern: "pyenv init", altFile: ".zprofile", label: "pyenv init", fix: 'eval "$(pyenv init -)"' },
    { file: ".zshrc", pattern: ".local/bin", label: "Poetry PATH", fix: 'export PATH="$HOME/.local/bin:$PATH"' },
    { file: ".zshrc", pattern: ".cargo/bin", altFile: ".zprofile", label: "Cargo PATH", fix: 'export PATH="$HOME/.cargo/bin:$PATH"' },
    { file: ".zshrc", pattern: "ANDROID_HOME", altFile: ".zprofile", label: "ANDROID_HOME", fix: 'export ANDROID_HOME="$HOME/Library/Android/sdk"\nexport PATH="$ANDROID_HOME/platform-tools:$PATH"' },
  ];

  return {
    zshrcExists: fs.existsSync(ZSHRC),
    zprofileExists: fs.existsSync(ZPROFILE),
    issues: checks.map((c) => ({
      ...c,
      configured: shellFileContains(c.file === ".zprofile" ? ZPROFILE : ZSHRC, c.pattern)
        || (c.altFile ? shellFileContains(c.altFile === ".zprofile" ? ZPROFILE : ZSHRC, c.pattern) : false),
    })),
  };
}

// ─── AI CLIs ───

// Fast: just check if installed + version
async function detectAICLIs() {
  const [claudeRaw, codexRaw, geminiRaw] = await Promise.all([
    run("claude --version 2>/dev/null"),
    run("codex --version 2>/dev/null"),
    run("gemini --version 2>/dev/null"),
  ]);

  // Auth check is fast enough for initial scan
  const [claudeAuth, codexAuth, geminiAuth] = await Promise.all([
    claudeRaw ? run("claude auth status 2>&1") : Promise.resolve(null),
    codexRaw ? run("codex auth status 2>&1") : Promise.resolve(null),
    geminiRaw ? run("gemini auth status 2>&1") : Promise.resolve(null),
  ]);

  function parseAuth(raw) {
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower.includes("not logged") || lower.includes("not authenticated") || lower.includes("no api key") || lower.includes("usage:")) return false;
    if (lower.includes("error")) return false;
    return true;
  }

  return {
    claude: { installed: !!claudeRaw, version: claudeRaw?.split("\n")[0] ?? null, latestVersion: null, authenticated: claudeRaw ? parseAuth(claudeAuth) : null },
    codex: { installed: !!codexRaw, version: codexRaw?.split("\n")[0] ?? null, latestVersion: null, authenticated: codexRaw ? parseAuth(codexAuth) : null },
    gemini: { installed: !!geminiRaw, version: geminiRaw?.split("\n")[0] ?? null, latestVersion: null, authenticated: geminiRaw ? parseAuth(geminiAuth) : null },
  };
}

// Slow: npm latest versions only — called on demand
async function checkAIExtras() {
  const [claudeLatest, codexLatest, geminiLatest] = await Promise.all([
    run("npm view @anthropic-ai/claude-code version 2>/dev/null"),
    run("npm view @openai/codex version 2>/dev/null"),
    run("npm view @google/gemini-cli version 2>/dev/null"),
  ]);

  return {
    claude: { latestVersion: claudeLatest ?? null },
    codex: { latestVersion: codexLatest ?? null },
    gemini: { latestVersion: geminiLatest ?? null },
  };
}

// ─── Full Scan (async, parallel) ───

async function scanMachine() {
  const [homebrew, python, node, rust, android, swift, ai] = await Promise.all([
    detectHomebrew(),
    detectPython(),
    detectNode(),
    detectRust(),
    detectAndroid(),
    detectSwift(),
    detectAICLIs(),
  ]);

  return { homebrew, python, node, rust, android, swift, ai, shell: auditShellConfig() };
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

async function setPyenvGlobal(version) {
  const result = await run(`pyenv global ${version}`);
  return { ok: result !== null };
}

// Slow checks — run in background on demand
async function checkUpdates() {
  const [brewOutdated, rustCheck, pyenvLatest, aiExtras] = await Promise.all([
    checkBrewOutdated(),
    run("rustup check 2>/dev/null"),
    run("pyenv install --list 2>/dev/null | grep -E '^\\s+3\\.' | grep -v dev | grep -v rc | tail -1"),
    checkAIExtras(),
  ]);

  return {
    brewOutdatedCount: brewOutdated,
    rustUpdateAvailable: rustCheck ? rustCheck.includes("Update available") : false,
    pyenvLatestAvailable: pyenvLatest?.trim() || null,
    ai: aiExtras,
  };
}

module.exports = { scanMachine, fixShellConfig, checkBrewOutdated, setPyenvGlobal, checkUpdates };
