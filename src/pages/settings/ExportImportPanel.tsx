import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { ipc } from "../../lib/ipc";

interface ExportImportPanelProps {
  onRefresh: () => void;
}

export function ExportImportPanel({ onRefresh }: ExportImportPanelProps) {
  const [status, setStatus] = useState("");

  const handleExport = async () => {
    const json = await ipc.exportConfig();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workos-config-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported successfully.");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await ipc.importConfig(text);
        setStatus("Imported successfully.");
        onRefresh();
      } catch (e) {
        setStatus(`Import failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };
    input.click();
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Export / Import</h3>
      <p className="text-xs text-wo-text-secondary mb-4">
        Export your workspaces and projects as JSON to share across machines. Paths are stored relative to home directory.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={handleExport} className="flex items-center gap-2 px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors">
          <Download size={14} /> Export
        </button>
        <button type="button" onClick={handleImport} className="flex items-center gap-2 px-4 h-9 rounded-lg border border-wo-border text-sm font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors">
          <Upload size={14} /> Import
        </button>
      </div>
      {status && <p className="text-xs text-wo-text-secondary mt-3">{status}</p>}
    </div>
  );
}
