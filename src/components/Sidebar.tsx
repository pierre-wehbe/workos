import { LayoutDashboard, Settings } from "lucide-react";
import type { Workspace } from "../lib/types";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitchWorkspace: (id: string) => void;
  onWorkspaceCreated: () => void;
  currentView: "dashboard" | "settings";
  onNavigate: (view: "dashboard" | "settings") => void;
}

export function Sidebar({ workspaces, activeWorkspace, onSwitchWorkspace, onWorkspaceCreated, currentView, onNavigate }: SidebarProps) {
  return (
    <aside className="w-60 shrink-0 bg-wo-bg-subtle border-r border-wo-border flex flex-col">
      <div className="p-4">
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspace={activeWorkspace} onSwitch={onSwitchWorkspace} onCreated={onWorkspaceCreated} />
      </div>

      <nav className="flex-1 px-3">
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentView === "dashboard" ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg"
          }`}
        >
          <LayoutDashboard size={16} />
          Dashboard
        </button>
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
