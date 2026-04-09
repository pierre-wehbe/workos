import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Workspace } from "../lib/types";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitch: (id: string) => void;
}

export function WorkspaceSwitcher({ workspaces, activeWorkspace, onSwitch }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 h-9 rounded-lg bg-wo-bg-subtle border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg transition-colors"
      >
        <span className="truncate">{activeWorkspace?.name ?? "No workspace"}</span>
        <ChevronDown size={14} className="text-wo-text-tertiary shrink-0" />
      </button>

      {open && workspaces.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 py-1 rounded-lg bg-wo-bg-elevated border border-wo-border shadow-lg z-50">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => { onSwitch(ws.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-wo-bg-subtle transition-colors ${
                ws.id === activeWorkspace?.id ? "text-wo-accent font-medium" : "text-wo-text"
              }`}
            >
              {ws.name}
              <span className="block text-xs text-wo-text-tertiary">{ws.org}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
