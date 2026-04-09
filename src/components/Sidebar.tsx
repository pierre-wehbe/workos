import { FolderOpen, LayoutDashboard, Pin, Settings } from "lucide-react";
import type { Project, Workspace } from "../lib/types";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  pinnedProjects: Project[];
  onSwitchWorkspace: (id: string) => void;
  onWorkspaceCreated: () => void;
  currentView: "dashboard" | "settings";
  onNavigate: (view: "dashboard" | "settings") => void;
  onOpenProject: (project: Project) => void;
  selectedProjectId: string | null;
}

export function Sidebar({
  workspaces, activeWorkspace, pinnedProjects,
  onSwitchWorkspace, onWorkspaceCreated,
  currentView, onNavigate, onOpenProject, selectedProjectId,
}: SidebarProps) {
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
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedProjectId === p.id ? "bg-wo-accent-soft text-wo-accent font-medium" : "text-wo-text-secondary hover:bg-wo-bg"
                }`}
              >
                <FolderOpen size={14} />
                <span className="truncate">{p.name}</span>
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
