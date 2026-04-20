import { useState } from "react";
import { Plus, FolderPlus, Search, Loader2 } from "lucide-react";
import type { Project, Workspace } from "../../lib/types";
import { useProjects } from "../../lib/use-projects";
import { ipc } from "../../lib/ipc";
import { ProjectCard } from "./ProjectCard";
import { AddProjectDialog } from "./AddProjectDialog";
import { DashboardWorktrees } from "../../components/DashboardWorktrees";

interface DashboardPageProps {
  workspace: Workspace;
  onOpenProject: (project: Project) => void;
  runningProcessIds: Set<string>;
  onStartProcess: (project: Project) => void;
  onStopProcess: (projectId: string) => void;
  onProjectsChanged?: () => void;
}

export function DashboardPage({ workspace, onOpenProject, runningProcessIds, onStartProcess, onStopProcess, onProjectsChanged }: DashboardPageProps) {
  const { projects, refresh, update, remove } = useProjects(workspace.id);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    const repos = await ipc.scanRepos(workspace.path);
    const existingPaths = new Set(projects.map((p) => p.localPath));
    let added = 0;
    for (const repo of repos) {
      if (existingPaths.has(repo.localPath)) continue;
      await ipc.createProject({
        workspaceId: workspace.id,
        name: repo.name,
        repoUrl: repo.repoUrl || undefined,
        localPath: repo.localPath,
      });
      added++;
    }
    await refresh();
    setScanning(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-medium text-wo-text-tertiary uppercase tracking-wider mb-1">{workspace.org}</p>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {scanning ? "Scanning..." : "Scan for repos"}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors"
          >
            <Plus size={16} />
            Add Project
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderPlus size={40} className="text-wo-text-tertiary mb-4" />
          <h2 className="text-lg font-medium text-wo-text-secondary mb-1">No projects yet</h2>
          <p className="text-sm text-wo-text-tertiary mb-4">Add your first project to get started.</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors"
          >
            Add Project
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              isRunning={runningProcessIds.has(p.id)}
              onStart={() => onStartProcess(p)}
              onStop={() => onStopProcess(p.id)}
              onOpen={() => onOpenProject(p)}
              onTogglePin={async () => { await update(p.id, { pinned: !p.pinned }); onProjectsChanged?.(); }}
              onDelete={() => { if (confirm(`Delete "${p.name}"?`)) remove(p.id); }}
            />
          ))}
        </div>
      )}

      {projects.length > 0 && <DashboardWorktrees projects={projects} />}

      {showAdd && (
        <AddProjectDialog
          workspaceId={workspace.id}
          workspacePath={workspace.path}
          onCreated={() => { setShowAdd(false); refresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
