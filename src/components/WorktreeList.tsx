import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { WorktreeInfo } from "../lib/pr-types";
import { ipc } from "../lib/ipc";

interface WorktreeListProps {
  repoPath: string;
  compact?: boolean;
  projectName?: string;
}

type SyncState = "loading" | string | null;

export function WorktreeList({ repoPath, compact, projectName }: WorktreeListProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncState>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const loadWorktrees = useCallback(async () => {
    setLoading(true);
    try {
      const wts = await ipc.listWorktrees(repoPath);
      setWorktrees(wts.filter((w) => !w.isMain));
    } catch {
      setWorktrees([]);
    }
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Lazy-load sync statuses on mount
  useEffect(() => {
    for (const wt of worktrees) {
      if (syncStatuses[wt.path] !== undefined) continue;
      setSyncStatuses((prev) => ({ ...prev, [wt.path]: "loading" }));
      ipc.checkWorktreeSyncStatus(repoPath, wt.path).then((status) => {
        setSyncStatuses((prev) => ({ ...prev, [wt.path]: status }));
      });
    }
  }, [worktrees, repoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSync = (worktreePath: string) => {
    setSyncStatuses((prev) => ({ ...prev, [worktreePath]: "loading" }));
    ipc.checkWorktreeSyncStatus(repoPath, worktreePath).then((status) => {
      setSyncStatuses((prev) => ({ ...prev, [worktreePath]: status }));
    });
  };

  const handleCreate = async () => {
    if (!newBranch.trim()) return;
    setCreating(true);
    setCreateError(null);
    const result = await ipc.createWorktreeForBranch(repoPath, newBranch.trim());
    setCreating(false);
    if (result.ok) {
      setNewBranch("");
      setShowCreate(false);
      await loadWorktrees();
    } else {
      setCreateError(result.error ?? "Failed to create worktree");
    }
  };

  const handleRemove = async (worktreePath: string) => {
    setRemoving(worktreePath);
    const result = await ipc.removeWorktree(repoPath, worktreePath);
    setRemoving(null);
    setConfirmRemove(null);
    if (result.ok) {
      await loadWorktrees();
    }
  };

  const handlePrune = async () => {
    await ipc.pruneWorktrees(repoPath);
    await loadWorktrees();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-wo-text-tertiary text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        Loading worktrees...
      </div>
    );
  }

  return (
    <div className={compact ? "" : "p-6"}>
      {projectName && compact && (
        <p className="text-xs font-medium text-wo-text-tertiary uppercase tracking-wider mb-2">
          {projectName}
        </p>
      )}

      {worktrees.length === 0 && !showCreate ? (
        <div className={compact ? "text-sm text-wo-text-tertiary" : "flex flex-col items-center justify-center py-12 text-center"}>
          {!compact && <GitBranch size={32} className="text-wo-text-tertiary mb-3" />}
          <p className={compact ? "" : "text-sm text-wo-text-tertiary mb-4"}>
            No worktrees. Create one to work on a branch without switching your checkout.
          </p>
          {!compact && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors"
            >
              <Plus size={14} />
              Create Worktree
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {worktrees.map((wt) => (
              <WorktreeRow
                key={wt.path}
                worktree={wt}
                syncStatus={syncStatuses[wt.path]}
                compact={compact}
                onRefreshSync={() => refreshSync(wt.path)}
                onRemove={() => setConfirmRemove(wt.path)}
                isRemoving={removing === wt.path}
              />
            ))}
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="mt-3 p-3 rounded-lg border border-wo-border bg-wo-bg-elevated">
              <div className="flex items-center gap-2">
                <input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Branch name (e.g. feature/my-branch)"
                  className="flex-1 h-9 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition"
                  autoFocus
                  disabled={creating}
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newBranch.trim()}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); setNewBranch(""); }}
                  className="p-2 rounded-lg text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {createError && (
                <p className="mt-2 text-xs text-wo-danger flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {createError}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {!compact && (
            <div className="flex items-center gap-2 mt-4">
              {!showCreate && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors"
                >
                  <Plus size={14} />
                  Create Worktree
                </button>
              )}
              <button
                type="button"
                onClick={handlePrune}
                title="Remove stale worktree references (e.g. deleted directories)"
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors"
              >
                <RefreshCw size={12} />
                Prune
              </button>
            </div>
          )}
        </>
      )}

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setConfirmRemove(null)}>
          <div className="w-full max-w-sm bg-wo-bg-elevated border border-wo-border rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-wo-danger mb-2">Remove worktree</h3>
            <p className="text-sm text-wo-text-secondary mb-1">
              This will remove the worktree directory and its git reference.
            </p>
            <p className="text-xs text-wo-text-tertiary font-mono mb-4 break-all">{confirmRemove}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemove(confirmRemove)}
                disabled={removing !== null}
                className="px-4 h-9 rounded-lg bg-wo-danger text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncBadge({ status }: { status: SyncState }) {
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-wo-text-tertiary">
        <Loader2 size={10} className="animate-spin" />
      </span>
    );
  }

  if (!status || status === "no-remote") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[11px] text-wo-text-tertiary">
        No remote
      </span>
    );
  }

  if (status === "up-to-date") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check size={10} />
        Up to date
      </span>
    );
  }

  if (status === "diverged") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-[11px] text-red-600 dark:text-red-400">
        <AlertTriangle size={10} />
        Diverged
      </span>
    );
  }

  // "behind N" or "ahead N"
  const isAhead = status.startsWith("ahead");
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
      isAhead
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    }`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  syncStatus: SyncState;
  compact?: boolean;
  onRefreshSync: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}

function WorktreeRow({ worktree, syncStatus, compact, onRefreshSync, onRemove, isRemoving }: WorktreeRowProps) {
  const branchLabel = worktree.detached ? "detached HEAD" : (worktree.branch ?? "unknown");
  const truncatedPath = worktree.path.length > 50
    ? "..." + worktree.path.slice(-47)
    : worktree.path;

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-wo-border bg-wo-bg-elevated ${
      isRemoving ? "opacity-50" : ""
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <GitBranch size={13} className="text-wo-text-tertiary shrink-0" />
          <span className="text-sm font-medium truncate">{branchLabel}</span>
          <SyncBadge status={syncStatus} />
        </div>
        {!compact && (
          <p className="text-xs text-wo-text-tertiary font-mono mt-0.5 truncate" title={worktree.path}>
            {truncatedPath}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onRefreshSync}
          className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
          title="Check sync status"
        >
          <RefreshCw size={12} />
        </button>
        <button
          type="button"
          onClick={() => ipc.openInIDE(worktree.path, "cursor")}
          className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
          title="Open in IDE"
        >
          <ExternalLink size={12} />
        </button>
        <button
          type="button"
          onClick={() => ipc.openInFinder(worktree.path)}
          className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
          title="Open in Finder"
        >
          <FolderOpen size={12} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
          title="Remove worktree"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
