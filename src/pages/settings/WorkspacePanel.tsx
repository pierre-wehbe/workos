import { useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import type { Workspace } from "../../lib/types";
import { ipc } from "../../lib/ipc";

interface WorkspacePanelProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitch: (id: string) => void;
  onRefresh: () => void;
}

export function WorkspacePanel({ workspaces, activeWorkspace, onSwitch, onRefresh }: WorkspacePanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [wsPath, setWsPath] = useState("");

  const handleCreate = async () => {
    if (!org.trim() || !name.trim() || !wsPath.trim()) return;
    await ipc.createWorkspace({ name: name.trim(), org: org.trim(), path: wsPath.trim() });
    setOrg(""); setName(""); setWsPath(""); setShowForm(false);
    onRefresh();
  };

  const handleDelete = async (id: string, wsName: string) => {
    if (!confirm(`Delete workspace "${wsName}"? This removes it from WorkOS but does not delete any files.`)) return;
    await ipc.deleteWorkspace(id);
    onRefresh();
  };

  const inputClass = "w-full h-9 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Workspaces</h3>
        <button type="button" onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 text-xs font-medium text-wo-accent hover:text-wo-accent-hover transition-colors">
          <Plus size={14} /> Add
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-xl border border-wo-border bg-wo-bg-subtle space-y-2">
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Organization" className={inputClass} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" className={inputClass} />
          <div className="flex gap-2">
            <input value={wsPath} onChange={(e) => setWsPath(e.target.value)} placeholder="Directory" className={inputClass} />
            <button type="button" onClick={async () => { const d = await ipc.selectDirectory(); if (d) setWsPath(d); }} className="h-9 px-3 rounded-lg border border-wo-border bg-wo-bg shrink-0">
              <FolderOpen size={14} />
            </button>
          </div>
          <button type="button" onClick={handleCreate} disabled={!org.trim() || !name.trim() || !wsPath.trim()} className="px-4 h-8 rounded-lg bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40">
            Create
          </button>
        </div>
      )}

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <div key={ws.id} className="flex items-center justify-between p-3 rounded-xl border border-wo-border bg-wo-bg-elevated">
            <button type="button" onClick={() => onSwitch(ws.id)} className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <strong className="text-sm font-medium">{ws.name}</strong>
                {ws.id === activeWorkspace?.id && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-wo-accent-soft text-wo-accent">Active</span>
                )}
              </div>
              <p className="text-xs text-wo-text-tertiary truncate">{ws.org} — {ws.path}</p>
            </button>
            <button type="button" onClick={() => handleDelete(ws.id, ws.name)} className="p-2 rounded-lg text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
