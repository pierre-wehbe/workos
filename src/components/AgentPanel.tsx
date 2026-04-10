import { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, Trash2, X, Eye, Square, Circle, Loader2 } from "lucide-react";
import type { AgentTask, AgentTaskType } from "../lib/pr-types";
import { AgentTerminal } from "./AgentTerminal";

interface AgentPanelProps {
  tasks: AgentTask[];
  onCancel: (id: string) => void;
  onClear: (id: string) => void;
  onClearAllCompleted: () => void;
  onGetLogs: (id: string) => Promise<string>;
  onClose: () => void;
}

const taskLabels: Record<AgentTaskType, string> = {
  summarize: "Summarize PR",
  rubric: "Rubric Score",
  draft_review: "Draft Review",
  implement_fix: "Implement Fix",
  address_comments: "Address Comments",
  summarize_feedback: "Summarize Feedback",
  draft_reply: "Draft Reply",
};

function taskLabel(type: AgentTaskType): string {
  return taskLabels[type] ?? type;
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function AgentPanel({
  tasks, onCancel, onClear, onClearAllCompleted, onGetLogs, onClose,
}: AgentPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingTask, setViewingTask] = useState<string | null>(null);
  const [viewLogs, setViewLogs] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close (unless fullscreen or viewing terminal)
  useEffect(() => {
    if (expanded || viewingTask) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [onClose, expanded, viewingTask]);

  // Esc key handling: close terminal -> collapse fullscreen -> close panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingTask) {
          setViewingTask(null);
          setViewLogs("");
        } else if (expanded) {
          setExpanded(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, expanded, viewingTask]);

  const handleView = async (id: string) => {
    const logs = await onGetLogs(id);
    setViewLogs(logs);
    setViewingTask(id);
  };

  const sorted = [...tasks].sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  const completedCount = tasks.filter((t) => t.status !== "running").length;
  const runningCount = tasks.filter((t) => t.status === "running").length;

  const panelClass = expanded
    ? "fixed inset-0 z-50 flex flex-col bg-wo-bg pt-11"
    : "absolute top-full right-0 mt-2 w-[480px] max-h-[600px] flex flex-col rounded-xl bg-wo-bg-elevated border border-wo-border shadow-2xl z-50 overflow-hidden";

  const viewingTaskObj = viewingTask ? tasks.find((t) => t.id === viewingTask) : null;

  return (
    <>
      <div ref={panelRef} className={panelClass}>
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-b border-wo-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Agents</h3>
            <span className="text-xs text-wo-text-tertiary">{runningCount} running</span>
          </div>
          <div className="flex items-center gap-2">
            {completedCount > 0 && (
              <button
                type="button"
                onClick={onClearAllCompleted}
                className="flex items-center gap-1 px-2 h-7 rounded-md text-xs text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
              >
                <Trash2 size={11} />
                Clear completed
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

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-xs text-wo-text-tertiary py-8 text-center">
              No agent tasks yet.
            </p>
          ) : (
            sorted.map((task) => (
              <AgentTaskRow
                key={task.id}
                task={task}
                onCancel={() => onCancel(task.id)}
                onClear={() => onClear(task.id)}
                onView={() => handleView(task.id)}
              />
            ))
          )}
        </div>
      </div>

      {viewingTask && viewingTaskObj && (
        <AgentTerminal
          output={viewLogs}
          isRunning={viewingTaskObj.status === "running"}
          title={`${taskLabel(viewingTaskObj.taskType)} — PR #${viewingTaskObj.prId}`}
          onClose={() => { setViewingTask(null); setViewLogs(""); }}
        />
      )}
    </>
  );
}

/* --- Row --- */

interface AgentTaskRowProps {
  task: AgentTask;
  onCancel: () => void;
  onClear: () => void;
  onView: () => void;
}

function AgentTaskRow({ task, onCancel, onClear, onView }: AgentTaskRowProps) {
  const [duration, setDuration] = useState(formatDuration(task.startedAt, task.completedAt));

  useEffect(() => {
    if (task.status !== "running") {
      setDuration(formatDuration(task.startedAt, task.completedAt));
      return;
    }
    const interval = setInterval(() => {
      setDuration(formatDuration(task.startedAt, null));
    }, 1000);
    return () => clearInterval(interval);
  }, [task.status, task.startedAt, task.completedAt]);

  const statusIcon = task.status === "running"
    ? <Loader2 size={12} className="animate-spin text-amber-500" />
    : task.status === "completed"
      ? <Circle size={12} className="fill-wo-success text-wo-success" />
      : task.status === "failed"
        ? <Circle size={12} className="fill-wo-danger text-wo-danger" />
        : <Circle size={12} className="fill-wo-text-tertiary text-wo-text-tertiary" />;

  return (
    <div className="flex items-center gap-3 p-3 border border-wo-border rounded-lg bg-wo-bg-elevated">
      {statusIcon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <strong className="text-sm font-medium truncate">{taskLabel(task.taskType)}</strong>
          <span className="text-xs text-wo-text-tertiary">PR #{task.prId}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-wo-text-tertiary font-mono">{task.cli}</span>
          {task.tokenEstimate > 0 && (
            <span className="text-[11px] text-wo-text-tertiary">~{(task.tokenEstimate / 1000).toFixed(0)}k tokens</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-wo-text-tertiary tabular-nums">{duration}</span>
        {task.status === "running" ? (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md text-wo-danger hover:bg-wo-bg-subtle transition-colors"
            title="Cancel"
          >
            <Square size={12} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onView}
              className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
              title="View output"
            >
              <Eye size={12} />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
              title="Clear"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
