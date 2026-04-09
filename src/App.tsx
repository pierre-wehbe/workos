import { useEffect, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { OnboardingPage } from "./pages/onboarding/OnboardingPage";
import { useWorkspaces } from "./lib/use-workspaces";
import type { AppConfig } from "./lib/types";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const { refresh: refreshWorkspaces } = useWorkspaces();

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleOnboardingComplete = () => {
    setConfig({ ...config, setupComplete: true });
    refreshWorkspaces();
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
      <div className="flex-1 min-h-0">
        {!config.setupComplete ? (
          <OnboardingPage onComplete={handleOnboardingComplete} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-sm text-wo-text-secondary mt-2">Checkpoint 3 complete — onboarding works</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
