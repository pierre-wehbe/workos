import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { ipc } from "../../lib/ipc";

interface AddProjectDialogProps {
  workspaceId: string;
  onCreated: () => void;
  onClose: () => void;
}

export function AddProjectDialog({ workspaceId, onCreated, onClose }: AddProjectDialogProps) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [devCommand, setDevCommand] = useState("");
  const [ide, setIde] = useState<"cursor" | "vscode" | "xcode">("cursor");
  const [bootstrapCommand, setBootstrapCommand] = useState("");
  const [saving, setSaving] = useState(false);

  const isValid = name.trim() && localPath.trim();

  const handleBrowse = async () => {
    const selected = await ipc.selectDirectory();
    if (selected) {
      setLocalPath(selected);
      if (!name.trim()) setName(selected.split("/").pop() ?? "");
    }
  };

  const handleCreate = async () => {
    if (!isValid) return;
    setSaving(true);
    await ipc.createProject({
      workspaceId,
      name: name.trim(),
      repoUrl: repoUrl.trim() || undefined,
      localPath: localPath.trim(),
      devCommand: devCommand.trim() || undefined,
      ide,
      bootstrapCommand: bootstrapCommand.trim() || undefined,
    });
    setSaving(false);
    onCreated();
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 focus:border-wo-accent transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-wo-bg-elevated border border-wo-border rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">Add Project</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-sm font-medium text-wo-text mb-1 block">Local path *</span>
            <div className="flex gap-2">
              <input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/path/to/project" className={inputClass} />
              <button type="button" onClick={handleBrowse} className="h-10 px-3 rounded-lg border border-wo-border bg-wo-bg text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors shrink-0">
                <FolderOpen size={16} />
              </button>
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-wo-text mb-1 block">Name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Project" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-wo-text mb-1 block">Repository URL</span>
            <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="git@github.com:org/repo.git" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-wo-text mb-1 block">Dev command</span>
            <input value={devCommand} onChange={(e) => setDevCommand(e.target.value)} placeholder="bun run dev" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-wo-text mb-1 block">IDE</span>
            <select value={ide} onChange={(e) => setIde(e.target.value as typeof ide)} className={inputClass}>
              <option value="cursor">Cursor</option>
              <option value="vscode">VS Code</option>
              <option value="xcode">Xcode</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-wo-text mb-1 block">Bootstrap command</span>
            <input value={bootstrapCommand} onChange={(e) => setBootstrapCommand(e.target.value)} placeholder="bun install" className={inputClass} />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleCreate} disabled={!isValid || saving} className="px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40">
            {saving ? "Adding..." : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
