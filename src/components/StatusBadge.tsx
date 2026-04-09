import type { DetectionStatus } from "../lib/types";

const config: Record<DetectionStatus, { label: string; className: string }> = {
  checking: { label: "Checking", className: "bg-wo-accent-soft text-wo-accent" },
  installed: { label: "Installed", className: "bg-[rgba(21,128,61,0.1)] text-wo-success" },
  missing: { label: "Missing", className: "bg-[rgba(220,38,38,0.1)] text-wo-danger" },
  error: { label: "Error", className: "bg-[rgba(220,38,38,0.1)] text-wo-danger" },
};

export function StatusBadge({ status }: { status: DetectionStatus }) {
  const { label, className } = config[status];
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
