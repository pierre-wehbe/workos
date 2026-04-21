import { FilePlus2 } from "lucide-react";
import type { AgentContextArtifact, AgentContextLane, AgentContextLaneId } from "../lib/types";

const statusClasses: Record<AgentContextArtifact["status"], string> = {
  active: "bg-[rgba(21,128,61,0.1)] text-wo-success",
  available: "bg-wo-accent-soft text-wo-accent",
  inactive: "bg-wo-bg-subtle text-wo-text-tertiary",
  missing: "bg-[rgba(217,119,6,0.12)] text-wo-warning",
  unsupported: "bg-wo-bg-subtle text-wo-text-tertiary",
};

function StatusBadge({ status }: { status: AgentContextArtifact["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClasses[status]}`}>
      {status}
    </span>
  );
}

function kindLabel(kind: AgentContextArtifact["kind"]) {
  if (kind === "config") return "Config";
  if (kind === "rules") return "Rules";
  if (kind === "skill") return "Skill";
  if (kind === "plugin") return "Plugin";
  if (kind === "trust") return "Trust";
  if (kind === "runtime") return "Runtime";
  return "Instruction";
}

function visibleItems(items: AgentContextArtifact[]) {
  return items.filter((item) => item.status !== "unsupported");
}

interface AgentContextLanesProps {
  lanes: AgentContextLane[];
  compact?: boolean;
  stacked?: boolean;
  includeLaneIds?: AgentContextLaneId[];
  selectedArtifactId?: string | null;
  onSelectArtifact?: (artifact: AgentContextArtifact) => void;
  onCreateMissing?: (artifact: AgentContextArtifact) => void;
  creatingArtifactId?: string | null;
}

export function AgentContextLanes({
  lanes,
  compact = false,
  stacked = false,
  includeLaneIds,
  selectedArtifactId = null,
  onSelectArtifact,
  onCreateMissing,
  creatingArtifactId = null,
}: AgentContextLanesProps) {
  const visibleLanes = includeLaneIds ? lanes.filter((lane) => includeLaneIds.includes(lane.id)) : lanes;
  return (
    <div className={stacked ? "space-y-3" : `grid gap-3 ${compact ? "md:grid-cols-2 xl:grid-cols-3" : "xl:grid-cols-2"}`}>
      {visibleLanes.map((lane) => {
        const items = visibleItems(lane.items);
        const unsupportedCount = lane.items.length - items.length;
        const shown = compact ? items.slice(0, 4) : items;

        return (
          <section key={lane.id} className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">{lane.label}</h4>
                <p className="mt-1 text-xs text-wo-text-tertiary">{lane.description}</p>
              </div>
              <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                {items.length}
              </span>
            </div>

            <div className="space-y-2">
              {shown.length === 0 ? (
                <div className="rounded-lg border border-dashed border-wo-border px-3 py-3 text-xs text-wo-text-tertiary">
                  No relevant artifacts for this CLI in this lane.
                </div>
              ) : (
                shown.map((artifact) => (
                  <div
                    key={artifact.id}
                    onClick={() => onSelectArtifact?.(artifact)}
                    className={`rounded-lg border px-3 py-2 ${onSelectArtifact ? "cursor-pointer transition-colors" : ""} ${
                      selectedArtifactId === artifact.id
                        ? "border-wo-accent bg-wo-accent-soft/60"
                        : "border-wo-border bg-wo-bg hover:bg-wo-bg-subtle"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{artifact.name}</p>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-wo-text-tertiary">
                            {kindLabel(artifact.kind)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-wo-text-secondary">{artifact.summary}</p>
                      </div>
                      <StatusBadge status={artifact.status} />
                    </div>
                    {artifact.status === "missing" && artifact.recommended && artifact.editable && onCreateMissing && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCreateMissing(artifact);
                          }}
                          disabled={creatingArtifactId === artifact.id}
                          className="inline-flex items-center gap-1 rounded-md border border-wo-border px-2 py-1 text-[11px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50"
                        >
                          <FilePlus2 size={11} />
                          {creatingArtifactId === artifact.id ? "Creating..." : "Create"}
                        </button>
                      </div>
                    )}
                    {artifact.diagnostics.length > 0 && (
                      <p className="mt-2 text-[11px] text-wo-warning">{artifact.diagnostics[0].message}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {compact && items.length > shown.length && (
              <p className="mt-3 text-xs text-wo-text-tertiary">
                {items.length - shown.length} more item{items.length - shown.length === 1 ? "" : "s"} in this lane.
              </p>
            )}
            {unsupportedCount > 0 && (
              <p className="mt-2 text-xs text-wo-text-tertiary">
                {unsupportedCount} artifact{unsupportedCount === 1 ? "" : "s"} target other CLIs.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function AgentContextStatusBadge({ status }: { status: AgentContextArtifact["status"] }) {
  return <StatusBadge status={status} />;
}
