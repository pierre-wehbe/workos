import { useEffect, useState } from "react";
import { Database, ExternalLink, Trash2 } from "lucide-react";
import { ipc } from "../../lib/ipc";

export function DataControlPanel() {
  const [dbPath, setDbPath] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    ipc.getDbPath().then(setDbPath);
  }, []);

  const handleReset = async () => {
    if (resetConfirm !== "RESET") return;
    await ipc.deleteDirectory(dbPath);
    // The app will be in a broken state — user needs to restart
    window.location.reload();
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">Data Control</h3>

      {/* Database location */}
      <div className="p-4 rounded-xl border border-wo-border bg-wo-bg-elevated mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Database size={14} className="text-wo-text-tertiary" />
          <span className="text-sm font-medium">SQLite Database</span>
        </div>
        <p className="text-xs text-wo-text-tertiary font-mono break-all mb-3">{dbPath}</p>
        <button
          type="button"
          onClick={() => ipc.revealDb()}
          className="flex items-center gap-2 px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
        >
          <ExternalLink size={12} />
          Reveal in Finder
        </button>
      </div>

      {/* Reset */}
      <div className="p-4 rounded-xl border border-wo-danger/20 bg-wo-bg-elevated">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 size={14} className="text-wo-danger" />
          <span className="text-sm font-medium text-wo-danger">Reset App Data</span>
        </div>
        <p className="text-xs text-wo-text-secondary mb-3">
          Deletes the SQLite database and all app configuration. Your project files on disk are not affected. You'll need to re-run onboarding after restart.
        </p>
        {!showReset ? (
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="px-3 h-8 rounded-lg border border-wo-danger/30 text-xs font-medium text-wo-danger hover:bg-wo-danger/5 transition-colors"
          >
            Reset all data...
          </button>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs text-wo-text-secondary mb-1 block">
                Type <strong className="font-semibold">RESET</strong> to confirm
              </span>
              <input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                className="w-full h-9 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-danger/40 focus:border-wo-danger transition"
                autoFocus
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowReset(false); setResetConfirm(""); }} className="px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetConfirm !== "RESET"}
                className="px-3 h-8 rounded-lg bg-wo-danger text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Reset permanently
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
