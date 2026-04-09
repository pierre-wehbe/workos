import { useEffect, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { Sidebar } from "./components/Sidebar";
import { OnboardingPage } from "./pages/onboarding/OnboardingPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { ProjectDetailPage } from "./pages/project/ProjectDetailPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { useWorkspaces } from "./lib/use-workspaces";
import type { AppConfig, Project } from "./lib/types";
import { ProcessBadge } from "./components/ProcessBadge";
import { ProcessPanel } from "./components/ProcessPanel";
import { useProcesses } from "./lib/use-processes";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [view, setView] = useState<"dashboard" | "settings">("dashboard");
  const { workspaces, activeWorkspace, switchWorkspace, refresh: refreshWorkspaces } = useWorkspaces();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { processes, runningCount, start: startProcess, stop: stopProcess, clear: clearProcess, clearAllStopped } = useProcesses();
  const [showProcessPanel, setShowProcessPanel] = useState(false);

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleOnboardingComplete = () => {
    setConfig({ ...config, setupComplete: true });
    refreshWorkspaces();
  };

  const handleStartProcess = async (project: Project) => {
    await startProcess({
      projectId: project.id,
      projectName: project.name,
      workspaceId: activeWorkspace?.id ?? "",
      workspaceName: activeWorkspace?.name ?? "",
      toolName: project.devCommand ?? "dev",
      command: project.devCommand ?? "",
      workingDir: project.localPath,
    });
    setSelectedProject(project);
  };

  const handleStopProcess = (projectId: string) => {
    const proc = processes.find((p) => p.projectId === projectId && p.status === "running");
    if (proc) stopProcess(proc.id);
  };

  const runningProcessIds = new Set(
    processes.filter((p) => p.status === "running").map((p) => p.projectId)
  );

  return (
    <div className="h-full flex flex-col bg-wo-bg text-wo-text">
      {/* Titlebar */}
      <div className="drag-region h-11 shrink-0 flex items-center px-5 border-b border-wo-border">
        <span className="pl-16 text-xs font-medium text-wo-text-tertiary uppercase tracking-widest select-none">
          WorkOS
        </span>
        <div className="no-drag ml-auto flex items-center gap-1 relative">
          <ProcessBadge count={runningCount} onClick={() => setShowProcessPanel(!showProcessPanel)} />
          {showProcessPanel && (
            <ProcessPanel
              processes={processes}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspace?.id ?? null}
              onStop={stopProcess}
              onClear={clearProcess}
              onClearAllStopped={clearAllStopped}
              onClose={() => setShowProcessPanel(false)}
            />
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex">
        {!config.setupComplete ? (
          <OnboardingPage onComplete={handleOnboardingComplete} />
        ) : (
          <>
            <Sidebar
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSwitchWorkspace={switchWorkspace}
              onWorkspaceCreated={refreshWorkspaces}
              currentView={view}
              onNavigate={(v) => { setView(v); setSelectedProject(null); }}
            />
            <main className="flex-1 overflow-y-auto">
              {selectedProject ? (
                <ProjectDetailPage
                  project={selectedProject}
                  processes={processes}
                  workspaceId={activeWorkspace?.id ?? ""}
                  workspaceName={activeWorkspace?.name ?? ""}
                  onStartProcess={startProcess}
                  onStopProcess={stopProcess}
                  onBack={() => setSelectedProject(null)}
                  onDeleted={() => { setSelectedProject(null); }}
                />
              ) : view === "dashboard" && activeWorkspace ? (
                <DashboardPage
                  workspace={activeWorkspace}
                  onOpenProject={setSelectedProject}
                  runningProcessIds={runningProcessIds}
                  onStartProcess={handleStartProcess}
                  onStopProcess={handleStopProcess}
                />
              ) : view === "settings" ? (
                <SettingsPage
                  workspaces={workspaces}
                  activeWorkspace={activeWorkspace}
                  onSwitchWorkspace={switchWorkspace}
                  onRefresh={refreshWorkspaces}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-wo-text-secondary">Select a workspace</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
