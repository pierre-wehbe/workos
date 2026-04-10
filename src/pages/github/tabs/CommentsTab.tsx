import { useMemo, useState } from "react";
import { Bot, Check, Filter, Loader2, MessageSquare, Send, X } from "lucide-react";
import type { PRDetail, PRReviewThread, AgentTask } from "../../../lib/pr-types";
import { ipc } from "../../../lib/ipc";

interface CommentsTabProps {
  prDetail: PRDetail | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  selectedCli: string;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
}

type CommentFilter = "all" | "unresolved" | "actionable";

export function CommentsTab({
  prDetail, prId, owner, repoName, number, selectedCli, onStartAgent,
}: CommentsTabProps) {
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  const threads = prDetail?.reviewThreads ?? [];

  const filtered = useMemo(() => {
    if (filter === "unresolved") return threads.filter((t) => !t.isResolved);
    if (filter === "actionable") return threads.filter((t) => !t.isResolved && t.comments.length > 0);
    return threads;
  }, [threads, filter]);

  const unresolvedCount = threads.filter((t) => !t.isResolved).length;

  const handleQuickReply = async (threadId: string, commentId: string, body: string) => {
    setSending(threadId);
    try {
      await ipc.replyToThread(owner, repoName, number, commentId, body);
    } finally {
      setSending(null);
    }
  };

  const handleAgentImplement = async (thread: PRReviewThread) => {
    const context = thread.comments.map((c) => c.body).join("\n");
    const fileContext = thread.path ? ` in ${thread.path}${thread.line ? `:${thread.line}` : ""}` : "";
    const prompt = `Implement the requested change${fileContext}. Comment: ${context}`;
    setSending(thread.id);
    try {
      await onStartAgent({ prId, taskType: "implement_fix", cli: selectedCli, prompt });
      // Post a reply noting the agent is working on it
      const lastComment = thread.comments[thread.comments.length - 1];
      if (lastComment) {
        await ipc.replyToThread(owner, repoName, number, lastComment.id, "Working on this now (automated agent).");
      }
    } finally {
      setSending(null);
    }
  };

  const handleCustomReply = async (threadId: string, commentId: string) => {
    if (!replyText.trim()) return;
    setSending(threadId);
    try {
      await ipc.replyToThread(owner, repoName, number, commentId, replyText);
      setReplyText("");
      setReplyingTo(null);
    } finally {
      setSending(null);
    }
  };

  const initials = (name: string) =>
    name.split(/[\s-]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  if (!prDetail) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-wo-accent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter size={12} className="text-wo-text-tertiary" />
        {(["all", "unresolved", "actionable"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2.5 h-7 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-wo-accent-soft text-wo-accent"
                : "bg-wo-bg-subtle text-wo-text-tertiary hover:text-wo-text-secondary"
            }`}
          >
            {f === "all" ? "All" : f === "unresolved" ? `Unresolved (${unresolvedCount})` : "Actionable"}
          </button>
        ))}
      </div>

      {/* Threads */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <MessageSquare size={32} className="text-wo-text-tertiary mb-3" />
          <p className="text-sm text-wo-text-secondary">
            {threads.length === 0 ? "No review comments yet" : "No comments match this filter"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((thread) => {
            const lastComment = thread.comments[thread.comments.length - 1];
            const isReplying = replyingTo === thread.id;
            const isSending = sending === thread.id;

            return (
              <div key={thread.id} className="rounded-lg border border-wo-border bg-wo-bg-elevated overflow-hidden">
                {/* File context */}
                {thread.path && (
                  <div className="px-3 py-1.5 bg-wo-bg-subtle border-b border-wo-border text-xs font-mono text-wo-text-tertiary">
                    {thread.path}{thread.line ? `:${thread.line}` : ""}
                  </div>
                )}

                {/* Comments */}
                <div className="divide-y divide-wo-border">
                  {thread.comments.map((comment) => (
                    <div key={comment.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-5 h-5 rounded-full bg-wo-accent-soft text-wo-accent text-[9px] font-bold flex items-center justify-center shrink-0">
                          {initials(comment.author)}
                        </span>
                        <span className="text-xs font-medium">{comment.author}</span>
                        <span className="text-[10px] text-wo-text-tertiary">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-wo-text-secondary leading-relaxed whitespace-pre-wrap pl-7">
                        {comment.body}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Status + actions */}
                <div className="px-3 py-2 border-t border-wo-border bg-wo-bg-subtle flex items-center gap-2 flex-wrap">
                  {thread.isResolved ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(21,128,61,0.1)] text-wo-success">
                      <Check size={9} /> Resolved
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(161,98,7,0.1)] text-wo-warning">
                        Unresolved
                      </span>
                      {lastComment && (
                        <>
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={() => handleQuickReply(thread.id, lastComment.id, "Agree, will fix.")}
                            className="px-2 h-6 rounded text-[10px] font-medium border border-wo-border text-wo-text-secondary hover:bg-wo-bg transition-colors disabled:opacity-50"
                          >
                            Agree, will fix
                          </button>
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={() => handleAgentImplement(thread)}
                            className="px-2 h-6 rounded text-[10px] font-medium border border-wo-accent/30 text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50"
                          >
                            <Bot size={9} className="inline mr-0.5" /> Agent: implement
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReplyingTo(isReplying ? null : thread.id); setReplyText(""); }}
                            className="px-2 h-6 rounded text-[10px] font-medium border border-wo-border text-wo-text-secondary hover:bg-wo-bg transition-colors"
                          >
                            Custom reply
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(thread.id);
                              setReplyText("Won't address this because: ");
                            }}
                            className="px-2 h-6 rounded text-[10px] font-medium border border-wo-border text-wo-text-tertiary hover:bg-wo-bg transition-colors"
                          >
                            Won't do
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {isSending && <Loader2 size={11} className="animate-spin text-wo-accent" />}
                </div>

                {/* Custom reply input */}
                {isReplying && lastComment && (
                  <div className="px-3 py-2 border-t border-wo-border flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCustomReply(thread.id, lastComment.id); }}
                      placeholder="Type your reply..."
                      className="flex-1 h-8 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleCustomReply(thread.id, lastComment.id)}
                      disabled={!replyText.trim() || isSending}
                      className="p-2 rounded-lg bg-wo-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      <Send size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReplyingTo(null); setReplyText(""); }}
                      className="p-2 rounded-lg text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
