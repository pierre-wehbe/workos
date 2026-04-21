import { useCallback, useEffect, useState } from "react";
import type { AICli, AgentContextFile, AgentContextSnapshot } from "./types";
import { ipc } from "./ipc";

interface UseAgentContextArgs {
  cli: AICli;
  workspacePath?: string | null;
  projectPath?: string | null;
}

export function useAgentContext({ cli, workspacePath, projectPath }: UseAgentContextArgs) {
  const [snapshot, setSnapshot] = useState<AgentContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await ipc.getAgentContext({ cli, workspacePath, projectPath });
    setSnapshot(next);
    setLoading(false);
  }, [cli, workspacePath, projectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const readFile = useCallback(async (filePath: string): Promise<AgentContextFile> => {
    return ipc.readAgentContextFile(filePath);
  }, []);

  const saveFile = useCallback(async (filePath: string, content: string) => {
    setSaving(true);
    try {
      const file = await ipc.saveAgentContextFile(filePath, content);
      await refresh();
      return file;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const createDirectory = useCallback(async (dirPath: string) => {
    setSaving(true);
    try {
      const result = await ipc.createAgentContextDirectory(dirPath);
      await refresh();
      return result;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const setPluginEnabled = useCallback(async (pluginId: string, enabled: boolean) => {
    setToggling(true);
    try {
      const file = await ipc.setAgentContextPluginEnabled(pluginId, enabled);
      await refresh();
      return file;
    } finally {
      setToggling(false);
    }
  }, [refresh]);

  const deleteSkill = useCallback(async (filePath: string) => {
    setSaving(true);
    try {
      const result = await ipc.deleteAgentContextSkill(filePath);
      await refresh();
      return result;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return { snapshot, loading, saving, toggling, refresh, readFile, saveFile, createDirectory, deleteSkill, setPluginEnabled };
}
