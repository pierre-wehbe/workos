import { Activity } from "lucide-react";

interface ProcessBadgeProps {
  count: number;
  onClick: () => void;
}

export function ProcessBadge({ count, onClick }: ProcessBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg transition-colors ${
        count > 0
          ? "bg-wo-accent-soft text-wo-accent hover:bg-wo-accent/15"
          : "text-wo-text-tertiary hover:bg-wo-bg-subtle"
      }`}
      title={`${count} running process${count !== 1 ? "es" : ""}`}
    >
      <Activity size={14} />
      {count > 0 && (
        <span className="text-xs font-semibold tabular-nums">{count}</span>
      )}
    </button>
  );
}
