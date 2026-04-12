import { useState } from "react";
import {
  Bot, Check, ClipboardList, ExternalLink, GitBranch,
  Loader2, MessageSquare, RefreshCw, Send, XCircle,
} from "lucide-react";
import type { PRDetail, RubricCategory, AgentTask } from "../../../lib/pr-types";
import { ipc } from "../../../lib/ipc";

interface ActionsTabProps {
  prDetail: PRDetail | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  isAuthor: boolean;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
}

function ActionButton({
  icon: Icon,
  label,
  description,
  color = "border-wo-border",
  loading = false,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  color?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-start gap-3 p-4 rounded-lg border ${color} bg-wo-bg-elevated hover:bg-wo-bg-subtle transition-colors text-left disabled:opacity-60`}
    >
      <div className="shrink-0 mt-0.5">
        {loading ? <Loader2 size={16} className="animate-spin text-wo-accent" /> : <Icon size={16} className="text-wo-text-secondary" />}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-wo-text-tertiary mt-0.5">{description}</p>
      </div>
    </button>
  );
}

export function ActionsTab({
  prDetail, prId, owner, repoName, number, isAuthor, selectedCli,
  rubricCategories, onStartAgent,
}: ActionsTabProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [reviewBody, setReviewBody] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [showApproveInput, setShowApproveInput] = useState(false);
  const [showChangesInput, setShowChangesInput] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const prUrl = `https://github.com/${owner}/${repoName}/pull/${number}`;

  const withLoading = async (key: string, fn: () => Promise<void>) => {
    setActiveAction(key);
    try { await fn(); } finally { setActiveAction(null); }
  };

  const handleApprove = async () => {
    await withLoading("approve", async () => {
      await ipc.submitReview(owner, repoName, number, "APPROVE", approveComment || undefined);
      setApproveComment("");
      setShowApproveInput(false);
    });
  };

  const handleRequestChanges = async () => {
    if (!reviewBody.trim()) return;
    await withLoading("changes", async () => {
      await ipc.submitReview(owner, repoName, number, "REQUEST_CHANGES", reviewBody);
      setReviewBody("");
      setShowChangesInput(false);
    });
  };

  const handleDraftReview = () =>
    withLoading("draft_review", async () => {
      const catText = rubricCategories.length > 0
        ? ` Evaluate against: ${rubricCategories.map((c) => c.name).join(", ")}.`
        : "";
      await onStartAgent({
        prId,
        taskType: "draft_review",
        cli: selectedCli,
        prompt: `Draft a thorough code review for ${prId}.${catText}`,
      });
    });

  const handleReanalyze = () =>
    withLoading("reanalyze", async () => {
      await onStartAgent({
        prId,
        taskType: "summarize",
        cli: selectedCli,
        prompt: `Re-analyze PR ${prId}. Provide fresh summary, file changes, and rubric score.`,
      });
    });

  const handleAddressComments = () =>
    withLoading("address", async () => {
      await onStartAgent({
        prId,
        taskType: "address_comments",
        cli: selectedCli,
        prompt: `Address all unresolved review comments on ${prId}. Implement the requested changes.`,
      });
    });

  const handleSummarizeFeedback = () =>
    withLoading("summarize_feedback", async () => {
      await onStartAgent({
        prId,
        taskType: "summarize_feedback",
        cli: selectedCli,
        prompt: `Summarize all review feedback on ${prId} into actionable items.`,
      });
    });

  const handleSelfReview = () =>
    withLoading("self_review", async () => {
      const catText = rubricCategories.length > 0
        ? ` Score against: ${rubricCategories.map((c) => c.name).join(", ")}.`
        : "";
      await onStartAgent({
        prId,
        taskType: "rubric",
        cli: selectedCli,
        prompt: `Self-review ${prId} from the author's perspective.${catText}`,
      });
    });

  const handleWorktree = () => {
    // Placeholder for worktree functionality
  };

  return (
    <div className="p-6 max-w-3xl space-y-4">
      {isAuthor ? (
        <>
          <h3 className="text-xs font-semibold text-wo-text-tertiary uppercase tracking-wider mb-2">Author Actions</h3>
          <ActionButton
            icon={Bot}
            label="Address All Comments"
            description="Spawn an AI agent to implement fixes for all unresolved review comments."
            color="border-wo-accent/30"
            loading={activeAction === "address"}
            onClick={handleAddressComments}
          />
          <ActionButton
            icon={MessageSquare}
            label="Summarize Feedback"
            description="Get an AI summary of all review feedback as actionable items."
            loading={activeAction === "summarize_feedback"}
            onClick={handleSummarizeFeedback}
          />
          <ActionButton
            icon={ClipboardList}
            label="Self-Review (Rubric)"
            description="Run an AI self-review against the configured rubric categories."
            loading={activeAction === "self_review"}
            onClick={handleSelfReview}
          />
          <ActionButton
            icon={GitBranch}
            label="Spin Up Worktree"
            description="Create a git worktree for this branch (coming soon)."
            onClick={handleWorktree}
          />
        </>
      ) : (
        <>
          <h3 className="text-xs font-semibold text-wo-text-tertiary uppercase tracking-wider mb-2">Reviewer Actions</h3>

          {/* Approve */}
          {!showApproveInput ? (
            <ActionButton
              icon={Check}
              label="Approve"
              description="Approve this pull request with an optional comment."
              color="border-[rgba(21,128,61,0.3)]"
              loading={activeAction === "approve"}
              onClick={() => setShowApproveInput(true)}
            />
          ) : (
            <div className="p-4 rounded-lg border border-[rgba(21,128,61,0.3)] bg-wo-bg-elevated space-y-3">
              <p className="text-sm font-medium">Approve with comment (optional)</p>
              <input
                type="text"
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder="LGTM!"
                className="w-full h-9 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-success/40"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={activeAction === "approve"}
                  className="flex items-center gap-1.5 px-4 h-8 rounded-lg bg-wo-success text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {activeAction === "approve" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Approve
                </button>
                <button type="button" onClick={() => setShowApproveInput(false)} className="px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Request Changes */}
          {!showChangesInput ? (
            <ActionButton
              icon={MessageSquare}
              label="Request Changes"
              description="Submit a review requesting changes with your feedback."
              color="border-[rgba(220,38,38,0.3)]"
              loading={activeAction === "changes"}
              onClick={() => setShowChangesInput(true)}
            />
          ) : (
            <div className="p-4 rounded-lg border border-[rgba(220,38,38,0.3)] bg-wo-bg-elevated space-y-3">
              <p className="text-sm font-medium">Request Changes</p>
              <textarea
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder="Describe the changes needed..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-danger/40 resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRequestChanges}
                  disabled={!reviewBody.trim() || activeAction === "changes"}
                  className="flex items-center gap-1.5 px-4 h-8 rounded-lg bg-wo-danger text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {activeAction === "changes" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Submit
                </button>
                <button type="button" onClick={() => setShowChangesInput(false)} className="px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ActionButton
            icon={Bot}
            label="Draft Full Review (AI)"
            description="Have an AI agent draft a comprehensive code review."
            color="border-wo-accent/30"
            loading={activeAction === "draft_review"}
            onClick={handleDraftReview}
          />
        </>
      )}

      {/* Common actions */}
      <div className="pt-2 border-t border-wo-border space-y-4">
        <ActionButton
          icon={RefreshCw}
          label="Re-analyze"
          description="Run a fresh AI analysis of this PR."
          loading={activeAction === "reanalyze"}
          onClick={handleReanalyze}
        />
        <ActionButton
          icon={ExternalLink}
          label="Open on GitHub"
          description={prUrl}
          onClick={() => window.open(prUrl, "_blank")}
        />
      </div>

      {/* Danger zone */}
      <div className="pt-2 border-t border-wo-border space-y-4">
        {!showCloseConfirm ? (
          <ActionButton
            icon={XCircle}
            label="Close PR"
            description="Close this pull request without merging."
            color="border-[rgba(220,38,38,0.2)]"
            loading={activeAction === "close"}
            onClick={() => setShowCloseConfirm(true)}
          />
        ) : (
          <div className="p-4 rounded-lg border border-wo-danger/30 bg-wo-bg-elevated space-y-3">
            <p className="text-sm font-medium text-wo-danger">Close this pull request?</p>
            <p className="text-xs text-wo-text-secondary">
              This will close <span className="font-mono font-semibold">{owner}/{repoName}#{number}</span> without merging. You can reopen it later from GitHub.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setActiveAction("close");
                  await ipc.closePR(owner, repoName, number);
                  setActiveAction(null);
                  setShowCloseConfirm(false);
                }}
                disabled={activeAction === "close"}
                className="flex items-center gap-1.5 px-4 h-8 rounded-lg bg-wo-danger text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {activeAction === "close" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Close PR
              </button>
              <button type="button" onClick={() => setShowCloseConfirm(false)} className="px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
