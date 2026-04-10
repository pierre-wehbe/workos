import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, Check, ChevronDown, LogIn } from "lucide-react";
import type { AICli, AICliStatus } from "../lib/types";
import { ipc } from "../lib/ipc";

const CLI_CONFIG: Record<AICli, { name: string; icon: string }> = {
  claude: { name: "Claude", icon: "C" },
  codex: { name: "Codex", icon: "X" },
  gemini: { name: "Gemini", icon: "G" },
};

interface AICliSelectorProps {
  selectedCli: AICli;
  onSelect: (cli: AICli) => void;
}

export function AICliSelector({ selectedCli, onSelect }: AICliSelectorProps) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<AICli, AICliStatus | null>>({
    claude: null, codex: null, gemini: null,
  });
  const [loggingIn, setLoggingIn] = useState<AICli | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Check status of selected CLI on mount
  useEffect(() => {
    ipc.getAIStatus(selectedCli).then((s) => {
      setStatuses((prev) => ({ ...prev, [selectedCli]: s }));
    });
  }, [selectedCli]);

  // Check all statuses when dropdown opens
  useEffect(() => {
    if (!open) return;
    const clis: AICli[] = ["claude", "codex", "gemini"];
    for (const cli of clis) {
      ipc.getAIStatus(cli).then((s) => {
        setStatuses((prev) => ({ ...prev, [cli]: s }));
      });
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [open]);

  const handleSelect = async (cli: AICli) => {
    await ipc.setAICli(cli);
    onSelect(cli);
    setOpen(false);
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Clean up on unmount
  useEffect(() => () => stopPolling(), []);

  const handleLogin = async (cli: AICli) => {
    setLoggingIn(cli);
    // Fire and forget — opens browser
    ipc.runSync(`${cli} auth login`);

    // Poll every 5s for up to 2 minutes
    let attempts = 0;
    stopPolling();
    pollRef.current = setInterval(async () => {
      attempts++;
      const status = await ipc.getAIStatus(cli);
      setStatuses((prev) => ({ ...prev, [cli]: status }));
      if (status.authenticated || attempts >= 24) {
        stopPolling();
        setLoggingIn(null);
      }
    }, 5000);
  };

  const current = CLI_CONFIG[selectedCli];
  const currentStatus = statuses[selectedCli];
  const isAuthed = currentStatus?.authenticated ?? true; // Assume OK until checked

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 h-8 pl-2 pr-1.5 rounded-lg transition-colors ${
          open ? "bg-wo-bg-subtle" : "hover:bg-wo-bg-subtle"
        }`}
        title={`AI: ${current.name}${currentStatus ? (currentStatus.authenticated ? "" : " (not logged in)") : ""}`}
      >
        <span className="w-5 h-5 rounded-md bg-wo-accent text-white text-[10px] font-bold flex items-center justify-center">
          {current.icon}
        </span>
        {currentStatus && !isAuthed && (
          <AlertCircle size={10} className="text-wo-warning" />
        )}
        <ChevronDown size={10} className="text-wo-text-tertiary" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 rounded-lg bg-wo-bg-elevated border border-wo-border shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-wo-border">
            <p className="text-[10px] font-medium text-wo-text-tertiary uppercase tracking-wider">AI Assistant</p>
          </div>

          {(["claude", "codex", "gemini"] as AICli[]).map((cli) => {
            const cfg = CLI_CONFIG[cli];
            const status = statuses[cli];
            const isSelected = cli === selectedCli;
            const isInstalled = status?.installed ?? null;
            const isAuth = status?.authenticated ?? null;

            return (
              <div key={cli} className={`px-2 py-1.5 ${isSelected ? "bg-wo-accent-soft" : ""}`}>
                <button
                  type="button"
                  onClick={() => handleSelect(cli)}
                  className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-wo-bg-subtle transition-colors"
                >
                  <span className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                    isSelected ? "bg-wo-accent text-white" : "bg-wo-bg-subtle text-wo-text-secondary"
                  }`}>
                    {cfg.icon}
                  </span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{cfg.name}</span>
                      {isSelected && <Check size={10} className="text-wo-accent" />}
                    </div>
                    {status && (
                      <span className={`text-[10px] ${
                        !isInstalled ? "text-wo-text-tertiary" : isAuth ? "text-wo-success" : "text-wo-warning"
                      }`}>
                        {!isInstalled ? "Not installed" : isAuth ? `v${status.version}` : "Not logged in"}
                      </span>
                    )}
                    {!status && <span className="text-[10px] text-wo-text-tertiary">Checking...</span>}
                  </div>
                  {status?.installed && !status.authenticated && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleLogin(cli); }}
                      disabled={loggingIn === cli}
                      className="px-2 h-5 rounded text-[9px] font-medium bg-wo-accent text-white hover:bg-wo-accent-hover transition-colors disabled:opacity-50 shrink-0"
                    >
                      {loggingIn === cli ? "..." : "Login"}
                    </button>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
