import { useState } from "react";
import { ArrowUpDown, Database, FolderOpen, Shield } from "lucide-react";
import type { Workspace } from "../../lib/types";
import { PrerequisitePanel } from "./PrerequisitePanel";
import { WorkspacePanel } from "./WorkspacePanel";
import { ExportImportPanel } from "./ExportImportPanel";
import { DataControlPanel } from "./DataControlPanel";

const tabs = [
  { id: "prerequisites", label: "Prerequisites", icon: Shield },
  { id: "workspaces", label: "Workspaces", icon: FolderOpen },
  { id: "export", label: "Export / Import", icon: ArrowUpDown },
  { id: "data", label: "Data Control", icon: Database },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface SettingsPageProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitchWorkspace: (id: string) => void;
  onRefresh: () => void;
}

export function SettingsPage({ workspaces, activeWorkspace, onSwitchWorkspace, onRefresh }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("prerequisites");

  return (
    <div className="h-full flex">
      <nav className="w-48 shrink-0 border-r border-wo-border p-4 space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg-subtle"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "prerequisites" && <PrerequisitePanel />}
        {activeTab === "workspaces" && (
          <WorkspacePanel workspaces={workspaces} activeWorkspace={activeWorkspace} onSwitch={onSwitchWorkspace} onRefresh={onRefresh} />
        )}
        {activeTab === "export" && <ExportImportPanel onRefresh={onRefresh} />}
        {activeTab === "data" && <DataControlPanel />}
      </div>
    </div>
  );
}
