import { useEffect, useState } from "react";
import { Copy, Check, Search, X } from "lucide-react";
import { ipc } from "../lib/ipc";

interface EnvModalProps {
  processId: string;
  onClose: () => void;
}

export function EnvModal({ processId, onClose }: EnvModalProps) {
  const [env, setEnv] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipc.getProcessEnv(processId).then((e) => { setEnv(e); setLoading(false); });
  }, [processId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(`${key}=${value}`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const entries = Object.entries(env)
    .filter(([k, v]) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return k.toLowerCase().includes(q) || v.toLowerCase().includes(q);
    })
    .sort(([a], [b]) => a.localeCompare(b));

  // Group by common prefixes
  const pathEntry = entries.find(([k]) => k === "PATH");
  const others = entries.filter(([k]) => k !== "PATH");

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-wo-bg-elevated border border-wo-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-wo-border">
          <h3 className="text-sm font-semibold">Environment Variables</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-wo-text-tertiary">{Object.keys(env).length} vars</span>
            <button type="button" onClick={onClose} className="p-1 rounded-md text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 p-3 border-b border-wo-border">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-wo-text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter variables..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-xs text-wo-text-tertiary py-8 text-center">Loading...</p>
          ) : (
            <>
              {/* PATH gets special treatment */}
              {pathEntry && (!search || "path".includes(search.toLowerCase())) && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-wo-accent">PATH</span>
                    <button
                      type="button"
                      onClick={() => handleCopy("PATH", pathEntry[1])}
                      className="p-1 rounded text-wo-text-tertiary hover:text-wo-text transition-colors"
                    >
                      {copiedKey === "PATH" ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {pathEntry[1].split(":").map((p, i) => (
                      <div key={i} className="text-[11px] font-mono text-wo-text-secondary px-2 py-1 rounded bg-wo-bg-subtle truncate">
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other variables */}
              <div className="space-y-1">
                {others.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 px-2.5 py-2 rounded-lg hover:bg-wo-bg-subtle transition-colors group"
                  >
                    <span className="text-xs font-medium text-wo-accent font-mono shrink-0 pt-0.5 min-w-[140px]">
                      {key}
                    </span>
                    <span className="text-xs text-wo-text-secondary font-mono break-all flex-1">
                      {value || <span className="text-wo-text-tertiary italic">(empty)</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(key, value)}
                      className="p-1 rounded text-wo-text-tertiary hover:text-wo-text opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      {copiedKey === key ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                ))}
              </div>

              {entries.length === 0 && (
                <p className="text-xs text-wo-text-tertiary py-8 text-center">No matching variables.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
