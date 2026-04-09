import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, Globe, Loader2, X } from "lucide-react";
import { ipc } from "../../lib/ipc";

type Mode = "existing" | "create" | "clone";

interface AddProjectDialogProps {
  workspaceId: string;
  workspacePath: string;
  onCreated: () => void;
  onClose: () => void;
}

export function AddProjectDialog({ workspaceId, workspacePath, onCreated, onClose }: AddProjectDialogProps) {
  const [mode, setMode] = useState<Mode>("existing");
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [devCommand, setDevCommand] = useState("");
  const [ide, setIde] = useState<"cursor" | "vscode" | "xcode">("cursor");
  const [bootstrapCommand, setBootstrapCommand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [wsIsRepo, setWsIsRepo] = useState(false);

  useEffect(() => {
    ipc.isGitRepo(workspacePath).then(setWsIsRepo);
  }, [workspacePath]);

  const pathMatchesWorkspace = mode === "existing" && localPath.trim() === workspacePath;

  const isValid = (() => {
    if (mode === "existing") return name.trim() && localPath.trim() && !pathMatchesWorkspace;
    if (mode === "create") return name.trim();
    if (mode === "clone") return name.trim() && repoUrl.trim();
    return false;
  })();

  const handleBrowse = async () => {
    const selected = await ipc.selectDirectory();
    if (selected) {
      setLocalPath(selected);
      if (!name.trim()) setName(selected.split("/").pop() ?? "");
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError("");

    let finalPath = localPath.trim();

    if (mode === "create") {
      finalPath = `${workspacePath}/${name.trim()}`;
      const result = await ipc.initRepo(finalPath);
      if (!result.ok) {
        setError(result.error ?? "Failed to create repo.");
        setSaving(false);
        return;
      }
    }

    if (mode === "clone") {
      finalPath = `${workspacePath}/${name.trim()}`;
      const result = await ipc.cloneRepo(repoUrl.trim(), finalPath);
      if (!result.ok) {
        setError(result.error ?? "Failed to clone repo.");
        setSaving(false);
        return;
      }
    }

    await ipc.createProject({
      workspaceId,
      name: name.trim(),
      repoUrl: mode === "clone" ? repoUrl.trim() : undefined,
      localPath: finalPath,
      devCommand: devCommand.trim() || undefined,
      ide,
      bootstrapCommand: bootstrapCommand.trim() || undefined,
    });
    setSaving(false);
    onCreated();
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 focus:border-wo-accent transition";

  const modes: Array<{ id: Mode; label: string; icon: typeof FolderOpen; disabled?: boolean; hint?: string }> = [
    { id: "existing", label: "Existing folder", icon: FolderOpen },
    { id: "create", label: "New repo", icon: GitBranch },
    { id: "clone", label: "Clone URL", icon: Globe, disabled: wsIsRepo, hint: wsIsRepo ? "Workspace is itself a repo" : undefined },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-wo-bg-elevated border border-wo-border rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">Add Project</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg bg-wo-bg-subtle">
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                disabled={m.disabled}
                onClick={() => { setMode(m.id); setError(""); }}
                title={m.hint}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  mode === m.id
                    ? "bg-wo-bg-elevated text-wo-text shadow-sm"
                    : "text-wo-text-tertiary hover:text-wo-text-secondary"
                } ${m.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Icon size={13} />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {/* Mode-specific fields */}
          {mode === "existing" && (
            <div>
              <span className="text-sm font-medium text-wo-text mb-1 block">Local path *</span>
              <div className="flex gap-2">
                <input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/path/to/project" className={inputClass} />
                <button type="button" onClick={handleBrowse} className="h-10 px-3 rounded-lg border border-wo-border bg-wo-bg text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors shrink-0">
                  <FolderOpen size={16} />
                </button>
              </div>
              {pathMatchesWorkspace && (
                <p className="text-xs text-wo-danger mt-1">Project path cannot be the same as the workspace root.</p>
              )}
            </div>
          )}

          {mode === "clone" && (
            <label className="block">
              <span className="text-sm font-medium text-wo-text mb-1 block">Repository URL *</span>
              <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="git@github.com:org/repo.git" className={inputClass} />
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-wo-text mb-1 block">
              {mode === "existing" ? "Name *" : "Folder name *"}
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "clone" ? "my-project" : "My Project"} className={inputClass} />
            {mode !== "existing" && name.trim() && (
              <p className="text-xs text-wo-text-tertiary mt-1">{workspacePath}/{name.trim()}</p>
            )}
          </label>

          {/* Common optional fields */}
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

        {error && (
          <p className="text-xs text-wo-danger mt-3">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!isValid || saving} className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? (mode === "clone" ? "Cloning..." : "Creating...") : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
