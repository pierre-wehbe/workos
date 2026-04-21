import { useState } from "react";
import { ArrowUpDown, ClipboardCheck, Cpu, Database, FolderOpen, PanelLeftClose, PanelLeftOpen, Shield, Sparkles } from "lucide-react";
import { useEffect } from "react";
import type { AgentContextIntent, AICli, Workspace } from "../../lib/types";
import { PrerequisitePanel } from "./PrerequisitePanel";
import { MachinePanel } from "./MachinePanel";
import { WorkspacePanel } from "./WorkspacePanel";
import { ExportImportPanel } from "./ExportImportPanel";
import { DataControlPanel } from "./DataControlPanel";
import { RubricEditor } from "./RubricEditor";
import { AgentContextPanel } from "./AgentContextPanel";

const tabs = [
  { id: "workspaces", label: "Workspaces", icon: FolderOpen },
  { id: "machine", label: "Machine", icon: Cpu },
  { id: "context", label: "Agent Context", icon: Sparkles },
  { id: "rubric", label: "Review Rubric", icon: ClipboardCheck },
  { id: "prerequisites", label: "Prerequisites", icon: Shield },
  { id: "export", label: "Export / Import", icon: ArrowUpDown },
  { id: "data", label: "Data Control", icon: Database },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface SettingsPageProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  selectedCli: AICli;
  initialAgentContextIntent?: AgentContextIntent | null;
  onSwitchWorkspace: (id: string) => void;
  onRefresh: () => void;
}

export function SettingsPage({
  workspaces,
  activeWorkspace,
  selectedCli,
  initialAgentContextIntent = null,
  onSwitchWorkspace,
  onRefresh,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("workspaces");
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    if (initialAgentContextIntent) setActiveTab("context");
  }, [initialAgentContextIntent]);

  return (
    <div className="h-full flex">
      <nav className={`${navCollapsed ? "w-[4.5rem]" : "w-56"} shrink-0 border-r border-wo-border p-3 transition-[width] duration-200`}>
        <div className={`mb-3 flex items-center ${navCollapsed ? "justify-center" : "justify-between"} px-1`}>
          {!navCollapsed && <p className="text-xs font-semibold uppercase tracking-wider text-wo-text-tertiary">Settings</p>}
          <button
            type="button"
            onClick={() => setNavCollapsed((value) => !value)}
            className="rounded-lg p-2 text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors"
            title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {navCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
        <div className="space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`w-full flex items-center ${navCollapsed ? "justify-center" : "gap-2.5"} px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg-subtle"
              }`}
            >
              <Icon size={15} />
              {!navCollapsed && tab.label}
            </button>
          );
        })}
        </div>
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "machine" && <MachinePanel />}
        {activeTab === "context" && (
          <AgentContextPanel
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            selectedCli={selectedCli}
            initialIntent={initialAgentContextIntent}
          />
        )}
        {activeTab === "rubric" && <RubricEditor />}
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
