import { useState, useEffect } from "react";
import { Circle, Loader2, Maximize2, Square, Trash2, ChevronDown, ChevronRight, Globe } from "lucide-react";
import type { ProcessEntry } from "../lib/types";
import { Terminal } from "./Terminal";
import { FullscreenTerminal } from "./FullscreenTerminal";
import { ipc } from "../lib/ipc";

interface ProcessRowProps {
  process: ProcessEntry;
  onStop: () => void;
  onClear: () => void;
  showWorkspace?: boolean;
}

function formatDuration(startedAt: string, stoppedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ProcessRow({ process: proc, onStop, onClear, showWorkspace = false }: ProcessRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [logs, setLogs] = useState("");
  const [duration, setDuration] = useState(formatDuration(proc.startedAt, proc.stoppedAt));

  // Update duration every second for running processes
  useEffect(() => {
    if (proc.status !== "running") {
      setDuration(formatDuration(proc.startedAt, proc.stoppedAt));
      return;
    }
    const interval = setInterval(() => {
      setDuration(formatDuration(proc.startedAt, null));
    }, 1000);
    return () => clearInterval(interval);
  }, [proc.status, proc.startedAt, proc.stoppedAt]);

  // Load logs when expanded
  useEffect(() => {
    if (!expanded) return;
    ipc.getProcessLogs(proc.id).then(setLogs);
  }, [expanded, proc.id]);

  // Stream new output when expanded and running
  useEffect(() => {
    if (!expanded || proc.status !== "running") return;
    const unsub = ipc.onProcessOutput((id, chunk) => {
      if (id !== proc.id) return;
      setLogs((prev) => prev + chunk);
    });
    return unsub;
  }, [expanded, proc.id, proc.status]);

  const statusIcon = proc.status === "running"
    ? <Loader2 size={12} className="animate-spin text-wo-success" />
    : proc.status === "errored"
      ? <Circle size={12} className="fill-wo-danger text-wo-danger" />
      : <Circle size={12} className="fill-wo-text-tertiary text-wo-text-tertiary" />;

  return (
    <div className="border border-wo-border rounded-lg bg-wo-bg-elevated overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-wo-bg-subtle/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} className="text-wo-text-tertiary shrink-0" /> : <ChevronRight size={12} className="text-wo-text-tertiary shrink-0" />}
        {statusIcon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <strong className="text-sm font-medium truncate">{proc.toolName}</strong>
            <span className="text-xs text-wo-text-tertiary">{proc.projectName}</span>
            {showWorkspace && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-wo-bg-subtle text-wo-text-tertiary">{proc.workspaceName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {proc.port && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-wo-accent-soft text-wo-accent text-[11px] font-mono font-medium">
              <Globe size={10} />
              :{proc.port}
            </span>
          )}
          <span className="text-xs text-wo-text-tertiary tabular-nums">{duration}</span>
          {proc.status === "running" ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStop(); }}
              className="p-1.5 rounded-md text-wo-danger hover:bg-wo-bg-subtle transition-colors"
              title="Stop"
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
              title="Clear"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-wo-border">
          <div className="flex justify-end px-2 pt-1">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="p-1 rounded text-wo-text-tertiary hover:text-wo-text transition-colors"
              title="Fullscreen"
            >
              <Maximize2 size={11} />
            </button>
          </div>
          <div className="h-[200px]">
            <Terminal output={logs} isRunning={proc.status === "running"} />
          </div>
        </div>
      )}

      {fullscreen && (
        <FullscreenTerminal
          output={logs}
          isRunning={proc.status === "running"}
          title={`${proc.toolName} — ${proc.projectName}`}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}
