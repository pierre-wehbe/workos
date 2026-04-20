import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Clock, ExternalLink, GitBranch, GitPullRequest, Loader2,
} from "lucide-react";
import type { GitHubPR, Project } from "../../lib/types";
import type { RubricCategory, RubricThresholds, AgentTask, WorktreeInfo } from "../../lib/pr-types";
import { usePRDetail } from "../../lib/use-pr-detail";
import { ipc } from "../../lib/ipc";
import { BriefingTab } from "./tabs/BriefingTab";
import { CommentsTab } from "./tabs/CommentsTab";
import { RubricTab } from "./tabs/RubricTab";
import { ActionsTab } from "./tabs/ActionsTab";

interface PRDetailPageProps {
  pr: GitHubPR;
  username: string | null;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  agentTasks: AgentTask[];
  projects: Project[];
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
  onBack: () => void;
}

type Tab = "briefing" | "comments" | "rubric" | "actions";

export function PRDetailPage({
  pr, username, selectedCli, rubricCategories, rubricThresholds,
  agentTasks, projects, onStartAgent, onBack,
}: PRDetailPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("briefing");
  const { prDetail, cache, loading, fetchDetail, updateCache } = usePRDetail();

  const prId = `${pr.owner}/${pr.repoName}#${pr.number}`;
  const isAuthor = !!(username && pr.author.toLowerCase() === username.toLowerCase());
  const commentCount = prDetail?.reviewThreads.length ?? 0;

  // Find the local project for this PR's repo (to manage worktrees)
  const matchedProject = projects.find((p) =>
    p.repoUrl?.includes(`${pr.owner}/${pr.repoName}`) || p.name === pr.repoName
  );
  const repoPath = matchedProject?.localPath ?? null;

  // Worktree state for this PR's branch
  const [worktree, setWorktree] = useState<WorktreeInfo | null>(null);
  const [worktreeLoading, setWorktreeLoading] = useState(false);

  const refreshWorktree = useCallback(async () => {
    if (!repoPath || !prDetail?.headBranch) return;
    const wts = await ipc.listWorktrees(repoPath);
    const match = wts.find((w) => w.branch === prDetail.headBranch && !w.isMain);
    setWorktree(match ?? null);
  }, [repoPath, prDetail?.headBranch]);

  useEffect(() => { refreshWorktree(); }, [refreshWorktree]);

  const handleCreateWorktree = async () => {
    if (!repoPath || !prDetail?.headBranch) return;
    setWorktreeLoading(true);
    await ipc.createWorktreeForBranch(repoPath, prDetail.headBranch);
    await refreshWorktree();
    setWorktreeLoading(false);
  };

  const handleRemoveWorktree = async () => {
    if (!repoPath || !worktree) return;
    setWorktreeLoading(true);
    await ipc.removeWorktree(repoPath, worktree.path);
    setWorktree(null);
    setWorktreeLoading(false);
  };

  const handlePostComment = useCallback(async (body: string) => {
    await ipc.postPRComment(pr.owner, pr.repoName, pr.number, body);
  }, [pr.owner, pr.repoName, pr.number]);

  useEffect(() => {
    fetchDetail(pr.owner, pr.repoName, pr.number);
  }, [pr.owner, pr.repoName, pr.number, fetchDetail]);

  const stateBadge = () => {
    if (pr.isDraft) return { label: "Draft", cls: "bg-wo-bg-subtle text-wo-text-tertiary" };
    if (pr.state === "MERGED") return { label: "Merged", cls: "bg-[rgba(109,40,217,0.1)] text-purple-500" };
    if (pr.state === "CLOSED") return { label: "Closed", cls: "bg-[rgba(220,38,38,0.1)] text-wo-danger" };
    return { label: "Open", cls: "bg-[rgba(21,128,61,0.1)] text-wo-success" };
  };

  const badge = stateBadge();
  const diffStats = prDetail
    ? `+${prDetail.additions} -${prDetail.deletions} (${prDetail.changedFiles} file${prDetail.changedFiles !== 1 ? "s" : ""})`
    : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-wo-border">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-wo-text-secondary hover:text-wo-text transition-colors mb-3"
        >
          <ArrowLeft size={14} />
          Back to {isAuthor ? "My PRs" : "Review Requests"}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <GitPullRequest size={16} className="text-wo-accent shrink-0" />
              <span className="text-sm font-mono text-wo-text-tertiary">{pr.repo}#{pr.number}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
              {diffStats && (
                <span className="px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[10px] font-mono text-wo-text-tertiary">
                  {diffStats}
                </span>
              )}
              {worktree ? (
                <span title={`Worktree active at ${worktree.path}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[rgba(109,40,217,0.1)] text-purple-500 text-[10px] font-semibold cursor-default">
                  <GitBranch size={9} /> Worktree
                </span>
              ) : repoPath && prDetail?.headBranch ? (
                <button
                  type="button"
                  onClick={handleCreateWorktree}
                  disabled={worktreeLoading}
                  title="Create an isolated git worktree for this PR's branch"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-wo-bg-subtle text-[10px] text-wo-text-tertiary hover:text-wo-text transition-colors"
                >
                  {worktreeLoading ? <Loader2 size={9} className="animate-spin" /> : <GitBranch size={9} />}
                  Worktree
                </button>
              ) : null}
              {loading && <Loader2 size={12} className="animate-spin text-wo-accent" />}
            </div>
            <h1 className="text-lg font-semibold truncate">{pr.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-wo-text-tertiary">
              <span>{pr.author}</span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Updated {new Date(pr.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors shrink-0"
          >
            <ExternalLink size={12} />
            Open on GitHub
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex gap-1 px-6 border-b border-wo-border">
        {([
          { key: "briefing" as Tab, label: "Briefing" },
          { key: "comments" as Tab, label: "Comments", count: commentCount },
          { key: "rubric" as Tab, label: "Rubric" },
          { key: "actions" as Tab, label: "Actions" },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.key
                ? "border-wo-accent text-wo-accent"
                : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "briefing" && (
          <BriefingTab
            prDetail={prDetail}
            cache={cache}
            prId={prId}
            owner={pr.owner}
            repoName={pr.repoName}
            number={pr.number}
            selectedCli={selectedCli}
            rubricCategories={rubricCategories}
            rubricThresholds={rubricThresholds}
            agentTasks={agentTasks}
            onStartAgent={onStartAgent}
            onUpdateCache={updateCache}
          />
        )}
        {activeTab === "comments" && (
          <CommentsTab
            prDetail={prDetail}
            prId={prId}
            owner={pr.owner}
            repoName={pr.repoName}
            number={pr.number}
            selectedCli={selectedCli}
            onStartAgent={onStartAgent}
          />
        )}
        {activeTab === "rubric" && (
          <RubricTab
            cache={cache}
            rubricThresholds={rubricThresholds}
            prId={prId}
            prDetail={prDetail}
            selectedCli={selectedCli}
            onStartAgent={onStartAgent}
            onPostComment={handlePostComment}
          />
        )}
        {activeTab === "actions" && (
          <ActionsTab
            prDetail={prDetail}
            prId={prId}
            owner={pr.owner}
            repoName={pr.repoName}
            number={pr.number}
            isAuthor={isAuthor}
            selectedCli={selectedCli}
            rubricCategories={rubricCategories}
            worktree={worktree}
            onStartAgent={onStartAgent}
            onCreateWorktree={handleCreateWorktree}
            onRemoveWorktree={handleRemoveWorktree}
          />
        )}
      </div>
    </div>
  );
}
