import { useEffect, useState } from "react";
import { FolderOpen, GitPullRequest, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import type { Workspace } from "../../lib/types";
import { ipc } from "../../lib/ipc";

interface WorkspacePanelProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSwitch: (id: string) => void;
  onRefresh: () => void;
}

function GitHubOrgsEditor({ workspace, onUpdate }: { workspace: Workspace; onUpdate: () => void }) {
  const [orgs, setOrgs] = useState(workspace.githubOrgs);
  const [availableOrgs, setAvailableOrgs] = useState<string[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [addInput, setAddInput] = useState("");

  const fetchAvailable = async () => {
    setLoadingOrgs(true);
    const remote = await ipc.githubUserOrgs();
    setAvailableOrgs(remote);
    setLoadingOrgs(false);
  };

  const detectFromRepos = async () => {
    setDetecting(true);
    const repos = await ipc.scanRepos(workspace.path);
    const detected = new Set<string>();
    for (const r of repos) {
      if (r.repoUrl) {
        // Extract org from git@github.com:org/repo.git or https://github.com/org/repo.git
        const match = r.repoUrl.match(/github\.com[:/]([^/]+)\//);
        if (match) detected.add(match[1]);
      }
    }
    const newOrgs = [...new Set([...orgs, ...detected])];
    setOrgs(newOrgs);
    await ipc.updateWorkspace(workspace.id, { githubOrgs: newOrgs });
    onUpdate();
    setDetecting(false);
  };

  const addOrg = async (org: string) => {
    if (!org || orgs.includes(org)) return;
    const newOrgs = [...orgs, org];
    setOrgs(newOrgs);
    await ipc.updateWorkspace(workspace.id, { githubOrgs: newOrgs });
    onUpdate();
  };

  const removeOrg = async (org: string) => {
    const newOrgs = orgs.filter((o) => o !== org);
    setOrgs(newOrgs);
    await ipc.updateWorkspace(workspace.id, { githubOrgs: newOrgs });
    onUpdate();
  };

  // Suggestions: available orgs not yet added
  const suggestions = availableOrgs.filter((o) => !orgs.includes(o));

  return (
    <div className="mt-2 pt-2 border-t border-wo-border">
      <div className="flex items-center gap-2 mb-2">
        <GitPullRequest size={12} className="text-wo-text-tertiary" />
        <span className="text-[11px] font-medium text-wo-text-secondary">GitHub Orgs</span>
      </div>

      {/* Current orgs */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {orgs.map((org) => (
          <span key={org} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-wo-accent-soft text-wo-accent text-[11px] font-medium group">
            {org}
            <button type="button" onClick={() => removeOrg(org)} className="opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={9} />
            </button>
          </span>
        ))}
        {orgs.length === 0 && <span className="text-[11px] text-wo-text-tertiary">No orgs configured</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" onClick={detectFromRepos} disabled={detecting}
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50">
          {detecting ? <Loader2 size={9} className="animate-spin" /> : <Search size={9} />}
          Detect from repos
        </button>
        <button type="button" onClick={fetchAvailable} disabled={loadingOrgs}
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-medium text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors disabled:opacity-50">
          {loadingOrgs ? <Loader2 size={9} className="animate-spin" /> : <GitPullRequest size={9} />}
          My GitHub orgs
        </button>
      </div>

      {/* Suggestions from GitHub */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {suggestions.map((org) => (
            <button key={org} type="button" onClick={() => addOrg(org)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-wo-bg-subtle text-[11px] text-wo-text-secondary hover:bg-wo-accent-soft hover:text-wo-accent transition-colors">
              <Plus size={9} /> {org}
            </button>
          ))}
        </div>
      )}

      {/* Manual add */}
      <div className="flex gap-1.5 mt-2">
        <input value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="Add org slug..."
          className="h-6 px-2 w-28 rounded border border-wo-border bg-wo-bg text-[11px] text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-1 focus:ring-wo-accent/40"
          onKeyDown={(e) => { if (e.key === "Enter" && addInput.trim()) { addOrg(addInput.trim()); setAddInput(""); } }}
        />
      </div>
    </div>
  );
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
          <div key={ws.id} className="p-3 rounded-xl border border-wo-border bg-wo-bg-elevated">
            <div className="flex items-center justify-between">
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
            <GitHubOrgsEditor workspace={ws} onUpdate={onRefresh} />
          </div>
        ))}
      </div>
    </div>
  );
}
