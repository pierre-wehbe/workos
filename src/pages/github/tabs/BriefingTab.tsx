import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronRight, Clock, FileText, Loader2, RefreshCw, Zap } from "lucide-react";
import Markdown from "react-markdown";
import type { PRDetail, PRCacheEntry, AnalysisEntry, RubricCategory, RubricThresholds, AgentTask } from "../../../lib/pr-types";

interface BriefingTabProps {
  prDetail: PRDetail | null;
  cache: PRCacheEntry | null;
  prId: string;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  agentTasks: AgentTask[];
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string }) => Promise<AgentTask>;
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
  prDetail, cache, prId, selectedCli,
  rubricCategories, rubricThresholds, agentTasks, onStartAgent, onUpdateCache,
}: BriefingTabProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const processedTaskIds = useRef(new Set<string>());

  const analyses = cache?.analyses ?? [];
  const latest = analyses[analyses.length - 1] ?? null;
  const previous = analyses.length > 1 ? analyses[analyses.length - 2] : null;
  const hasAnalysis = !!latest;
  const isStale = !!(cache?.headSha && prDetail?.headSha && latest?.headSha && latest.headSha !== prDetail.headSha);

  const myTasks = agentTasks.filter((t) => t.prId === prId && t.taskType === "summarize");
  const isAgentRunning = myTasks.some((t) => t.status === "running");

  // Reactively detect completed tasks and append to analyses
  useEffect(() => {
    for (const task of myTasks) {
      if (task.status !== "completed" || !task.result) continue;
      if (processedTaskIds.current.has(task.id)) continue;

      processedTaskIds.current.add(task.id);
      setAnalyzing(false);

      let rubricResult = null;
      const rubricMatch = task.result.match(/<!-- RUBRIC_JSON\s+(\{[\s\S]*?\})\s*-->/);
      if (rubricMatch) {
        try { rubricResult = JSON.parse(rubricMatch[1]); } catch {}
      }

      const summary = task.result.replace(/<!-- RUBRIC_JSON\s+\{[\s\S]*?\}\s*-->/, "").trim();

      const newEntry: AnalysisEntry = {
        headSha: prDetail?.headSha ?? "unknown",
        timestamp: task.completedAt ?? new Date().toISOString(),
        summary,
        rubricResult,
        cli: task.cli,
      };

      const updatedAnalyses = [...(cache?.analyses ?? []), newEntry];
      onUpdateCache(prId, {
        analyses: updatedAnalyses,
        lastAnalyzedAt: newEntry.timestamp,
      });
      break;
    }
  }, [agentTasks, prId, onUpdateCache, cache?.analyses, prDetail?.headSha]);

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
    const prompt = `Analyze PR ${prId}: "${prDetail?.title ?? ""}"\nAuthor: ${prDetail?.author ?? "unknown"}\nFiles changed (${prDetail?.changedFiles ?? 0}): +${prDetail?.additions ?? 0} -${prDetail?.deletions ?? 0}\n${fileList}\n\nProvide your response in markdown format:\n1. A **Summary** section (2-4 sentences)\n2. A **Key Changes** section (bullet list by file)\n3. A **Scoring** section with a markdown table of rubric categories${rubricSection}\n\nIMPORTANT: At the very end of your response, include this exact JSON block so it can be parsed programmatically:\n<!-- RUBRIC_JSON {"overallScore": <number 0-100>, "categories": [{"name": "<category name>", "score": <1-10>, "maxScore": 10, "explanation": "<1 sentence>"}]} -->`;
    await onStartAgent({ prId, taskType: "summarize", cli: selectedCli, prompt });
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
            <Markdown>{latest.summary}</Markdown>
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

      {/* Key changes (file list) */}
      {prDetail && prDetail.files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Files</h3>
          <div className="space-y-1">
            {prDetail.files.map((f) => (
              <div key={f.path} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-wo-bg-subtle text-xs">
                <span className="font-mono text-wo-text-secondary truncate">{f.path}</span>
                <span className="flex items-center gap-2 shrink-0 ml-3">
                  {f.additions > 0 && <span className="text-wo-success">+{f.additions}</span>}
                  {f.deletions > 0 && <span className="text-wo-danger">-{f.deletions}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
                        <Markdown>{entry.summary}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
