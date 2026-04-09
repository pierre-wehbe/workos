import { useEffect, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { Sidebar } from "./components/Sidebar";
import { OnboardingPage } from "./pages/onboarding/OnboardingPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { useWorkspaces } from "./lib/use-workspaces";
import { ipc } from "./lib/ipc";
import type { AppConfig, Project } from "./lib/types";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [view, setView] = useState<"dashboard" | "settings">("dashboard");
  const { workspaces, activeWorkspace, loading, switchWorkspace, refresh: refreshWorkspaces } = useWorkspaces();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [runningProcessIds, setRunningProcessIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleOnboardingComplete = () => {
    setConfig({ ...config, setupComplete: true });
    refreshWorkspaces();
  };

  const handleStartProcess = (project: Project) => {
    setRunningProcessIds((prev) => new Set(prev).add(project.id));
    setSelectedProject(project);
  };

  const handleStopProcess = (projectId: string) => {
    ipc.cancelCommand(projectId);
    setRunningProcessIds((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-wo-bg text-wo-text">
      {/* Titlebar */}
      <div className="drag-region h-11 shrink-0 flex items-center px-5 border-b border-wo-border">
        <span className="pl-16 text-xs font-medium text-wo-text-tertiary uppercase tracking-widest select-none">
          WorkOS
        </span>
        <div className="no-drag ml-auto flex items-center gap-1">
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
              currentView={view}
              onNavigate={(v) => { setView(v); setSelectedProject(null); }}
            />
            <main className="flex-1 overflow-y-auto">
              {view === "dashboard" && activeWorkspace ? (
                <DashboardPage
                  workspace={activeWorkspace}
                  onOpenProject={setSelectedProject}
                  runningProcessIds={runningProcessIds}
                  onStartProcess={handleStartProcess}
                  onStopProcess={handleStopProcess}
                />
              ) : view === "settings" ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-wo-text-secondary">Settings — Checkpoint 6</p>
                </div>
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
