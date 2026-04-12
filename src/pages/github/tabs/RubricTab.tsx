import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, ClipboardList, Copy, MessageSquare, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { PRCacheEntry, PRDetail, RubricThresholds, AgentTask } from "../../../lib/pr-types";

interface RubricTabProps {
  cache: PRCacheEntry | null;
  rubricThresholds: RubricThresholds;
  prId: string;
  prDetail: PRDetail | null;
  selectedCli: string;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string }) => Promise<AgentTask>;
  onPostComment: (body: string) => Promise<void>;
}

function scoreColor(score: number, max: number) {
  const pct = score / max;
  if (pct >= 0.8) return "text-wo-success";
  if (pct >= 0.6) return "text-amber-500";
  return "text-wo-danger";
}

function barColor(pct: number) {
  if (pct >= 80) return "bg-wo-success";
  if (pct >= 60) return "bg-wo-accent";
  return "bg-wo-warning";
}

export function RubricTab({ cache, rubricThresholds, prId, prDetail, selectedCli, onStartAgent, onPostComment }: RubricTabProps) {
  const analyses = cache?.analyses ?? [];
  const scoredAnalyses = analyses.filter((a) => a.rubricResult);
  const latest = scoredAnalyses[scoredAnalyses.length - 1] ?? null;
  const previous = scoredAnalyses.length > 1 ? scoredAnalyses[scoredAnalyses.length - 2] : null;
  const result = latest?.rubricResult;
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [copiedCat, setCopiedCat] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ClipboardList size={32} className="text-wo-text-tertiary mb-3" />
        <p className="text-sm text-wo-text-secondary">No rubric score available yet.</p>
        <p className="text-xs text-wo-text-tertiary mt-1">
          Run an analysis from the Briefing tab to generate a rubric score.
        </p>
      </div>
    );
  }

  const meetsAutoApprove = result.overallScore >= rubricThresholds.autoApproveScore;
  const prevScore = previous?.rubricResult?.overallScore;
  const overallDelta = prevScore !== undefined ? result.overallScore - prevScore : null;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Overall score */}
      <div className="p-6 rounded-lg border border-wo-border bg-wo-bg-elevated">
        <div className="flex items-center gap-4 mb-4">
          <div className="text-center">
            <span className={`text-4xl font-bold ${scoreColor(result.overallScore, 100)}`}>{result.overallScore}</span>
            {overallDelta !== null && overallDelta !== 0 && (
              <div className={`flex items-center justify-center gap-0.5 text-xs font-semibold mt-1 ${overallDelta > 0 ? "text-wo-success" : "text-wo-danger"}`}>
                {overallDelta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {overallDelta > 0 ? `+${overallDelta}` : overallDelta}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1">
            <div className="h-3 rounded-full bg-wo-bg-subtle overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor(result.overallScore)}`}
                style={{ width: `${Math.min(100, result.overallScore)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-wo-text-tertiary">
              <span>0</span>
              <span>Auto-approve: {rubricThresholds.autoApproveScore}</span>
              <span>100</span>
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium ${
          meetsAutoApprove ? "bg-[rgba(21,128,61,0.1)] text-wo-success" : "bg-wo-bg-subtle text-wo-text-tertiary"
        }`}>
          <span className={`w-2 h-2 rounded-full ${meetsAutoApprove ? "bg-wo-success" : "bg-wo-text-tertiary"}`} />
          {meetsAutoApprove
            ? `Meets auto-approve threshold (${rubricThresholds.autoApproveScore})`
            : `Below auto-approve threshold (${rubricThresholds.autoApproveScore})`}
        </div>
      </div>

      {/* Per-category breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Category Breakdown</h3>
        <div className="space-y-3">
          {result.categories.map((cat) => {
            const pct = (cat.score / cat.maxScore) * 100;
            const prevCat = previous?.rubricResult?.categories.find((c) => c.name === cat.name);
            const delta = prevCat ? cat.score - prevCat.score : null;
            const isExpanded = expandedSuggestion === cat.name;
            const suggestionText = `To improve **${cat.name}** from ${cat.score}/${cat.maxScore} to ${cat.maxScore}/${cat.maxScore}: ${cat.explanation}`;

            const handleCopy = async () => {
              await navigator.clipboard.writeText(suggestionText);
              setCopiedCat(cat.name);
              setTimeout(() => setCopiedCat(null), 2000);
            };

            const handlePostComment = async () => {
              await onPostComment(suggestionText);
            };

            const handleFixWithAgent = () => {
              const prompt = `For PR ${prId}: "${prDetail?.title ?? ""}"

The rubric category "${cat.name}" scored ${cat.score}/${cat.maxScore}.

Current assessment: ${cat.explanation}

Please analyze the PR code and suggest specific, actionable changes to improve the "${cat.name}" score to ${cat.maxScore}/${cat.maxScore}. Focus on concrete code changes, not general advice.`;
              onStartAgent({ prId, taskType: "implement_fix", cli: selectedCli, prompt });
            };

            return (
              <div key={cat.name} className="p-4 rounded-lg border border-wo-border bg-wo-bg-elevated">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${scoreColor(cat.score, cat.maxScore)}`}>
                      {cat.score}<span className="text-wo-text-tertiary font-normal">/{cat.maxScore}</span>
                    </span>
                    {delta !== null && delta !== 0 && (
                      <span className={`text-[10px] font-semibold ${delta > 0 ? "text-wo-success" : "text-wo-danger"}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-wo-bg-subtle overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                </div>
                {cat.explanation && (
                  <p className="text-xs text-wo-text-secondary leading-relaxed">{cat.explanation}</p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedSuggestion(isExpanded ? null : cat.name)}
                    className="flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium text-wo-text-tertiary hover:text-wo-text-secondary bg-wo-bg-subtle hover:bg-wo-bg transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    Suggest improvements
                  </button>
                  {cat.score < 8 && (
                    <button
                      type="button"
                      onClick={handleFixWithAgent}
                      className="flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium text-wo-text-tertiary hover:text-wo-accent bg-wo-bg-subtle hover:bg-wo-bg transition-colors"
                    >
                      <Bot size={10} />
                      Fix with Agent
                    </button>
                  )}
                </div>

                {/* Expanded suggestion */}
                {isExpanded && (
                  <div className="mt-2 p-3 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text-secondary leading-relaxed">
                    <p>{suggestionText}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium text-wo-text-tertiary hover:text-wo-text-secondary bg-wo-bg-subtle hover:bg-wo-bg transition-colors"
                      >
                        <Copy size={10} />
                        {copiedCat === cat.name ? "Copied!" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={handlePostComment}
                        className="flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium text-wo-text-tertiary hover:text-wo-accent bg-wo-bg-subtle hover:bg-wo-bg transition-colors"
                      >
                        <MessageSquare size={10} />
                        Post as Review Comment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Score history trend */}
      {scoredAnalyses.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Score Trend</h3>
          <div className="border border-wo-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-wo-bg-subtle text-wo-text-tertiary">
                  <th className="px-3 py-2 text-left font-medium">Version</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 text-right font-medium">Delta</th>
                  <th className="px-3 py-2 text-left font-medium">SHA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wo-border">
                {scoredAnalyses.map((entry, i) => {
                  const prevEntry = i > 0 ? scoredAnalyses[i - 1] : null;
                  const d = prevEntry?.rubricResult ? entry.rubricResult!.overallScore - prevEntry.rubricResult.overallScore : null;
                  return (
                    <tr key={`${entry.headSha}-${entry.timestamp}`} className={i === scoredAnalyses.length - 1 ? "bg-wo-accent/5" : ""}>
                      <td className="px-3 py-2 font-medium">v{i + 1}{i === scoredAnalyses.length - 1 ? " (latest)" : ""}</td>
                      <td className="px-3 py-2 text-wo-text-tertiary">{new Date(entry.timestamp).toLocaleDateString()}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${scoreColor(entry.rubricResult!.overallScore, 100)}`}>
                        {entry.rubricResult!.overallScore}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {d !== null && d !== 0 ? (
                          <span className={`font-semibold ${d > 0 ? "text-wo-success" : "text-wo-danger"}`}>
                            {d > 0 ? `+${d}` : d}
                          </span>
                        ) : d === 0 ? (
                          <Minus size={10} className="inline text-wo-text-tertiary" />
                        ) : (
                          <span className="text-wo-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-wo-text-tertiary">{entry.headSha.slice(0, 7)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
