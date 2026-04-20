import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { ipc } from "../../lib/ipc";

interface WorkspaceSetupProps {
  onComplete: () => void;
}

export function WorkspaceSetup({ onComplete }: WorkspaceSetupProps) {
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [wsPath, setWsPath] = useState("");
  const [saving, setSaving] = useState(false);

  const isValid = org.trim() && name.trim() && wsPath.trim();

  const handleBrowse = async () => {
    const selected = await ipc.selectDirectory();
    if (selected) setWsPath(selected);
  };

  const handleCreate = async () => {
    if (!isValid) return;
    setSaving(true);
    await ipc.createWorkspace({ name: name.trim(), org: org.trim(), path: wsPath.trim() });
    const workspaces = await ipc.getWorkspaces();
    if (workspaces.length > 0) {
      await ipc.setActiveWorkspace(workspaces[0].id);
    }
    await ipc.setSetupComplete(true);
    setSaving(false);
    onComplete();
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-wo-border bg-wo-bg-elevated text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 focus:border-wo-accent transition";

  return (
    <div>
      <p className="text-xs font-medium text-wo-text-tertiary uppercase tracking-wider mb-2">Workspace</p>
      <h2 className="text-xl font-semibold mb-1">Create your first workspace.</h2>
      <p className="text-sm text-wo-text-secondary mb-6">
        A workspace groups projects for an organization. You can add more later in Settings.
      </p>

      <div className="space-y-4 max-w-md">
        <label className="block">
          <span className="text-sm font-medium text-wo-text mb-1.5 block">Organization</span>
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. personal" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-wo-text mb-1.5 block">Workspace name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Personal" className={inputClass} />
        </label>
        <div>
          <span className="text-sm font-medium text-wo-text mb-1.5 block">Directory</span>
          <div className="flex gap-2">
            <input value={wsPath} onChange={(e) => setWsPath(e.target.value)} placeholder="/Users/you/Development/org" className={inputClass} />
            <button type="button" onClick={handleBrowse} className="h-10 px-3 rounded-lg border border-wo-border bg-wo-bg-elevated text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors">
              <FolderOpen size={16} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={!isValid || saving}
        className="mt-6 px-5 h-10 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Creating..." : "Create & Continue"}
      </button>
    </div>
  );
}
