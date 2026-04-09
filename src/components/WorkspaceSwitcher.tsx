import { ChevronDown, FolderOpen, Loader2, Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Workspace } from "../lib/types";
import { ipc } from "../lib/ipc";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitch: (id: string) => void;
  onCreated: () => void;
}

export function WorkspaceSwitcher({ workspaces, activeWorkspace, onSwitch, onCreated }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [wsPath, setWsPath] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowForm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCreate = async () => {
    if (!org.trim() || !name.trim() || !wsPath.trim()) return;
    setSaving(true);
    const ws = await ipc.createWorkspace({ name: name.trim(), org: org.trim(), path: wsPath.trim() });
    await ipc.setActiveWorkspace(ws.id);
    setSaving(false);
    setOrg(""); setName(""); setWsPath("");
    setShowForm(false); setOpen(false);
    onCreated();
  };

  const handleBrowse = async () => {
    const selected = await ipc.selectDirectory();
    if (selected) setWsPath(selected);
  };

  const inputClass = "w-full h-8 px-2.5 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition";

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

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-wo-bg-elevated border border-wo-border shadow-lg z-50">
          {workspaces.length > 0 && (
            <div className="py-1">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => { onSwitch(ws.id); setOpen(false); setShowForm(false); }}
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

          <div className="border-t border-wo-border">
            {!showForm ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors"
              >
                <Plus size={14} />
                New workspace
              </button>
            ) : (
              <div className="p-3 space-y-2">
                <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Organization" className={inputClass} />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" className={inputClass} />
                <div className="flex gap-1.5">
                  <input value={wsPath} onChange={(e) => setWsPath(e.target.value)} placeholder="Directory" className={inputClass} />
                  <button type="button" onClick={handleBrowse} className="h-8 px-2 rounded-md border border-wo-border bg-wo-bg text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors shrink-0">
                    <FolderOpen size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!org.trim() || !name.trim() || !wsPath.trim() || saving}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {saving ? "Creating..." : "Create"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
