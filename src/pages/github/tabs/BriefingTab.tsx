import { useEffect, useState } from "react";
import { Bot, Clock, FileText, Loader2, RefreshCw, Zap } from "lucide-react";
import type { PRDetail, PRCacheEntry, RubricCategory, RubricThresholds, AgentTask } from "../../../lib/pr-types";

interface BriefingTabProps {
  prDetail: PRDetail | null;
  cache: PRCacheEntry | null;
  prId: string;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string }) => Promise<AgentTask>;
  onUpdateCache: (prId: string, fields: Partial<PRCacheEntry>) => Promise<void>;
}

export function BriefingTab({
  prDetail, cache, prId, selectedCli,
  rubricCategories, rubricThresholds, onStartAgent, onUpdateCache,
}: BriefingTabProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const hasSummary = !!cache?.summary;
  const hasRubric = !!cache?.rubricResult;
  const isStale = !!(cache?.headSha && prDetail?.headSha && cache.headSha !== prDetail.headSha);

  // Auto-trigger analysis for small PRs without cached analysis
  useEffect(() => {
    if (autoTriggered || hasSummary || !prDetail || analyzing) return;
    const withinThreshold =
      prDetail.changedFiles <= rubricThresholds.autoSummarizeMaxFiles &&
      (prDetail.additions + prDetail.deletions) <= rubricThresholds.autoSummarizeMaxLines;
    if (withinThreshold) {
      setAutoTriggered(true);
      handleAnalyze();
    }
  }, [prDetail, hasSummary, autoTriggered, analyzing]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const prompt = [
        `Analyze PR ${prId}.`,
        `Provide a concise summary of the changes, key files modified, and an overall assessment.`,
        rubricCategories.length > 0
          ? `Score against these rubric categories: ${rubricCategories.map((c) => c.name).join(", ")}.`
          : "",
      ].filter(Boolean).join(" ");
      await onStartAgent({ prId, taskType: "summarize", cli: selectedCli, prompt });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs text-wo-text-tertiary">
        {cache?.lastAnalyzedAt ? (
          <>
            <span className="flex items-center gap-1">
              {autoTriggered ? <Zap size={10} /> : <Bot size={10} />}
              {autoTriggered ? "Auto-analyzed" : "Manual analysis"}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {new Date(cache.lastAnalyzedAt).toLocaleString()}
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

      {/* Summary */}
      {hasSummary ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Summary</h3>
            <p className="text-sm text-wo-text-secondary leading-relaxed whitespace-pre-wrap">
              {cache!.summary}
            </p>
          </div>
        </div>
      ) : !analyzing ? (
        <div className="flex flex-col items-center py-12 text-center">
          <FileText size={32} className="text-wo-text-tertiary mb-3" />
          <p className="text-sm text-wo-text-secondary mb-4">
            No analysis available for this PR yet.
          </p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Bot size={14} />
            Analyze PR
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
          <h3 className="text-sm font-semibold mb-2">Key Changes</h3>
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

      {/* Inline rubric score */}
      {hasRubric && cache!.rubricResult && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Rubric Score</h3>
          <div className="p-4 rounded-lg border border-wo-border bg-wo-bg-elevated">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl font-bold">{cache!.rubricResult!.overallScore}</span>
              <div className="flex-1 h-2 rounded-full bg-wo-bg-subtle overflow-hidden">
                <div
                  className="h-full rounded-full bg-wo-accent transition-all"
                  style={{ width: `${Math.min(100, cache!.rubricResult!.overallScore)}%` }}
                />
              </div>
              <span className="text-xs text-wo-text-tertiary">/ 100</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cache!.rubricResult!.categories.map((cat) => (
                <div key={cat.name} className="flex items-center justify-between px-2 py-1 rounded bg-wo-bg-subtle text-xs">
                  <span className="text-wo-text-secondary">{cat.name}</span>
                  <span className="font-semibold">{cat.score}/{cat.maxScore}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Re-analyze button when summary exists */}
      {hasSummary && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing}
          className="flex items-center gap-1.5 text-xs text-wo-text-tertiary hover:text-wo-text transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={analyzing ? "animate-spin" : ""} />
          Re-analyze
        </button>
      )}
    </div>
  );
}
