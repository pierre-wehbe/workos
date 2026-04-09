import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, FolderOpen, GitBranch, Maximize2, Play, RotateCw, Square, Trash2 } from "lucide-react";
import type { ProcessEntry, Project } from "../../lib/types";
import { ipc } from "../../lib/ipc";
import { Terminal } from "../../components/Terminal";
import { FullscreenTerminal } from "../../components/FullscreenTerminal";
import { ToolsTab } from "./ToolsTab";

interface ProjectDetailPageProps {
  project: Project;
  processes: ProcessEntry[];
  workspaceId: string;
  workspaceName: string;
  onStartProcess: (data: {
    projectId: string; projectName: string; workspaceId: string;
    workspaceName: string; toolName: string; command: string; workingDir?: string;
  }) => void;
  onStopProcess: (processId: string) => void;
  onBack: () => void;
  onDeleted: () => void;
}

export function ProjectDetailPage({
  project, processes, workspaceId, workspaceName,
  onStartProcess, onStopProcess, onBack, onDeleted,
}: ProjectDetailPageProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const [tab, setTab] = useState<"tools" | "terminal">("tools");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalFullscreen, setTerminalFullscreen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // All processes for this project, newest first
  const projectProcesses = processes
    .filter((p) => p.projectId === project.id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const runningProcess = projectProcesses.find((p) => p.status === "running");

  // Auto-select: use explicit selection if valid, otherwise latest
  const activeProcess = (selectedProcessId
    ? projectProcesses.find((p) => p.id === selectedProcessId)
    : null) ?? projectProcesses[0] ?? null;

  useEffect(() => {
    ipc.gitBranch(project.localPath).then(setBranch);
  }, [project.localPath]);

  // When a new process starts, auto-select it
  useEffect(() => {
    if (projectProcesses.length > 0) {
      const newest = projectProcesses[0];
      if (newest.status === "running") {
        setSelectedProcessId(newest.id);
      }
    }
  }, [projectProcesses.length]);

  // Load logs for selected process and stream new output
  useEffect(() => {
    if (!activeProcess) { setTerminalOutput(""); return; }

    ipc.getProcessLogs(activeProcess.id).then(setTerminalOutput);

    if (activeProcess.status === "running") {
      const unsub = ipc.onProcessOutput((id, chunk) => {
        if (id !== activeProcess.id) return;
        setTerminalOutput((prev) => prev + chunk);
      });
      cleanupRef.current = unsub;
      return () => { unsub(); cleanupRef.current = null; };
    }
  }, [activeProcess?.id, activeProcess?.status]);

  const handleStart = () => {
    if (!project.devCommand) return;
    setTerminalOutput("");
    setSelectedProcessId(null); // Will auto-select newest
    onStartProcess({
      projectId: project.id,
      projectName: project.name,
      workspaceId,
      workspaceName,
      toolName: project.devCommand,
      command: project.devCommand,
      workingDir: project.localPath,
    });
  };

  const handleRunTool = (command: string, workingDir: string, toolName: string) => {
    setTerminalOutput("");
    setSelectedProcessId(null); // Will auto-select newest
    const fullPath = workingDir === "." ? project.localPath : `${project.localPath}/${workingDir}`;
    onStartProcess({
      projectId: project.id,
      projectName: project.name,
      workspaceId,
      workspaceName,
      toolName,
      command,
      workingDir: fullPath,
    });
    setTab("terminal");
  };

  const handleDelete = async () => {
    if (deleteConfirm !== project.name) return;
    setDeleting(true);
    await ipc.deleteDirectory(project.localPath);
    await ipc.deleteProject(project.id);
    setDeleting(false);
    onDeleted();
  };

  const isActiveRunning = activeProcess?.status === "running";
  const hasAnyRunning = !!runningProcess;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-wo-border">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-wo-text-secondary hover:text-wo-text transition-colors mb-3">
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold">{project.name}</h1>
              {branch && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-wo-bg-subtle text-xs text-wo-text-tertiary font-mono">
                  <GitBranch size={12} />
                  {branch}
                </span>
              )}
            </div>
            <p className="text-xs text-wo-text-tertiary mt-1">{project.localPath}</p>
            {project.repoUrl && (
              <p className="text-xs text-wo-text-tertiary mt-0.5 font-mono">{project.repoUrl}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {project.devCommand && (
              hasAnyRunning ? (
                <button type="button" onClick={() => onStopProcess(runningProcess!.id)} className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-danger text-white text-sm font-medium hover:opacity-90 transition-opacity">
                  <Square size={14} />
                  Stop
                </button>
              ) : (
                <button type="button" onClick={handleStart} className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-success text-white text-sm font-medium hover:opacity-90 transition-opacity">
                  <Play size={14} />
                  Start
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => ipc.openInIDE(project.localPath, project.ide)}
              className="px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
            >
              Open in {project.ide}
            </button>
            <button
              type="button"
              onClick={() => ipc.openInFinder(project.localPath)}
              className="p-2 rounded-lg border border-wo-border text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors"
            >
              <FolderOpen size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="p-2 rounded-lg border border-wo-border text-wo-text-tertiary hover:text-wo-danger hover:border-wo-danger/30 transition-colors"
              title="Delete project"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex gap-1 px-6 pt-3 border-b border-wo-border">
        <button
          type="button"
          onClick={() => setTab("tools")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "tools"
              ? "border-wo-accent text-wo-accent"
              : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
          }`}
        >
          Tools
        </button>
        <button
          type="button"
          onClick={() => setTab("terminal")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "terminal"
              ? "border-wo-accent text-wo-accent"
              : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
          }`}
        >
          Terminal
        </button>
      </div>

      {/* Terminal */}
      {tab === "terminal" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Terminal toolbar */}
          <div className="shrink-0 flex items-center justify-between px-6 py-2">
            <div className="flex items-center gap-2">
              {/* Process selector */}
              {projectProcesses.length > 1 && (
                <div className="relative">
                  <select
                    value={activeProcess?.id ?? ""}
                    onChange={(e) => setSelectedProcessId(e.target.value)}
                    className="h-7 pl-2 pr-6 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text appearance-none focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
                  >
                    {projectProcesses.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.status === "running" ? "\u25cf " : "\u25cb "}
                        {p.toolName} — {new Date(p.startedAt).toLocaleTimeString()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-wo-text-tertiary pointer-events-none" />
                </div>
              )}
              {activeProcess?.status === "running" ? (
                <button
                  type="button"
                  onClick={() => onStopProcess(activeProcess.id)}
                  className="flex items-center gap-1.5 px-3 h-7 rounded-md bg-wo-danger text-white text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <Square size={11} />
                  Stop
                </button>
              ) : project.devCommand ? (
                <button
                  type="button"
                  onClick={handleStart}
                  className="flex items-center gap-1.5 px-3 h-7 rounded-md bg-wo-success text-white text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <RotateCw size={11} />
                  {terminalOutput ? "Restart" : "Start"}
                </button>
              ) : null}
              {activeProcess?.status === "running" && <span className="w-2 h-2 rounded-full bg-wo-success animate-pulse" />}
              {activeProcess && activeProcess.status !== "running" && activeProcess.exitCode != null && (
                <span className={`text-xs ${activeProcess.exitCode === 0 ? "text-wo-success" : "text-wo-danger"}`}>
                  Exited with code {activeProcess.exitCode}
                </span>
              )}
            </div>
            {terminalOutput && (
              <button
                type="button"
                onClick={() => setTerminalFullscreen(true)}
                className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
                title="Fullscreen"
              >
                <Maximize2 size={13} />
              </button>
            )}
          </div>
          {/* Terminal content */}
          <div className="flex-1 min-h-0 px-6 pb-6">
            {terminalOutput || isActiveRunning ? (
              <div className="h-full rounded-xl border border-wo-border bg-wo-bg-subtle overflow-hidden">
                <Terminal key={activeProcess?.id ?? "empty"} output={terminalOutput} isRunning={isActiveRunning} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-wo-text-tertiary text-sm">
                {project.devCommand
                  ? `Press Start to run: ${project.devCommand}`
                  : "No dev command configured. Add one in project settings or use the Tools tab."}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "tools" && (
        <ToolsTab project={project} onRunTool={handleRunTool} />
      )}

      {/* Fullscreen terminal */}
      {terminalFullscreen && (
        <FullscreenTerminal
          output={terminalOutput}
          isRunning={isActiveRunning}
          title={`${project.name} — ${activeProcess?.toolName ?? project.devCommand ?? "Terminal"}`}
          processId={activeProcess?.id}
          onClose={() => setTerminalFullscreen(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setShowDelete(false)}>
          <div className="w-full max-w-sm bg-wo-bg-elevated border border-wo-border rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-wo-danger mb-2">Delete project</h3>
            <p className="text-sm text-wo-text-secondary mb-1">
              This will permanently delete the local directory and remove the project from WorkOS.
            </p>
            <p className="text-xs text-wo-text-tertiary font-mono mb-4 break-all">{project.localPath}</p>
            <label className="block mb-4">
              <span className="text-sm text-wo-text mb-1.5 block">
                Type <strong className="font-semibold">{project.name}</strong> to confirm
              </span>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={project.name}
                className="w-full h-10 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-danger/40 focus:border-wo-danger transition"
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowDelete(false); setDeleteConfirm(""); }} className="px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteConfirm !== project.name || deleting}
                className="px-4 h-9 rounded-lg bg-wo-danger text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
