import { useState } from "react";
import { Shield, FolderPlus } from "lucide-react";
import { PrerequisiteCheck } from "./PrerequisiteCheck";
import { WorkspaceSetup } from "./WorkspaceSetup";

const steps = [
  { name: "Prerequisites", icon: Shield },
  { name: "Workspace", icon: FolderPlus },
];

interface OnboardingPageProps {
  onComplete: () => void;
}

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [phase, setPhase] = useState(0);

  return (
    <div className="h-full flex">
      <aside className="w-60 shrink-0 bg-wo-bg-subtle border-r border-wo-border p-5">
        <div className="mb-8">
          <p className="text-[11px] font-medium text-wo-text-tertiary uppercase tracking-wider mb-1">Setup</p>
          <h1 className="text-lg font-semibold">WorkOS</h1>
        </div>
        <ol className="space-y-1 list-none p-0 m-0">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.name}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  i === phase
                    ? "bg-wo-bg-elevated border border-wo-border"
                    : i < phase
                      ? "text-wo-success"
                      : "text-wo-text-tertiary"
                }`}
              >
                <Icon size={16} />
                <span className="text-sm font-medium">{step.name}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="flex-1 overflow-y-auto p-8">
        {phase === 0 && <PrerequisiteCheck onAllPassed={() => setPhase(1)} />}
        {phase === 1 && <WorkspaceSetup onComplete={onComplete} />}
      </div>
    </div>
  );
}
