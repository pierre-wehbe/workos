import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FolderOpen, GitBranch, Play, Square, Trash2 } from "lucide-react";
import type { ProcessEntry, Project } from "../../lib/types";
import { ipc } from "../../lib/ipc";
import { Terminal } from "../../components/Terminal";
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
  const [tab, setTab] = useState<"terminal" | "tools">("terminal");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState("");
  const cleanupRef = useRef<(() => void) | null>(null);

  // Find running process for this project
  const runningProcess = processes.find((p) => p.projectId === project.id && p.status === "running");
  const lastProcess = processes
    .filter((p) => p.projectId === project.id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

  useEffect(() => {
    ipc.gitBranch(project.localPath).then(setBranch);
  }, [project.localPath]);

  // Load logs for the latest process and stream new output
  useEffect(() => {
    if (!lastProcess) { setTerminalOutput(""); return; }

    ipc.getProcessLogs(lastProcess.id).then(setTerminalOutput);

    if (lastProcess.status === "running") {
      const unsub = ipc.onProcessOutput((id, chunk) => {
        if (id !== lastProcess.id) return;
        setTerminalOutput((prev) => prev + chunk);
      });
      cleanupRef.current = unsub;
      return () => { unsub(); cleanupRef.current = null; };
    }
  }, [lastProcess?.id, lastProcess?.status]);

  const handleStart = () => {
    if (!project.devCommand) return;
    setTerminalOutput("");
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

  const isRunning = !!runningProcess;

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
              isRunning ? (
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
          onClick={() => setTab("terminal")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "terminal"
              ? "border-wo-accent text-wo-accent"
              : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
          }`}
        >
          Terminal
        </button>
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
      </div>

      {/* Terminal */}
      {tab === "terminal" && (
        <div className="flex-1 min-h-0 p-6">
          {terminalOutput || isRunning ? (
            <div className="h-full rounded-xl border border-wo-border bg-wo-bg-subtle overflow-hidden">
              <Terminal output={terminalOutput} isRunning={isRunning} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-wo-text-tertiary text-sm">
              {project.devCommand
                ? `Press Start to run: ${project.devCommand}`
                : "No dev command configured. Add one in project settings or use the Tools tab."}
              {lastProcess?.exitCode != null && (
                <span className={`ml-2 ${lastProcess.exitCode === 0 ? "text-wo-success" : "text-wo-danger"}`}>
                  (exited with code {lastProcess.exitCode})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "tools" && (
        <ToolsTab project={project} onRunTool={handleRunTool} />
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
