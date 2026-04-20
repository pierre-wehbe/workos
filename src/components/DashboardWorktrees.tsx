import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Project } from "../lib/types";
import type { WorktreeInfo } from "../lib/pr-types";
import { ipc } from "../lib/ipc";
import { Tooltip } from "./Tooltip";

interface DashboardWorktreesProps {
  projects: Project[];
}

interface WorktreeWithProject extends WorktreeInfo {
  projectName: string;
  repoPath: string;
}

type SyncState = "loading" | string | null;

export function DashboardWorktrees({ projects }: DashboardWorktreesProps) {
  const [worktrees, setWorktrees] = useState<WorktreeWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncState>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<WorktreeWithProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const all: WorktreeWithProject[] = [];
      const projectsWithPath = projects.filter((p) => p.localPath);
      await Promise.all(
        projectsWithPath.map(async (project) => {
          try {
            const wts = await ipc.listWorktrees(project.localPath);
            for (const wt of wts) {
              if (wt.isMain) continue;
              all.push({ ...wt, projectName: project.name, repoPath: project.localPath });
            }
          } catch {
            // skip projects that fail
          }
        }),
      );
      if (!cancelled) {
        setWorktrees(all);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projects]);

  // Lazy-load sync statuses
  useEffect(() => {
    for (const wt of worktrees) {
      if (syncStatuses[wt.path] !== undefined) continue;
      setSyncStatuses((prev) => ({ ...prev, [wt.path]: "loading" }));
      ipc.checkWorktreeSyncStatus(wt.repoPath, wt.path).then((status) => {
        setSyncStatuses((prev) => ({ ...prev, [wt.path]: status }));
      });
    }
  }, [worktrees]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSync = (wt: WorktreeWithProject) => {
    setSyncStatuses((prev) => ({ ...prev, [wt.path]: "loading" }));
    ipc.checkWorktreeSyncStatus(wt.repoPath, wt.path).then((status) => {
      setSyncStatuses((prev) => ({ ...prev, [wt.path]: status }));
    });
  };

  const handleRemove = async (wt: WorktreeWithProject) => {
    setRemoving(wt.path);
    const result = await ipc.removeWorktree(wt.repoPath, wt.path);
    setRemoving(null);
    setConfirmRemove(null);
    if (result.ok) {
      setWorktrees((prev) => prev.filter((w) => w.path !== wt.path));
    }
  };

  if (loading) return null;
  if (worktrees.length === 0) return null;

  // Group by project
  const grouped = new Map<string, WorktreeWithProject[]>();
  for (const wt of worktrees) {
    const list = grouped.get(wt.projectName) ?? [];
    list.push(wt);
    grouped.set(wt.projectName, list);
  }

  return (
    <div className="mt-8">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-wo-text-secondary mb-3">
        <GitBranch size={15} />
        Active Worktrees
      </h2>
      <div className="space-y-1.5">
        {worktrees.map((wt) => {
          const branchLabel = wt.detached ? "detached HEAD" : (wt.branch ?? "unknown");
          const syncStatus = syncStatuses[wt.path];
          const isRemoving = removing === wt.path;

          return (
            <div
              key={wt.path}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-wo-border bg-wo-bg-elevated ${
                isRemoving ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[10px] font-medium text-wo-text-tertiary uppercase tracking-wider">
                  {wt.projectName}
                </span>
                <GitBranch size={12} className="text-wo-text-tertiary shrink-0" />
                <span className="text-sm font-medium truncate">{branchLabel}</span>
                <SyncBadge status={syncStatus} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip text="Check sync status">
                  <button type="button" onClick={() => refreshSync(wt)}
                    className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors">
                    <RefreshCw size={12} />
                  </button>
                </Tooltip>
                <Tooltip text="Open in IDE">
                  <button type="button" onClick={() => ipc.openInIDE(wt.path, "cursor")}
                    className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors">
                    <ExternalLink size={12} />
                  </button>
                </Tooltip>
                <Tooltip text="Open in Finder">
                  <button type="button" onClick={() => ipc.openInFinder(wt.path)}
                    className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors">
                    <FolderOpen size={12} />
                  </button>
                </Tooltip>
                <Tooltip text="Remove worktree">
                  <button type="button" onClick={() => setConfirmRemove(wt)} disabled={isRemoving}
                    className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors">
                    <Trash2 size={12} />
                  </button>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setConfirmRemove(null)}>
          <div className="w-full max-w-sm bg-wo-bg-elevated border border-wo-border rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-wo-danger mb-2">Remove worktree</h3>
            <p className="text-sm text-wo-text-secondary mb-1">
              This will remove the worktree directory and its git reference.
            </p>
            <p className="text-xs text-wo-text-tertiary font-mono mb-4 break-all">{confirmRemove.path}</p>
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

  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
