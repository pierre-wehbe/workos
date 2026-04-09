import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Coffee, Download,
  Globe, Loader2, Minus, Plus, RefreshCw, Shield, Terminal as TerminalIcon, Wrench, X,
} from "lucide-react";
import type { MachineInfo } from "../../lib/types";
import { ipc } from "../../lib/ipc";

// ─── Shared sub-components ───

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-semibold ${
      ok ? "bg-[rgba(21,128,61,0.1)] text-wo-success" : "bg-[rgba(220,38,38,0.1)] text-wo-danger"
    }`}>
      {ok ? <Check size={9} /> : <X size={9} />}
      {label}
    </span>
  );
}

function VersionTag({ version, label }: { version: string | null; label?: string }) {
  if (!version) return null;
  return (
    <span className="px-2 py-0.5 rounded bg-wo-bg-subtle text-[11px] font-mono text-wo-text-secondary">
      {label ? `${label} ` : ""}{version}
    </span>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: typeof Coffee; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-wo-border rounded-xl bg-wo-bg-elevated overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 p-4 text-left hover:bg-wo-bg-subtle/50 transition-colors">
        {open ? <ChevronDown size={13} className="text-wo-text-tertiary" /> : <ChevronRight size={13} className="text-wo-text-tertiary" />}
        <Icon size={15} className="text-wo-accent" />
        <span className="text-sm font-semibold flex-1">{title}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function ActionButton({ label, onClick, loading, variant = "default", icon }: {
  label: string; onClick: () => void; loading?: boolean; variant?: "default" | "accent" | "danger"; icon?: React.ReactNode;
}) {
  const cls = variant === "accent" ? "bg-wo-accent text-white hover:bg-wo-accent-hover"
    : variant === "danger" ? "border border-wo-danger/30 text-wo-danger hover:bg-wo-danger/5"
    : "border border-wo-border text-wo-text hover:bg-wo-bg-subtle";
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}>
      {loading ? <Loader2 size={11} className="animate-spin" /> : (icon ?? <Download size={11} />)}
      {label}
    </button>
  );
}

/** Reusable version list with global selector, install specific, and remove */
function VersionManager({ versions, globalVersion, onSetGlobal, onInstall, onRemove, installPlaceholder }: {
  versions: string[];
  globalVersion: string | null;
  onSetGlobal?: (v: string) => void;
  onInstall: (v: string) => void;
  onRemove?: (v: string) => void;
  installPlaceholder: string;
}) {
  const [showInstall, setShowInstall] = useState(false);
  const [installVersion, setInstallVersion] = useState("");

  return (
    <div>
      {/* Global selector */}
      {onSetGlobal && versions.length > 0 && (
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-medium text-wo-text-secondary">Global</p>
          <select value={globalVersion ?? ""} onChange={(e) => onSetGlobal(e.target.value)}
            className="h-7 px-2 rounded-md border border-wo-border bg-wo-bg text-xs font-mono text-wo-text focus:outline-none focus:ring-2 focus:ring-wo-accent/40">
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )}

      {/* Version chips */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {versions.map((v) => (
          <div key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono group ${
            v === globalVersion || v.includes("(default)") ? "bg-wo-accent-soft text-wo-accent font-semibold" : "bg-wo-bg-subtle text-wo-text-secondary"
          }`}>
            {v}
            {onRemove && v !== globalVersion && !v.includes("(default)") && (
              <button type="button" onClick={() => { if (confirm(`Remove ${v}?`)) onRemove(v); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-wo-danger/10 text-wo-text-tertiary hover:text-wo-danger transition-all">
                <X size={9} />
              </button>
            )}
          </div>
        ))}
        {versions.length === 0 && <span className="text-xs text-wo-text-tertiary">None installed</span>}
      </div>

      {/* Install specific */}
      <div className="flex gap-1.5">
        {!showInstall ? (
          <button type="button" onClick={() => setShowInstall(true)}
            className="flex items-center gap-1 text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
            <Plus size={11} /> Install version
          </button>
        ) : (
          <>
            <input value={installVersion} onChange={(e) => setInstallVersion(e.target.value)}
              placeholder={installPlaceholder}
              className="h-7 px-2 w-32 rounded-md border border-wo-border bg-wo-bg text-xs font-mono text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
              onKeyDown={(e) => { if (e.key === "Enter" && installVersion.trim()) { onInstall(installVersion.trim()); setInstallVersion(""); setShowInstall(false); } }}
            />
            <ActionButton label="Install" variant="accent" onClick={() => { if (installVersion.trim()) { onInstall(installVersion.trim()); setInstallVersion(""); setShowInstall(false); } }} />
            <button type="button" onClick={() => { setShowInstall(false); setInstallVersion(""); }}
              className="p-1.5 rounded-md text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors">
              <X size={11} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───

export function MachinePanel() {
  const [info, setInfo] = useState<MachineInfo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [runningCmd, setRunningCmd] = useState<string | null>(null);
  const [cmdOutput, setCmdOutput] = useState("");

  const scan = useCallback(async () => {
    setScanning(true);
    const result = await ipc.scanMachine();
    setInfo(result);
    setScanning(false);
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const checkUpdates = useCallback(async () => {
    if (!info) return;
    setCheckingUpdates(true);
    const updates = await ipc.checkMachineUpdates();
    setInfo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        homebrew: { ...prev.homebrew, outdatedCount: updates.brewOutdatedCount },
        rust: { ...prev.rust, updateAvailable: updates.rustUpdateAvailable },
        python: { ...prev.python, pyenv: { ...prev.python.pyenv, latestAvailable: updates.pyenvLatestAvailable } },
        ai: {
          claude: { ...prev.ai.claude, ...updates.ai.claude },
          codex: { ...prev.ai.codex, ...updates.ai.codex },
          gemini: { ...prev.ai.gemini, ...updates.ai.gemini },
        },
      };
    });
    setCheckingUpdates(false);
  }, [info]);

  const runCommand = async (cmd: string, label: string) => {
    setRunningCmd(label);
    setCmdOutput("");
    const result = await ipc.runSync(cmd);
    setCmdOutput(result.stdout + (result.stderr ? "\n" + result.stderr : ""));
    setRunningCmd(null);
    await scan();
  };

  const fixShell = async (file: string, line: string) => {
    await ipc.fixShellConfig(file, line);
    await scan();
  };

  if (!info) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-wo-accent" />
        <span className="ml-2 text-sm text-wo-text-secondary">Scanning machine...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Machine Configuration</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={checkUpdates} disabled={checkingUpdates}
            className="flex items-center gap-1.5 px-3 h-7 rounded-md bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-50">
            {checkingUpdates ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
            {checkingUpdates ? "Checking..." : "Check for updates"}
          </button>
          <button type="button" onClick={scan} disabled={scanning}
            className="flex items-center gap-1.5 px-3 h-7 rounded-md border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50">
            <RefreshCw size={11} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning..." : "Rescan"}
          </button>
        </div>
      </div>

      {/* Command output */}
      {(runningCmd || cmdOutput) && (
        <div className="p-3 rounded-lg bg-wo-bg-subtle border border-wo-border">
          {runningCmd && (
            <div className="flex items-center gap-2 mb-1">
              <Loader2 size={11} className="animate-spin text-wo-accent" />
              <span className="text-xs text-wo-text-secondary">{runningCmd}...</span>
            </div>
          )}
          {cmdOutput && (
            <pre className="text-[11px] font-mono text-wo-text-secondary whitespace-pre-wrap max-h-[120px] overflow-auto">{cmdOutput}</pre>
          )}
        </div>
      )}

      {/* ─── Homebrew ─── */}
      <Section title="Homebrew" icon={Coffee}>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge ok={info.homebrew.installed} label={info.homebrew.installed ? "Installed" : "Missing"} />
          <VersionTag version={info.homebrew.version} />
          <Badge ok={info.homebrew.shellConfigured} label={info.homebrew.shellConfigured ? "Shell OK" : "Shell missing"} />
          {info.homebrew.outdatedCount !== null && info.homebrew.outdatedCount > 0 && (
            <span className="text-[10px] text-wo-warning font-medium">{info.homebrew.outdatedCount} outdated</span>
          )}
          {info.homebrew.outdatedCount !== null && info.homebrew.outdatedCount === 0 && (
            <span className="text-[10px] text-wo-success font-medium">All up to date</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!info.homebrew.installed && (
            <ActionButton label="Install Homebrew" variant="accent" onClick={() => runCommand('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', "Installing Homebrew")} />
          )}
          {info.homebrew.outdatedCount !== null && info.homebrew.outdatedCount > 0 && (
            <ActionButton label="Upgrade all" onClick={() => runCommand("brew upgrade", "Upgrading")} />
          )}
        </div>
        {!info.homebrew.shellConfigured && (
          <button type="button" onClick={() => fixShell(".zprofile", 'eval "$(/opt/homebrew/bin/brew shellenv)"')} className="text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
            Fix: add shellenv to .zprofile
          </button>
        )}
      </Section>

      {/* ─── AI CLIs ─── */}
      <Section title="AI Coding Assistants" icon={TerminalIcon}>
        {[
          { key: "claude" as const, name: "Claude Code", pkg: "@anthropic-ai/claude-code", login: "claude auth login" },
          { key: "codex" as const, name: "Codex CLI", pkg: "@openai/codex", login: "codex auth login" },
          { key: "gemini" as const, name: "Gemini CLI", pkg: "@google/gemini-cli", login: "gemini auth login" },
        ].map(({ key, name, pkg, login }) => {
          const tool = info.ai[key];
          const hasUpdate = tool.installed && tool.latestVersion && tool.version && tool.latestVersion !== tool.version && !tool.version.includes(tool.latestVersion);
          return (
            <div key={key} className="px-3 py-2.5 rounded-lg bg-wo-bg-subtle">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Badge ok={tool.installed} label={tool.installed ? "Installed" : "Missing"} />
                  <span className="text-xs font-medium">{name}</span>
                  <VersionTag version={tool.version} />
                  {tool.installed && tool.authenticated !== null && (
                    <Badge ok={tool.authenticated} label={tool.authenticated ? "Logged in" : "Not logged in"} />
                  )}
                  {hasUpdate && <span className="text-[10px] text-wo-warning font-medium">Update: {tool.latestVersion}</span>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {!tool.installed && <ActionButton label="Install" variant="accent" onClick={() => runCommand(`npm install -g ${pkg}`, `Installing ${name}`)} />}
                  {hasUpdate && <ActionButton label="Update" onClick={() => runCommand(`npm update -g ${pkg}`, `Updating ${name}`)} />}
                  {tool.installed && tool.authenticated === false && <ActionButton label="Login" onClick={() => runCommand(login, `Logging into ${name}`)} />}
                </div>
              </div>
            </div>
          );
        })}
      </Section>

      {/* ─── Python ─── */}
      <Section title="Python" icon={TerminalIcon}>
        <div>
          <p className="text-xs font-medium text-wo-text-secondary mb-1.5">pyenv</p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge ok={info.python.pyenv.installed} label={info.python.pyenv.installed ? "Installed" : "Missing"} />
            <VersionTag version={info.python.pyenv.version} />
            <Badge ok={info.python.pyenv.shellConfigured} label={info.python.pyenv.shellConfigured ? "Shell OK" : "Shell missing"} />
          </div>
          {!info.python.pyenv.installed && <ActionButton label="Install pyenv" variant="accent" onClick={() => runCommand("brew install pyenv", "Installing pyenv")} />}
          {!info.python.pyenv.shellConfigured && info.python.pyenv.installed && (
            <button type="button" onClick={() => fixShell(".zshrc", 'eval "$(pyenv init -)"')} className="text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
              Fix: add pyenv init to .zshrc
            </button>
          )}
        </div>
        {info.python.pyenv.installed && (
          <div>
            <p className="text-xs font-medium text-wo-text-secondary mb-1.5">Python versions (pyenv)</p>
            <VersionManager
              versions={info.python.pyenv.installedVersions}
              globalVersion={info.python.pyenv.globalVersion}
              onSetGlobal={async (v) => { await ipc.setPyenvGlobal(v); await scan(); }}
              onInstall={(v) => runCommand(`pyenv install ${v} --skip-existing`, `Installing Python ${v}`)}
              onRemove={(v) => runCommand(`pyenv uninstall -f ${v}`, `Removing Python ${v}`)}
              installPlaceholder="e.g. 3.12.4"
            />
            {info.python.pyenv.latestAvailable && (
              <div className="mt-2">
                <ActionButton
                  label={`Install latest (${info.python.pyenv.latestAvailable})`}
                  onClick={() => runCommand(`pyenv install ${info.python.pyenv.latestAvailable} --skip-existing`, `Installing Python ${info.python.pyenv.latestAvailable}`)}
                />
              </div>
            )}
          </div>
        )}
        {/* Poetry */}
        <div className="pt-2 border-t border-wo-border">
          <p className="text-xs font-medium text-wo-text-secondary mb-1.5">Poetry</p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge ok={info.python.poetry.installed} label={info.python.poetry.installed ? "Installed" : "Missing"} />
            <VersionTag version={info.python.poetry.version} />
            <Badge ok={info.python.poetry.shellConfigured} label={info.python.poetry.shellConfigured ? "PATH OK" : "PATH missing"} />
          </div>
          {!info.python.poetry.installed && <ActionButton label="Install Poetry" variant="accent" onClick={() => runCommand("curl -sSL https://install.python-poetry.org | python3 -", "Installing Poetry")} />}
          {info.python.poetry.installed && <ActionButton label="Update Poetry" onClick={() => runCommand("poetry self update", "Updating Poetry")} />}
          {!info.python.poetry.shellConfigured && info.python.poetry.installed && (
            <button type="button" onClick={() => fixShell(".zshrc", 'export PATH="$HOME/.local/bin:$PATH"')} className="text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
              Fix: add .local/bin to PATH
            </button>
          )}
        </div>
        {info.python.systemPython && (
          <p className="text-xs text-wo-text-tertiary">macOS system Python: {info.python.systemPython} (bundled by Apple, separate from pyenv)</p>
        )}
      </Section>

      {/* ─── Node / Bun ─── */}
      <Section title="Node / Bun" icon={Globe}>
        <div>
          <p className="text-xs font-medium text-wo-text-secondary mb-1.5">Bun</p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge ok={info.node.bun.installed} label={info.node.bun.installed ? "Installed" : "Missing"} />
            <VersionTag version={info.node.bun.version} />
            {info.node.bun.latestVersion && info.node.bun.version && info.node.bun.latestVersion !== info.node.bun.version && (
              <span className="text-[10px] text-wo-warning font-medium">Update: {info.node.bun.latestVersion}</span>
            )}
          </div>
          {!info.node.bun.installed && <ActionButton label="Install Bun" variant="accent" onClick={() => runCommand("brew install oven-sh/bun/bun", "Installing Bun")} />}
          {info.node.bun.installed && info.node.bun.latestVersion && info.node.bun.version !== info.node.bun.latestVersion && (
            <ActionButton label="Update Bun" onClick={() => runCommand("brew upgrade oven-sh/bun/bun", "Updating Bun")} />
          )}
        </div>
        <div className="pt-2 border-t border-wo-border">
          <p className="text-xs font-medium text-wo-text-secondary mb-1.5">Node.js</p>
          <div className="flex items-center gap-2 flex-wrap">
            {info.node.node.installed && <VersionTag version={info.node.node.version} label="node" />}
            {info.node.npm.installed && <VersionTag version={info.node.npm.version} label="npm" />}
            {info.node.nvm.installed && <Badge ok label="nvm" />}
            {!info.node.node.installed && <span className="text-xs text-wo-text-tertiary">No Node.js detected</span>}
          </div>
        </div>
      </Section>

      {/* ─── Rust ─── */}
      <Section title="Rust" icon={Wrench}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge ok={info.rust.rustup.installed} label={info.rust.rustup.installed ? "rustup" : "Missing"} />
          <VersionTag version={info.rust.rustc.version} label="rustc" />
          <VersionTag version={info.rust.cargo.version} label="cargo" />
          <Badge ok={info.rust.shellConfigured} label={info.rust.shellConfigured ? "PATH OK" : "PATH missing"} />
          {info.rust.updateAvailable === true && <span className="text-[10px] text-wo-warning font-medium">Update available</span>}
        </div>
        {!info.rust.rustup.installed && (
          <ActionButton label="Install Rust" variant="accent" onClick={() => runCommand("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y", "Installing Rust")} />
        )}
        {info.rust.updateAvailable === true && <ActionButton label="Update Rust" onClick={() => runCommand("rustup update", "Updating Rust")} />}
        {!info.rust.shellConfigured && info.rust.rustup.installed && (
          <button type="button" onClick={() => fixShell(".zshrc", 'export PATH="$HOME/.cargo/bin:$PATH"')} className="text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
            Fix: add .cargo/bin to PATH
          </button>
        )}
        {/* Toolchains */}
        {info.rust.rustup.installed && (
          <div className="pt-2 border-t border-wo-border">
            <p className="text-xs font-medium text-wo-text-secondary mb-1.5">Toolchains</p>
            <VersionManager
              versions={info.rust.installedToolchains}
              globalVersion={info.rust.installedToolchains.find((t) => t.includes("(default)")) ?? null}
              onSetGlobal={(v) => runCommand(`rustup default ${v.replace(" (default)", "")}`, `Setting default toolchain`)}
              onInstall={(v) => runCommand(`rustup toolchain install ${v}`, `Installing toolchain ${v}`)}
              onRemove={(v) => runCommand(`rustup toolchain uninstall ${v}`, `Removing toolchain ${v}`)}
              installPlaceholder="e.g. nightly"
            />
          </div>
        )}
        {/* Targets */}
        {info.rust.rustup.installed && (
          <div className="pt-2 border-t border-wo-border">
            <p className="text-xs font-medium text-wo-text-secondary mb-1.5">Targets</p>
            <VersionManager
              versions={info.rust.installedTargets}
              globalVersion={null}
              onInstall={(v) => runCommand(`rustup target add ${v}`, `Adding target ${v}`)}
              onRemove={(v) => runCommand(`rustup target remove ${v}`, `Removing target ${v}`)}
              installPlaceholder="e.g. aarch64-linux-android"
            />
          </div>
        )}
      </Section>

      {/* ─── Android ─── */}
      <Section title="Android" icon={Shield} defaultOpen={false}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge ok={info.android.studio.installed} label={info.android.studio.installed ? "Studio" : "No Studio"} />
          <Badge ok={info.android.sdk.installed} label={info.android.sdk.installed ? "SDK" : "No SDK"} />
          <Badge ok={info.android.shellConfigured} label={info.android.shellConfigured ? "Env OK" : "Env missing"} />
          <VersionTag version={info.android.kotlin.version} label="Kotlin" />
        </div>
        {!info.android.studio.installed && <ActionButton label="Install Android Studio" variant="accent" onClick={() => runCommand("brew install --cask android-studio", "Installing Android Studio")} />}
        {!info.android.shellConfigured && info.android.sdk.installed && (
          <button type="button" onClick={() => fixShell(".zshrc", 'export ANDROID_HOME="$HOME/Library/Android/sdk"\nexport PATH="$ANDROID_HOME/platform-tools:$PATH"')} className="text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
            Fix: add ANDROID_HOME to .zshrc
          </button>
        )}
        {info.android.installedPackages.length > 0 && (
          <div>
            <p className="text-xs font-medium text-wo-text-secondary mb-1">SDK Packages ({info.android.installedPackages.length})</p>
            <div className="max-h-[120px] overflow-auto space-y-0.5">
              {info.android.installedPackages.map((p) => (
                <div key={p.package} className="flex justify-between text-[11px] font-mono px-2 py-0.5 rounded bg-wo-bg-subtle">
                  <span className="text-wo-text-secondary truncate">{p.package}</span>
                  <span className="text-wo-text-tertiary shrink-0 ml-2">{p.version}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ─── Swift / Xcode ─── */}
      <Section title="Swift / Xcode" icon={Wrench} defaultOpen={false}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge ok={info.swift.xcode.installed} label={info.swift.xcode.installed ? "Xcode" : "No Xcode"} />
          <VersionTag version={info.swift.xcode.version} label="Xcode" />
          <VersionTag version={info.swift.swift.version} label="Swift" />
        </div>
        {!info.swift.xcode.installed && <ActionButton label="Install Xcode CLI" variant="accent" onClick={() => runCommand("xcode-select --install", "Installing Xcode CLI")} />}
        <div className="flex items-center gap-2 flex-wrap">
          {["swiftformat", "swiftlint", "cocoapods"].map((tool) => {
            const version = info.swift.tools[tool as keyof typeof info.swift.tools];
            return version ? (
              <VersionTag key={tool} version={version} label={tool} />
            ) : info.swift.xcode.installed ? (
              <ActionButton key={tool} label={`Install ${tool}`} onClick={() => runCommand(`brew install ${tool}`, `Installing ${tool}`)} />
            ) : null;
          })}
        </div>
      </Section>

      {/* ─── Shell Config ─── */}
      <Section title="Shell Configuration" icon={AlertTriangle}>
        <div className="space-y-2">
          {info.shell.issues.map((issue) => (
            <div key={issue.label} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-wo-bg-subtle">
              <div className="flex items-center gap-2 min-w-0">
                {issue.configured ? <Check size={12} className="text-wo-success shrink-0" /> : <AlertTriangle size={12} className="text-wo-warning shrink-0" />}
                <span className="text-xs font-medium">{issue.label}</span>
                <span className="text-[10px] text-wo-text-tertiary">{issue.file}</span>
              </div>
              {!issue.configured && (
                <button type="button" onClick={() => fixShell(issue.file, issue.fix)}
                  className="px-2 h-6 rounded text-[10px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors shrink-0">
                  Fix
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
