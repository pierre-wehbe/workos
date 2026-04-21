import { useCallback, useEffect, useState } from "react";
import type { RepoCodexSetupReport } from "./types";
import { ipc } from "./ipc";

interface UseCodexSetupArgs {
  workspacePath?: string | null;
  projectPath?: string | null;
  enabled?: boolean;
}

export function useCodexSetup({ workspacePath, projectPath, enabled = true }: UseCodexSetupArgs) {
  const [report, setReport] = useState<RepoCodexSetupReport | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled || !projectPath) {
      setReport(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const next = await ipc.getCodexRepoSetup({ workspacePath, projectPath });
      setReport(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [enabled, projectPath, workspacePath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { report, loading, refresh };
}
