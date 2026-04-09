import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { ipc } from "../../lib/ipc";
import type { DetectionStatus } from "../../lib/types";
import { StatusBadge } from "../../components/StatusBadge";
import { Terminal } from "../../components/Terminal";

interface Prerequisite {
  id: string;
  name: string;
  description: string;
  detectCmd: string;
  installCmd: string;
  parseVersion: (stdout: string) => string;
}

const PREREQUISITES: Prerequisite[] = [
  {
    id: "homebrew",
    name: "Homebrew",
    description: "macOS package manager",
    detectCmd: "brew --version",
    installCmd: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    parseVersion: (s) => s.split("\n")[0]?.replace("Homebrew ", "") ?? "",
  },
  {
    id: "git",
    name: "Git",
    description: "Version control",
    detectCmd: "git --version",
    installCmd: "brew install git",
    parseVersion: (s) => s.replace("git version ", "").trim(),
  },
  {
    id: "ssh",
    name: "SSH Key",
    description: "GitHub authentication",
    detectCmd: 'test -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub || test -f ~/.ssh/id_rsa && cat ~/.ssh/id_rsa.pub',
    installCmd: 'ssh-keygen -t ed25519 -C "workos" -f ~/.ssh/id_ed25519 -N ""',
    parseVersion: () => "ed25519",
  },
];

interface PrereqState {
  status: DetectionStatus;
  version: string;
  detail: string;
  output: string;
  isInstalling: boolean;
}

interface PrerequisiteCheckProps {
  onAllPassed: () => void;
}

export function PrerequisiteCheck({ onAllPassed }: PrerequisiteCheckProps) {
  const [states, setStates] = useState<Record<string, PrereqState>>({});
  const [copiedKey, setCopiedKey] = useState(false);

  const update = (id: string, patch: Partial<PrereqState>) =>
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const detect = useCallback(async (prereq: Prerequisite) => {
    update(prereq.id, { status: "checking", isInstalling: false });
    const result = await ipc.runSync(prereq.detectCmd);
    if (result.ok && result.stdout.trim()) {
      update(prereq.id, {
        status: "installed",
        version: prereq.parseVersion(result.stdout),
        detail: prereq.id === "ssh" ? result.stdout.trim() : "",
      });
    } else {
      update(prereq.id, { status: "missing", version: "", detail: "" });
    }
  }, []);

  const install = useCallback(async (prereq: Prerequisite) => {
    update(prereq.id, { isInstalling: true, output: "" });
    const result = await ipc.runSync(prereq.installCmd);
    update(prereq.id, { isInstalling: false, output: result.stdout + (result.stderr ? "\n" + result.stderr : "") });
    await detect(prereq);
  }, [detect]);

  useEffect(() => {
    for (const p of PREREQUISITES) detect(p);
  }, [detect]);

  const allPassed = PREREQUISITES.every((p) => states[p.id]?.status === "installed");

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div>
      <p className="text-xs font-medium text-wo-text-tertiary uppercase tracking-wider mb-2">Prerequisites</p>
      <h2 className="text-xl font-semibold mb-1">Verify core tools.</h2>
      <p className="text-sm text-wo-text-secondary mb-6">
        Homebrew, Git, and an SSH key are required. Install any missing items below.
      </p>

      <div className="space-y-3">
        {PREREQUISITES.map((prereq) => {
          const state = states[prereq.id] ?? { status: "checking" as const, version: "", detail: "", output: "", isInstalling: false };
          return (
            <div key={prereq.id} className="p-4 rounded-xl border border-wo-border bg-wo-bg-elevated">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <strong className="text-sm font-medium">{prereq.name}</strong>
                    <StatusBadge status={state.status} />
                  </div>
                  <p className="text-xs text-wo-text-secondary">{prereq.description}</p>
                  {state.version && <p className="text-xs text-wo-text-tertiary mt-0.5">{state.version}</p>}
                </div>
                {state.status === "missing" && !state.isInstalling && (
                  <button
                    type="button"
                    onClick={() => install(prereq)}
                    className="px-3 h-8 rounded-lg bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors shrink-0"
                  >
                    Install
                  </button>
                )}
                {state.isInstalling && <Loader2 size={16} className="animate-spin text-wo-accent shrink-0" />}
              </div>

              {state.output && (
                <div className="mt-3 max-h-[160px] overflow-auto">
                  <Terminal output={state.output} />
                </div>
              )}

              {prereq.id === "ssh" && state.status === "installed" && state.detail && (
                <div className="mt-3 p-3 rounded-lg bg-wo-bg-subtle border border-wo-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium text-wo-text-tertiary uppercase tracking-wider">Public Key</p>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(state.detail)}
                      className="flex items-center gap-1 text-xs text-wo-accent hover:text-wo-accent-hover transition-colors"
                    >
                      {copiedKey ? <Check size={12} /> : <Copy size={12} />}
                      {copiedKey ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <code className="text-xs font-mono text-wo-text-secondary break-all">{state.detail}</code>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAllPassed}
        disabled={!allPassed}
        className="mt-6 px-5 h-10 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}
