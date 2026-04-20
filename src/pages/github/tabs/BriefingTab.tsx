import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronRight, Clock, FileText, Loader2, RefreshCw, Zap } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PRDetail, PRCacheEntry, RubricCategory, RubricThresholds, AgentTask, Discussion } from "../../../lib/pr-types";
import { DiffViewer } from "../../../components/DiffViewer";
import { AskAIButton } from "../../../components/AskAIButton";
import { DiscussionPanel } from "../../../components/DiscussionPanel";
import { ipc } from "../../../lib/ipc";

interface BriefingTabProps {
  prDetail: PRDetail | null;
  cache: PRCacheEntry | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  agentTasks: AgentTask[];
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; reasoningEffort?: string; changedFiles?: number; changedLines?: number }) => Promise<AgentTask>;
  onUpdateCache: (prId: string, fields: Partial<PRCacheEntry>) => Promise<void>;
}

function scoreColor(score: number, max: number) {
  const pct = score / max;
  if (pct >= 0.8) return "text-wo-success";
  if (pct >= 0.6) return "text-amber-500";
  return "text-wo-danger";
}

function scoreDelta(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function BriefingTab({
  prDetail, cache, prId, owner, repoName, number, selectedCli,
  rubricCategories, rubricThresholds, agentTasks, onStartAgent, onUpdateCache,
}: BriefingTabProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const selectableRef = useRef<HTMLDivElement>(null);

  // Load discussions for this PR
  useEffect(() => {
    ipc.getDiscussions(prId).then(setDiscussions);
  }, [prId]);

  const refreshDiscussions = () => ipc.getDiscussions(prId).then(setDiscussions);

  const handleAskAI = async (selectedText: string, question: string) => {
    const disc = await ipc.createDiscussion({ prId, selectedText });
    await ipc.addDiscussionMessage({ discussionId: disc.id, role: "user", content: question });
    await refreshDiscussions();

    // Build rich context: PR info + latest summary + the selection + the question
    const latestSummary = (cache?.analyses ?? []).at(-1)?.summary;
    const contextParts = [
      `PR: ${prId}${prDetail?.title ? ` — "${prDetail.title}"` : ""}`,
      prDetail?.author ? `Author: ${prDetail.author}` : null,
      latestSummary ? `PR Summary: ${latestSummary.slice(0, 500)}` : null,
      `\nSelected text from the PR diff:\n"${selectedText}"`,
      `\nUser's question: ${question}`,
    ].filter(Boolean).join("\n");

    const prompt = `You are helping a developer review a pull request. Answer concisely and specifically.\n\n${contextParts}`;
    const result = await ipc.runAgentPrompt(selectedCli, prompt);
    const answer = result.ok ? result.output : "Sorry, I couldn't get a response. Please try again.";
    await ipc.addDiscussionMessage({ discussionId: disc.id, role: "assistant", content: answer, cli: selectedCli });
    await refreshDiscussions();
  };

  const analyses = cache?.analyses ?? [];
  const latest = analyses[analyses.length - 1] ?? null;
  const previous = analyses.length > 1 ? analyses[analyses.length - 2] : null;
  const hasAnalysis = !!latest;
  const isStale = !!(cache?.headSha && prDetail?.headSha && latest?.headSha && latest.headSha !== prDetail.headSha);

  const myTasks = agentTasks.filter((t) => t.prId === prId && t.taskType === "summarize");
  const isAgentRunning = myTasks.some((t) => t.status === "running");

  // Agent result processing is handled globally in App.tsx
  // BriefingTab just tracks the analyzing spinner state
  useEffect(() => {
    if (isAgentRunning) setAnalyzing(true);
    else if (analyzing && myTasks.some((t) => t.status === "completed" || t.status === "failed")) {
      setAnalyzing(false);
    }
  }, [isAgentRunning]);

  useEffect(() => {
    if (autoTriggered || hasAnalysis || !prDetail || analyzing || isAgentRunning) return;
    const withinThreshold =
      prDetail.changedFiles <= rubricThresholds.autoSummarizeMaxFiles &&
      (prDetail.additions + prDetail.deletions) <= rubricThresholds.autoSummarizeMaxLines;
    if (withinThreshold) {
      setAutoTriggered(true);
      handleAnalyze();
    }
  }, [prDetail, hasAnalysis, autoTriggered, analyzing, isAgentRunning]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    const fileList = prDetail?.files?.map((f) => `  ${f.path} (+${f.additions} -${f.deletions})`).join("\n") ?? "";
    const rubricSection = rubricCategories.length > 0
      ? `\n\nScore against these rubric categories (1-10 each):\n${rubricCategories.map((c) => `- ${c.name} (weight: ${c.weight}%): ${c.description}`).join("\n")}`
      : "";
    const unresolvedComments = prDetail?.reviewThreads
      ?.filter((t) => !t.isResolved)
      .map((t) => {
        const lastComment = t.comments[t.comments.length - 1];
        return `[UNRESOLVED] ${t.path ?? "general"}${t.line ? `:${t.line}` : ""} — @${lastComment?.author}: "${lastComment?.body}"`;
      }).join("\n") ?? "";
    const commentsSection = unresolvedComments
      ? `\n\nUnresolved review comments (note if they've been addressed by the current diff or are still outstanding):\n${unresolvedComments}`
      : "";
    const prompt = `Analyze PR ${prId}: "${prDetail?.title ?? ""}"\nAuthor: ${prDetail?.author ?? "unknown"}\nFiles changed (${prDetail?.changedFiles ?? 0}): +${prDetail?.additions ?? 0} -${prDetail?.deletions ?? 0}\n${fileList}${commentsSection}\n\nProvide your response in markdown format:\n1. A **Summary** section (2-4 sentences)\n2. A **Key Changes** section (bullet list by file)\n3. A **Scoring** section with a markdown table of rubric categories${rubricSection}\n\nIMPORTANT: At the very end of your response, include this exact JSON block so it can be parsed programmatically:\n<!-- RUBRIC_JSON {"overallScore": <number 0-100>, "categories": [{"name": "<category name>", "score": <1-10>, "maxScore": 10, "explanation": "<1 sentence>"}]} -->`;
    await onStartAgent({
      prId,
      taskType: "summarize",
      cli: selectedCli,
      prompt,
      reasoningEffort: rubricThresholds.reasoningEffort,
      changedFiles: prDetail?.changedFiles,
      changedLines: prDetail ? prDetail.additions + prDetail.deletions : undefined,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs text-wo-text-tertiary">
        {latest ? (
          <>
            <span className="flex items-center gap-1">
              <Bot size={10} />
              {latest.cli} · v{analyses.length}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {new Date(latest.timestamp).toLocaleString()}
            </span>
            {isStale && (
              <span className="px-1.5 py-0.5 rounded bg-[rgba(161,98,7,0.1)] text-wo-warning text-[10px] font-semibold">
                Stale — PR has new commits
              </span>
            )}
          </>
        ) : (
          <span>No analysis yet</span>
        )}
      </div>

      {/* Latest analysis */}
      {latest ? (
        <div className="space-y-4">
          {/* Rubric score card */}
          {latest.rubricResult && (
            <div className="p-4 rounded-lg border border-wo-border bg-wo-bg-elevated">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-2xl font-bold ${scoreColor(latest.rubricResult.overallScore, 100)}`}>
                  {latest.rubricResult.overallScore}
                </span>
                <div className="flex-1 h-2 rounded-full bg-wo-bg-subtle overflow-hidden">
                  <div className="h-full rounded-full bg-wo-accent transition-all" style={{ width: `${Math.min(100, latest.rubricResult.overallScore)}%` }} />
                </div>
                <span className="text-xs text-wo-text-tertiary">/ 100</span>
                {previous?.rubricResult && (
                  <span className={`text-xs font-semibold ${latest.rubricResult.overallScore >= previous.rubricResult.overallScore ? "text-wo-success" : "text-wo-danger"}`}>
                    {scoreDelta(latest.rubricResult.overallScore, previous.rubricResult.overallScore)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {latest.rubricResult.categories.map((cat) => {
                  const prevCat = previous?.rubricResult?.categories.find((c) => c.name === cat.name);
                  const delta = scoreDelta(cat.score, prevCat?.score);
                  return (
                    <div key={cat.name} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-wo-bg-subtle text-xs" title={cat.explanation}>
                      <span className="text-wo-text-secondary">{cat.name}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={`font-semibold ${scoreColor(cat.score, cat.maxScore)}`}>{cat.score}/{cat.maxScore}</span>
                        {delta && <span className={`text-[10px] ${delta.startsWith("+") ? "text-wo-success" : "text-wo-danger"}`}>{delta}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Markdown summary */}
          <div className="prose-sm prose-wo">
            <Markdown remarkPlugins={[remarkGfm]}>{latest.summary}</Markdown>
          </div>

          {/* Re-analyze */}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 text-xs text-wo-text-tertiary hover:text-wo-text transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={analyzing ? "animate-spin" : ""} />
            Re-analyze
          </button>
        </div>
      ) : !analyzing ? (
        <div className="flex flex-col items-center py-12 text-center">
          <FileText size={32} className="text-wo-text-tertiary mb-3" />
          <p className="text-sm text-wo-text-secondary mb-4">No analysis available for this PR yet.</p>
          <button type="button" onClick={handleAnalyze} disabled={analyzing}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            <Bot size={14} /> Analyze PR
          </button>
        </div>
      ) : null}

      {analyzing && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 size={14} className="animate-spin text-wo-accent" />
          <span className="text-sm text-wo-text-secondary">Analyzing PR...</span>
        </div>
      )}

      {/* Key changes (file list) — selectable area for Ask AI */}
      <div ref={selectableRef}>
        {prDetail && prDetail.files.length > 0 && (
          <FileList files={prDetail.files} owner={owner} repoName={repoName} number={number} />
        )}
      </div>

      {/* Review history (older analyses) */}
      {analyses.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Review History</h3>
          <div className="space-y-1">
            {[...analyses].reverse().slice(1).map((entry, i) => {
              const realIdx = analyses.length - 2 - i;
              const isExpanded = expandedIdx === realIdx;
              const version = realIdx + 1;
              return (
                <div key={`${entry.headSha}-${entry.timestamp}`} className="border border-wo-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedIdx(isExpanded ? null : realIdx)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-wo-bg-subtle transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <span className="text-wo-text-tertiary">v{version}</span>
                    {entry.rubricResult && (
                      <span className={`font-semibold ${scoreColor(entry.rubricResult.overallScore, 100)}`}>
                        {entry.rubricResult.overallScore}/100
                      </span>
                    )}
                    <span className="text-wo-text-tertiary ml-auto">{entry.cli} · {new Date(entry.timestamp).toLocaleString()}</span>
                    <span className="font-mono text-wo-text-tertiary text-[10px]">{entry.headSha.slice(0, 7)}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-wo-border">
                      {entry.rubricResult && (
                        <div className="grid grid-cols-3 gap-1.5 my-2">
                          {entry.rubricResult.categories.map((cat) => (
                            <div key={cat.name} className="flex items-center justify-between px-2 py-1 rounded bg-wo-bg-subtle text-[10px]">
                              <span>{cat.name}</span>
                              <span className={`font-semibold ${scoreColor(cat.score, cat.maxScore)}`}>{cat.score}/{cat.maxScore}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="prose-xs prose-wo mt-2">
                        <Markdown remarkPlugins={[remarkGfm]}>{entry.summary}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Discussions (Q&A threads) */}
      <DiscussionPanel
        prId={prId}
        selectedCli={selectedCli}
        discussions={discussions}
        onRefresh={refreshDiscussions}
      />

      {/* Floating "Ask AI" button on text selection */}
      <AskAIButton containerRef={selectableRef} onAsk={handleAskAI} />
    </div>
  );
}

/* --- Expandable file list with lazy-loaded diffs --- */

function FileList({ files, owner, repoName, number }: {
  files: PRDetail["files"]; owner: string; repoName: string; number: number;
}) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const handleToggle = async (path: string) => {
    if (expandedFile === path) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(path);
    if (!patches[path]) {
      setLoading(path);
      const patch = await ipc.fetchFilePatch(owner, repoName, number, path);
      if (patch) setPatches((prev) => ({ ...prev, [path]: patch }));
      setLoading(null);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Files</h3>
      <div className="space-y-1">
        {files.map((f) => (
          <div key={f.path} className="rounded-lg border border-wo-border overflow-hidden">
            <button
              type="button"
              onClick={() => handleToggle(f.path)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-wo-bg-subtle/50 transition-colors text-left"
            >
              {expandedFile === f.path ? <ChevronDown size={11} className="shrink-0 text-wo-text-tertiary" /> : <ChevronRight size={11} className="shrink-0 text-wo-text-tertiary" />}
              <span className="font-mono text-wo-text-secondary truncate flex-1">{f.path}</span>
              <span className="flex items-center gap-2 shrink-0 ml-3">
                {f.additions > 0 && <span className="text-wo-success">+{f.additions}</span>}
                {f.deletions > 0 && <span className="text-wo-danger">-{f.deletions}</span>}
              </span>
            </button>
            {expandedFile === f.path && (
              <div className="border-t border-wo-border">
                {loading === f.path ? (
                  <div className="flex items-center gap-2 p-3 text-xs text-wo-text-tertiary">
                    <Loader2 size={11} className="animate-spin" /> Loading diff...
                  </div>
                ) : patches[f.path] ? (
                  <DiffViewer patch={patches[f.path]} />
                ) : (
                  <p className="p-3 text-xs text-wo-text-tertiary">No diff available for this file.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
