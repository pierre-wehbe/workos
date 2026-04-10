import { Bot } from "lucide-react";

interface AgentBadgeProps {
  count: number;
  onClick: () => void;
}

export function AgentBadge({ count, onClick }: AgentBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg transition-colors ${
        count > 0
          ? "bg-[rgba(245,158,11,0.12)] text-amber-500 hover:bg-[rgba(245,158,11,0.2)]"
          : "text-wo-text-tertiary hover:bg-wo-bg-subtle"
      }`}
      title={`${count} running agent${count !== 1 ? "s" : ""}`}
    >
      <Bot size={14} />
      {count > 0 && (
        <>
          <span className="text-xs font-semibold tabular-nums">{count}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        </>
      )}
    </button>
  );
}
