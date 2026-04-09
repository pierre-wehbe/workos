import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
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
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-wo-text">WorkOS Command Center</h1>
          <p className="text-sm text-wo-text-secondary mt-2">Checkpoint 1 — Shell works</p>
        </div>
      </div>
    </div>
  );
}
