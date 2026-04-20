import { useState } from "react";
import { Columns2, Rows3 } from "lucide-react";

interface DiffViewerProps {
  patch: string;
}

interface DiffLine {
  type: "add" | "del" | "context" | "hunk";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      lines.push({ type: "hunk", content: raw, oldLine: null, newLine: null });
    } else if (raw.startsWith("+")) {
      lines.push({ type: "add", content: raw.slice(1), oldLine: null, newLine: newLine++ });
    } else if (raw.startsWith("-")) {
      lines.push({ type: "del", content: raw.slice(1), oldLine: oldLine++, newLine: null });
    } else {
      lines.push({ type: "context", content: raw.startsWith(" ") ? raw.slice(1) : raw, oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return lines;
}

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="text-[11px] font-mono leading-[1.6] overflow-x-auto">
      {lines.map((line, i) => {
        const bg = line.type === "add" ? "bg-[rgba(21,128,61,0.08)]"
          : line.type === "del" ? "bg-[rgba(220,38,38,0.08)]"
          : line.type === "hunk" ? "bg-wo-bg-subtle" : "";
        const textColor = line.type === "add" ? "text-wo-success"
          : line.type === "del" ? "text-wo-danger"
          : line.type === "hunk" ? "text-wo-text-tertiary" : "text-wo-text-secondary";
        return (
          <div key={i} className={`flex ${bg}`}>
            <span className="w-10 shrink-0 text-right pr-2 text-wo-text-tertiary select-none opacity-50">
              {line.oldLine ?? ""}
            </span>
            <span className="w-10 shrink-0 text-right pr-2 text-wo-text-tertiary select-none opacity-50">
              {line.newLine ?? ""}
            </span>
            <span className="w-4 shrink-0 text-center select-none text-wo-text-tertiary">
              {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "@@" : " "}
            </span>
            <span className={`flex-1 whitespace-pre ${textColor}`}>{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}

function SplitView({ lines }: { lines: DiffLine[] }) {
  // Pair deletions and additions together for side-by-side
  const pairs: Array<{ left: DiffLine | null; right: DiffLine | null }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === "hunk") {
      pairs.push({ left: line, right: line });
      i++;
    } else if (line.type === "del") {
      // Collect consecutive dels, then pair with consecutive adds
      const dels: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "del") dels.push(lines[i++]);
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "add") adds.push(lines[i++]);
      const max = Math.max(dels.length, adds.length);
      for (let j = 0; j < max; j++) {
        pairs.push({ left: dels[j] ?? null, right: adds[j] ?? null });
      }
    } else if (line.type === "add") {
      pairs.push({ left: null, right: line });
      i++;
    } else {
      pairs.push({ left: line, right: line });
      i++;
    }
  }

  const renderSide = (line: DiffLine | null, side: "left" | "right") => {
    if (!line) return <div className="flex-1 bg-wo-bg-subtle/50" />;
    if (line.type === "hunk") {
      return (
        <div className="flex-1 bg-wo-bg-subtle text-wo-text-tertiary px-2 truncate">
          {side === "left" ? line.content : ""}
        </div>
      );
    }
    const bg = line.type === "del" ? "bg-[rgba(220,38,38,0.08)]"
      : line.type === "add" ? "bg-[rgba(21,128,61,0.08)]" : "";
    const textColor = line.type === "del" ? "text-wo-danger"
      : line.type === "add" ? "text-wo-success" : "text-wo-text-secondary";
    const lineNum = side === "left" ? line.oldLine : line.newLine;
    return (
      <div className={`flex-1 flex ${bg}`}>
        <span className="w-10 shrink-0 text-right pr-2 text-wo-text-tertiary select-none opacity-50">{lineNum ?? ""}</span>
        <span className={`flex-1 whitespace-pre ${textColor}`}>{line.content}</span>
      </div>
    );
  };

  return (
    <div className="text-[11px] font-mono leading-[1.6] overflow-x-auto">
      {pairs.map((pair, i) => (
        <div key={i} className="flex gap-px">
          {renderSide(pair.left, "left")}
          {renderSide(pair.right, "right")}
        </div>
      ))}
    </div>
  );
}

export function DiffViewer({ patch }: DiffViewerProps) {
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const lines = parsePatch(patch);

  return (
    <div className="border border-wo-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-end px-2 py-1 bg-wo-bg-subtle border-b border-wo-border">
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => setMode("unified")}
            className={`p-1 rounded transition-colors ${mode === "unified" ? "text-wo-accent bg-wo-accent/10" : "text-wo-text-tertiary hover:text-wo-text"}`}
            title="Unified"
          >
            <Rows3 size={12} />
          </button>
          <button
            type="button"
            onClick={() => setMode("split")}
            className={`p-1 rounded transition-colors ${mode === "split" ? "text-wo-accent bg-wo-accent/10" : "text-wo-text-tertiary hover:text-wo-text"}`}
            title="Split"
          >
            <Columns2 size={12} />
          </button>
        </div>
      </div>
      {mode === "unified" ? <UnifiedView lines={lines} /> : <SplitView lines={lines} />}
    </div>
  );
}
