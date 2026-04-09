import { useState } from "react";
import { Plus, FolderPlus } from "lucide-react";
import type { Project, Workspace } from "../../lib/types";
import { useProjects } from "../../lib/use-projects";
import { ProjectCard } from "./ProjectCard";
import { AddProjectDialog } from "./AddProjectDialog";

interface DashboardPageProps {
  workspace: Workspace;
  onOpenProject: (project: Project) => void;
  runningProcessIds: Set<string>;
  onStartProcess: (project: Project) => void;
  onStopProcess: (projectId: string) => void;
}

export function DashboardPage({ workspace, onOpenProject, runningProcessIds, onStartProcess, onStopProcess }: DashboardPageProps) {
  const { projects, refresh, remove } = useProjects(workspace.id);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-medium text-wo-text-tertiary uppercase tracking-wider mb-1">{workspace.org}</p>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors"
        >
          <Plus size={16} />
          Add Project
        </button>
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
              onDelete={() => { if (confirm(`Delete "${p.name}"?`)) remove(p.id); }}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddProjectDialog
          workspaceId={workspace.id}
          onCreated={() => { setShowAdd(false); refresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
