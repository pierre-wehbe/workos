import { ClipboardList } from "lucide-react";
import type { PRCacheEntry, RubricThresholds } from "../../../lib/pr-types";

interface RubricTabProps {
  cache: PRCacheEntry | null;
  rubricThresholds: RubricThresholds;
}

export function RubricTab({ cache, rubricThresholds }: RubricTabProps) {
  const result = cache?.rubricResult;

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

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Overall score */}
      <div className="p-6 rounded-lg border border-wo-border bg-wo-bg-elevated">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl font-bold">{result.overallScore}</span>
          <div className="flex-1 space-y-1">
            <div className="h-3 rounded-full bg-wo-bg-subtle overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  meetsAutoApprove ? "bg-wo-success" : result.overallScore >= 70 ? "bg-wo-accent" : "bg-wo-warning"
                }`}
                style={{ width: `${Math.min(100, result.overallScore)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-wo-text-tertiary">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        </div>

        {/* Auto-approve threshold indicator */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium ${
          meetsAutoApprove
            ? "bg-[rgba(21,128,61,0.1)] text-wo-success"
            : "bg-wo-bg-subtle text-wo-text-tertiary"
        }`}>
          <span className={`w-2 h-2 rounded-full ${meetsAutoApprove ? "bg-wo-success" : "bg-wo-text-tertiary"}`} />
          {meetsAutoApprove
            ? `Meets auto-approve threshold (${rubricThresholds.autoApproveScore})`
            : `Below auto-approve threshold (${rubricThresholds.autoApproveScore})`
          }
        </div>
      </div>

      {/* Per-category breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Category Breakdown</h3>
        <div className="space-y-3">
          {result.categories.map((cat) => {
            const pct = (cat.score / cat.maxScore) * 100;
            return (
              <div key={cat.name} className="p-4 rounded-lg border border-wo-border bg-wo-bg-elevated">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <span className="text-sm font-bold">
                    {cat.score}<span className="text-wo-text-tertiary font-normal">/{cat.maxScore}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-wo-bg-subtle overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 80 ? "bg-wo-success" : pct >= 50 ? "bg-wo-accent" : "bg-wo-warning"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {cat.explanation && (
                  <p className="text-xs text-wo-text-secondary leading-relaxed">{cat.explanation}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
