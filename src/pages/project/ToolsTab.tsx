import { useEffect, useState } from "react";
import { Loader2, Pin, Play, Plus, Search, Trash2 } from "lucide-react";
import type { Project } from "../../lib/types";
import { useTools } from "../../lib/use-tools";

interface ToolsTabProps {
  project: Project;
  onRunTool: (command: string, workingDir: string, toolName: string) => void;
}

export function ToolsTab({ project, onRunTool }: ToolsTabProps) {
  const { tools, discovered, discovering, discover, pin, addCustom, remove } = useTools(project.id);

  // Auto-scan on mount
  useEffect(() => {
    discover(project.localPath);
  }, [project.localPath, discover]);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCmd, setCustomCmd] = useState("");
  const [customDir, setCustomDir] = useState("");

  const pinnedTools = tools.filter((t) => t.pinned);

  const pinnedKeys = new Set(tools.map((t) => `${t.source}:${t.sourceKey}`));
  const unpinned = discovered.filter(
    (d) => d.command && !pinnedKeys.has(`${d.source}:${d.sourceKey}`)
  );

  const handleAddCustom = async () => {
    if (!customName.trim() || !customCmd.trim()) return;
    await addCustom(customName.trim(), customCmd.trim(), customDir.trim() || undefined);
    setCustomName(""); setCustomCmd(""); setCustomDir(""); setShowCustom(false);
  };

  const inputClass = "w-full h-9 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition";

  const grouped = unpinned.reduce<Record<string, typeof unpinned>>((acc, s) => {
    const key = s.workingDir === "." ? s.source : `${s.workingDir}/${s.source}`;
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Pinned tools */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Pinned Tools</h3>
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className="flex items-center gap-1.5 text-xs font-medium text-wo-accent hover:text-wo-accent-hover transition-colors"
          >
            <Plus size={13} /> Custom
          </button>
        </div>

        {showCustom && (
          <div className="mb-3 p-3 rounded-xl border border-wo-border bg-wo-bg-subtle space-y-2">
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Tool name" className={inputClass} />
            <input value={customCmd} onChange={(e) => setCustomCmd(e.target.value)} placeholder="Command (e.g. npm run dev)" className={inputClass} />
            <input value={customDir} onChange={(e) => setCustomDir(e.target.value)} placeholder="Working dir (optional, relative)" className={inputClass} />
            <div className="flex gap-2">
              <button type="button" onClick={handleAddCustom} disabled={!customName.trim() || !customCmd.trim()} className="px-3 h-8 rounded-lg bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40">
                Add
              </button>
              <button type="button" onClick={() => setShowCustom(false)} className="px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {pinnedTools.length === 0 ? (
          <p className="text-xs text-wo-text-tertiary py-4 text-center">
            No pinned tools yet. Discover scripts or add a custom tool.
          </p>
        ) : (
          <div className="space-y-1.5">
            {pinnedTools.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-wo-border bg-wo-bg-elevated">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-medium">{tool.name}</strong>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-wo-bg-subtle text-wo-text-tertiary">{tool.source}</span>
                  </div>
                  <p className="text-xs text-wo-text-tertiary font-mono truncate">{tool.command}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRunTool(tool.command, tool.workingDir, tool.name)}
                    className="p-2 rounded-lg text-wo-success hover:bg-wo-bg-subtle transition-colors"
                    title="Run"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(tool.id)}
                    className="p-2 rounded-lg text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Discover */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Discover Scripts</h3>
          <button
            type="button"
            onClick={() => discover(project.localPath)}
            disabled={discovering}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
          >
            {discovering ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {discovering ? "Scanning..." : "Scan project"}
          </button>
        </div>

        {Object.keys(grouped).length === 0 && !discovering && discovered.length > 0 && (
          <p className="text-xs text-wo-text-tertiary py-4 text-center">All discovered scripts are already pinned.</p>
        )}

        {Object.entries(grouped).map(([source, scripts]) => (
          <div key={source} className="mb-4">
            <p className="text-xs font-medium text-wo-text-tertiary mb-2">{source}</p>
            <div className="space-y-1">
              {scripts.map((script) => (
                <div key={`${script.source}:${script.sourceKey}`} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-wo-bg-subtle">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm">{script.name}</span>
                    {script.command && (
                      <span className="text-xs text-wo-text-tertiary font-mono ml-2">{script.command}</span>
                    )}
                  </div>
                  {script.command && (
                    <button
                      type="button"
                      onClick={() => pin(script)}
                      className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors shrink-0"
                    >
                      <Pin size={12} />
                      Pin
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
