import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, GitPullRequest, LayoutDashboard, Pin, Settings } from "lucide-react";
import type { Project, Workspace } from "../lib/types";
import { ipc } from "../lib/ipc";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  pinnedProjects: Project[];
  reviewRequestCount: number;
  onSwitchWorkspace: (id: string) => void;
  onWorkspaceCreated: () => void;
  currentView: string;
  onNavigate: (view: "dashboard" | "settings" | "github") => void;
  onOpenProject: (project: Project) => void;
  selectedProjectId: string | null;
}

export function Sidebar({
  workspaces, activeWorkspace, pinnedProjects, reviewRequestCount,
  onSwitchWorkspace, onWorkspaceCreated,
  currentView, onNavigate, onOpenProject, selectedProjectId,
}: SidebarProps) {
  const [worktreeCounts, setWorktreeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    for (const p of pinnedProjects) {
      if (!p.localPath) continue;
      ipc.listWorktrees(p.localPath).then((wts) => {
        if (cancelled) return;
        const count = wts.filter((w) => !w.isMain).length;
        setWorktreeCounts((prev) => ({ ...prev, [p.id]: count }));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [pinnedProjects]);

  return (
    <aside className="w-60 shrink-0 bg-wo-bg-subtle border-r border-wo-border flex flex-col">
      <div className="p-4">
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspace={activeWorkspace} onSwitch={onSwitchWorkspace} onCreated={onWorkspaceCreated} />
      </div>

      <nav className="flex-1 px-3 overflow-y-auto">
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentView === "dashboard" && !selectedProjectId ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg"
          }`}
        >
          <LayoutDashboard size={16} />
          Dashboard
        </button>

        <button
          type="button"
          onClick={() => onNavigate("github")}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentView === "github" ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg"
          }`}
        >
          <span className="flex items-center gap-2.5">
            <GitPullRequest size={16} />
            GitHub
          </span>
          {reviewRequestCount > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-wo-danger text-white text-[10px] font-bold">
              {reviewRequestCount}
            </span>
          )}
        </button>

        {pinnedProjects.length > 0 && (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 px-3 mb-1 text-[10px] font-medium text-wo-text-tertiary uppercase tracking-wider">
              <Pin size={9} className="fill-current" />
              Pinned
            </p>
            {pinnedProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject(p)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedProjectId === p.id ? "bg-wo-accent-soft text-wo-accent font-medium" : "text-wo-text-secondary hover:bg-wo-bg"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FolderOpen size={14} className="shrink-0" />
                  <span className="truncate">{p.name}</span>
                </span>
                {(worktreeCounts[p.id] ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-wo-text-tertiary shrink-0 ml-1" title={`${worktreeCounts[p.id]} active worktree${worktreeCounts[p.id] !== 1 ? "s" : ""}`}>
                    <GitBranch size={10} />
                    {worktreeCounts[p.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-wo-border">
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentView === "settings" ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg"
          }`}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </aside>
  );
}
