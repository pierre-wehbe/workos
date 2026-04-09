import { useState } from "react";
import {
  Check, Circle, Clock, ExternalLink, Eye, Filter, GitPullRequest,
  Loader2, MessageSquare, RefreshCw, X,
} from "lucide-react";
import type { GitHubPR, GitHubData, Project, Workspace } from "../../lib/types";

interface GitHubPageProps {
  data: GitHubData;
  loading: boolean;
  onRefresh: () => void;
  projects: Project[];
  activeWorkspace: Workspace | null;
}

function ReviewBadge({ decision }: { decision: GitHubPR["reviewDecision"] }) {
  if (!decision) return <span className="px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[10px] text-wo-text-tertiary">Pending</span>;
  const config = {
    APPROVED: { icon: Check, label: "Approved", cls: "bg-[rgba(21,128,61,0.1)] text-wo-success" },
    CHANGES_REQUESTED: { icon: MessageSquare, label: "Changes", cls: "bg-[rgba(220,38,38,0.1)] text-wo-danger" },
    REVIEW_REQUIRED: { icon: Eye, label: "Review needed", cls: "bg-[rgba(161,98,7,0.1)] text-wo-warning" },
  };
  const c = config[decision];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.cls}`}>
      <Icon size={9} /> {c.label}
    </span>
  );
}

function PRRow({ pr }: { pr: GitHubPR }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between gap-3 p-3 rounded-lg border border-wo-border bg-wo-bg-elevated hover:border-wo-accent/20 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[11px] font-mono text-wo-text-tertiary">{pr.repo}#{pr.number}</span>
          {pr.isDraft && <span className="px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[10px] text-wo-text-tertiary">Draft</span>}
          <ReviewBadge decision={pr.reviewDecision} />
        </div>
        <p className="text-sm font-medium truncate">{pr.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-wo-text-tertiary">{pr.author}</span>
          <span className="text-[11px] text-wo-text-tertiary flex items-center gap-1">
            <Clock size={9} /> {new Date(pr.updatedAt).toLocaleDateString()}
          </span>
          {pr.labels.length > 0 && pr.labels.slice(0, 3).map((l) => (
            <span key={l} className="px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[10px] text-wo-text-tertiary">{l}</span>
          ))}
        </div>
      </div>
      <ExternalLink size={13} className="text-wo-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
    </a>
  );
}

function FilterChip({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-medium transition-colors ${
        active ? "bg-wo-accent-soft text-wo-accent" : "bg-wo-bg-subtle text-wo-text-tertiary hover:text-wo-text-secondary"
      }`}>
      {label}
      {count !== undefined && count > 0 && <span className="text-[10px] opacity-70">{count}</span>}
    </button>
  );
}

export function GitHubPage({ data, loading, onRefresh, projects, activeWorkspace }: GitHubPageProps) {
  const [tab, setTab] = useState<"my-prs" | "reviews">("reviews");
  const [filterScope, setFilterScope] = useState<"workspace" | "all">("workspace");
  const [showDrafts, setShowDrafts] = useState(true);
  const [filterRepo, setFilterRepo] = useState<string>("all");

  const wsOrg = activeWorkspace?.org?.toLowerCase() ?? "";

  const prs = tab === "my-prs" ? data.myPRs : data.reviewRequests;

  // Apply filters in order
  let filtered = prs;

  // Scope filter: workspace org or all
  if (filterScope === "workspace" && wsOrg) {
    filtered = filtered.filter((p) => p.owner.toLowerCase() === wsOrg || p.repo.toLowerCase().startsWith(wsOrg + "/"));
  }

  // Draft filter
  if (!showDrafts) {
    filtered = filtered.filter((p) => !p.isDraft);
  }

  // Repo filter
  if (filterRepo !== "all") {
    filtered = filtered.filter((p) => p.repo === filterRepo);
  }

  // Counts for filter chips
  const draftCount = prs.filter((p) => p.isDraft).length;
  const wsCount = wsOrg ? prs.filter((p) => p.owner.toLowerCase() === wsOrg || p.repo.toLowerCase().startsWith(wsOrg + "/")).length : 0;

  // Build unique repo list from current scope
  const scopedPRs = filterScope === "workspace" && wsOrg
    ? prs.filter((p) => p.owner.toLowerCase() === wsOrg || p.repo.toLowerCase().startsWith(wsOrg + "/"))
    : prs;
  const allRepos = [...new Set(scopedPRs.map((p) => p.repo))].sort();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-wo-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitPullRequest size={20} className="text-wo-accent" />
            <div>
              <h1 className="text-xl font-semibold">GitHub</h1>
              {data.username && <p className="text-xs text-wo-text-tertiary">@{data.username}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data.lastFetched && (
              <span className="text-[11px] text-wo-text-tertiary">
                Updated {new Date(data.lastFetched).toLocaleTimeString()}
              </span>
            )}
            <button type="button" onClick={onRefresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "Syncing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center justify-between px-6 border-b border-wo-border">
        <div className="flex gap-1">
          <button type="button" onClick={() => { setTab("reviews"); setFilterRepo("all"); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === "reviews" ? "border-wo-accent text-wo-accent" : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
            }`}>
            Review Requests
            {data.reviewRequestCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-wo-danger text-white text-[10px] font-bold">{data.reviewRequestCount}</span>
            )}
          </button>
          <button type="button" onClick={() => { setTab("my-prs"); setFilterRepo("all"); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === "my-prs" ? "border-wo-accent text-wo-accent" : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
            }`}>
            My PRs
            <span className="ml-1.5 text-wo-text-tertiary text-[11px]">{data.myPRs.length}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex items-center gap-2 px-6 py-2.5 border-b border-wo-border flex-wrap">
        <Filter size={12} className="text-wo-text-tertiary" />
        {wsOrg && (
          <>
            <FilterChip label={activeWorkspace?.name ?? wsOrg} active={filterScope === "workspace"} count={wsCount} onClick={() => setFilterScope("workspace")} />
            <FilterChip label="All orgs" active={filterScope === "all"} count={prs.length} onClick={() => setFilterScope("all")} />
            <span className="w-px h-4 bg-wo-border mx-1" />
          </>
        )}
        <FilterChip label="Drafts" active={showDrafts} count={draftCount} onClick={() => setShowDrafts(!showDrafts)} />
        {allRepos.length > 1 && (
          <>
            <span className="w-px h-4 bg-wo-border mx-1" />
            <select value={filterRepo} onChange={(e) => setFilterRepo(e.target.value)}
              className="h-7 px-2 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text focus:outline-none">
              <option value="all">All repos</option>
              {allRepos.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </>
        )}
        <span className="ml-auto text-[11px] text-wo-text-tertiary">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {loading && filtered.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-wo-accent" />
            <span className="ml-2 text-sm text-wo-text-secondary">Fetching from GitHub...</span>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitPullRequest size={32} className="text-wo-text-tertiary mb-3" />
            <p className="text-sm text-wo-text-secondary">
              {tab === "reviews" ? "No pending review requests" : "No open pull requests"}
            </p>
            {filterScope === "workspace" && wsOrg && (
              <button type="button" onClick={() => setFilterScope("all")} className="mt-2 text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
                Show all orgs
              </button>
            )}
          </div>
        )}
        {filtered.map((pr) => <PRRow key={pr.id} pr={pr} />)}
      </div>
    </div>
  );
}
