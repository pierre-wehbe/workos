import { useCallback, useEffect, useState } from "react";
import type { Tool } from "./types";
import { ipc } from "./ipc";

interface DiscoveredScript {
  name: string;
  command: string | null;
  workingDir: string;
  source: string;
  sourceKey: string;
}

export function useTools(projectId: string) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredScript[]>([]);
  const [discovering, setDiscovering] = useState(false);

  const refresh = useCallback(async () => {
    const list = await ipc.getTools(projectId);
    setTools(list);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const discover = useCallback(async (projectPath: string) => {
    setDiscovering(true);
    const scripts = await ipc.discoverScripts(projectPath);
    setDiscovered(scripts);
    setDiscovering(false);
  }, []);

  const pin = useCallback(async (script: DiscoveredScript) => {
    if (!script.command) return;
    await ipc.createTool({
      projectId,
      name: script.name,
      command: script.command,
      workingDir: script.workingDir,
      source: script.source,
      sourceKey: script.sourceKey,
    });
    await refresh();
  }, [projectId, refresh]);

  const addCustom = useCallback(async (name: string, command: string, workingDir?: string) => {
    await ipc.createTool({ projectId, name, command, workingDir, source: "custom" });
    await refresh();
  }, [projectId, refresh]);

  const remove = useCallback(async (id: string) => {
    await ipc.deleteTool(id);
    await refresh();
  }, [refresh]);

  return { tools, discovered, discovering, refresh, discover, pin, addCustom, remove };
}
