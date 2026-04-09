import { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, Trash2, X } from "lucide-react";
import type { ProcessEntry, Workspace } from "../lib/types";
import { ProcessRow } from "./ProcessRow";

interface ProcessPanelProps {
  processes: ProcessEntry[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onStop: (id: string) => void;
  onClear: (id: string) => void;
  onClearAllStopped: () => void;
  onClose: () => void;
}

export function ProcessPanel({
  processes, workspaces, activeWorkspaceId,
  onStop, onClear, onClearAllStopped, onClose,
}: ProcessPanelProps) {
  const [filterWorkspace, setFilterWorkspace] = useState<string>(activeWorkspaceId ?? "all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) return; // Don't auto-close in fullscreen mode
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [onClose, expanded]);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expanded) setExpanded(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, expanded]);

  const filtered = processes
    .filter((p) => filterWorkspace === "all" || p.workspaceId === filterWorkspace)
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.toolName.toLowerCase().includes(q)
        || p.projectName.toLowerCase().includes(q)
        || p.command.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (b.status === "running" && a.status !== "running") return 1;
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });

  const stoppedCount = processes.filter((p) => p.status !== "running").length;
  const runningCount = processes.filter((p) => p.status === "running").length;

  const panelClass = expanded
    ? "fixed inset-0 z-50 flex flex-col bg-wo-bg pt-11"
    : "absolute top-full right-0 mt-2 w-[480px] max-h-[600px] flex flex-col rounded-xl bg-wo-bg-elevated border border-wo-border shadow-2xl z-50 overflow-hidden";

  return (
    <div ref={panelRef} className={panelClass}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-b border-wo-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Processes</h3>
          <span className="text-xs text-wo-text-tertiary">{runningCount} running</span>
        </div>
        <div className="flex items-center gap-2">
          {stoppedCount > 0 && (
            <button
              type="button"
              onClick={onClearAllStopped}
              className="flex items-center gap-1 px-2 h-7 rounded-md text-xs text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
            >
              <Trash2 size={11} />
              Clear stopped
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors"
            title={expanded ? "Minimize" : "Fullscreen"}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex gap-2 p-3 border-b border-wo-border">
        <select
          value={filterWorkspace}
          onChange={(e) => setFilterWorkspace(e.target.value)}
          className="h-8 px-2 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text focus:outline-none"
        >
          <option value="all">All workspaces</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 h-8 px-2.5 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-wo-text-tertiary py-8 text-center">
            {processes.length === 0 ? "No processes yet." : "No matching processes."}
          </p>
        ) : (
          filtered.map((proc) => (
            <ProcessRow
              key={proc.id}
              process={proc}
              onStop={() => onStop(proc.id)}
              onClear={() => onClear(proc.id)}
              showWorkspace={filterWorkspace === "all"}
            />
          ))
        )}
      </div>
    </div>
  );
}
