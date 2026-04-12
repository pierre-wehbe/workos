import { useEffect, useState } from "react";
import { GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { RubricCategory, RubricThresholds } from "../../lib/pr-types";
import { useRubric } from "../../lib/use-rubric";

export function RubricEditor() {
  const { categories, thresholds, loading, saveCategories, saveThresholds } = useRubric();
  const [localCats, setLocalCats] = useState<RubricCategory[]>([]);
  const [localThresh, setLocalThresh] = useState<RubricThresholds>({
    autoApproveScore: 95,
    autoApproveMaxFiles: 5,
    autoApproveMaxLines: 300,
    autoSummarizeMaxFiles: 5,
    autoSummarizeMaxLines: 300,
    reasoningEffort: "auto",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalCats(categories.map((c) => ({ ...c })));
  }, [categories]);

  useEffect(() => {
    setLocalThresh({ ...thresholds });
  }, [thresholds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-wo-accent" />
        <span className="ml-2 text-sm text-wo-text-secondary">Loading rubric...</span>
      </div>
    );
  }

  const totalWeight = localCats.reduce((sum, c) => sum + c.weight, 0);
  const weightOk = totalWeight === 100;

  function updateCat(id: string, patch: Partial<RubricCategory>) {
    setLocalCats((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCat(id: string) {
    setLocalCats((prev) => prev.filter((c) => c.id !== id));
  }

  function addCat() {
    setLocalCats((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        weight: 0,
        description: "",
        sortOrder: prev.length,
      },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    await saveCategories(localCats.map((c, i) => ({ ...c, sortOrder: i })));
    await saveThresholds(localThresh);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Review Rubric</h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 h-7 rounded-md bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-wo-text-secondary">Categories</p>
          <div className="flex items-center gap-3">
            <span
              className={`text-[11px] font-medium ${weightOk ? "text-wo-success" : "text-wo-warning"}`}
            >
              Total weight: {totalWeight}%{!weightOk && " (should be 100%)"}
            </span>
          </div>
        </div>

        {localCats.map((cat) => (
          <div
            key={cat.id}
            className="border border-wo-border rounded-xl bg-wo-bg-elevated p-4 space-y-3"
          >
            <div className="flex items-center gap-3">
              <GripVertical size={14} className="text-wo-text-tertiary cursor-grab shrink-0" />
              <input
                type="text"
                value={cat.name}
                onChange={(e) => updateCat(cat.id, { name: e.target.value })}
                placeholder="Category name"
                className="flex-1 h-7 px-2 rounded-md border border-wo-border bg-wo-bg text-xs font-medium text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  value={cat.weight}
                  onChange={(e) => updateCat(cat.id, { weight: Number(e.target.value) })}
                  min={0}
                  max={100}
                  className="w-16 h-7 px-2 rounded-md border border-wo-border bg-wo-bg text-xs font-mono text-wo-text text-right focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
                />
                <span className="text-xs text-wo-text-tertiary">%</span>
              </div>
              <button
                type="button"
                onClick={() => removeCat(cat.id)}
                className="p-1.5 rounded-md text-wo-text-tertiary hover:bg-wo-danger/10 hover:text-wo-danger transition-colors shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <textarea
              value={cat.description}
              onChange={(e) => updateCat(cat.id, { description: e.target.value })}
              placeholder="Description (tells the agent what to evaluate)"
              rows={2}
              className="w-full px-2 py-1.5 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 resize-y"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={addCat}
          className="flex items-center gap-1.5 text-xs text-wo-accent hover:text-wo-accent-hover transition-colors"
        >
          <Plus size={12} />
          Add category
        </button>
      </div>

      {/* Thresholds */}
      <div className="border border-wo-border rounded-xl bg-wo-bg-elevated p-4 space-y-4">
        <p className="text-xs font-medium text-wo-text-secondary">Thresholds</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <ThresholdInput
            label="Auto-approve score"
            value={localThresh.autoApproveScore}
            onChange={(v) => setLocalThresh((p) => ({ ...p, autoApproveScore: v }))}
          />
          <ThresholdInput
            label="Auto-approve max files"
            value={localThresh.autoApproveMaxFiles}
            onChange={(v) => setLocalThresh((p) => ({ ...p, autoApproveMaxFiles: v }))}
          />
          <ThresholdInput
            label="Auto-approve max lines"
            value={localThresh.autoApproveMaxLines}
            onChange={(v) => setLocalThresh((p) => ({ ...p, autoApproveMaxLines: v }))}
          />
          <ThresholdInput
            label="Auto-summarize max files"
            value={localThresh.autoSummarizeMaxFiles}
            onChange={(v) => setLocalThresh((p) => ({ ...p, autoSummarizeMaxFiles: v }))}
          />
          <ThresholdInput
            label="Auto-summarize max lines"
            value={localThresh.autoSummarizeMaxLines}
            onChange={(v) => setLocalThresh((p) => ({ ...p, autoSummarizeMaxLines: v }))}
          />
        </div>
      </div>

      {/* Reasoning Effort */}
      <div>
        <h3 className="text-sm font-semibold mb-1.5">Reasoning Effort</h3>
        <p className="text-xs text-wo-text-tertiary mb-3">
          Controls how deeply the AI CLI reasons about the PR. "Auto" scales with PR size.
        </p>
        <div className="flex gap-1.5">
          {(["auto", "low", "medium", "high", "xhigh"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setLocalThresh((p) => ({ ...p, reasoningEffort: level }))}
              className={`px-3 h-8 rounded-lg text-xs font-medium transition-colors ${
                localThresh.reasoningEffort === level
                  ? "bg-wo-accent text-white"
                  : "bg-wo-bg-subtle text-wo-text-secondary hover:bg-wo-bg-subtle/80"
              }`}
            >
              {level === "auto" ? "Auto" : level === "xhigh" ? "XHigh" : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
        {localThresh.reasoningEffort === "auto" && (
          <p className="text-[10px] text-wo-text-tertiary mt-2">
            Auto: Low (≤3 files, ≤100 lines) → Medium (≤8 files) → High (≤20 files) → XHigh (large PRs)
          </p>
        )}
      </div>
    </div>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-wo-text-secondary">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={0}
        className="w-20 h-7 px-2 rounded-md border border-wo-border bg-wo-bg text-xs font-mono text-wo-text text-right focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
      />
    </div>
  );
}
