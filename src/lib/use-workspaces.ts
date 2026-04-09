import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "./types";
import { ipc } from "./ipc";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [wsList, active] = await Promise.all([ipc.getWorkspaces(), ipc.getActiveWorkspace()]);
    setWorkspaces(wsList);
    setActiveWorkspace(active);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const switchWorkspace = useCallback(async (id: string) => {
    await ipc.setActiveWorkspace(id);
    await refresh();
  }, [refresh]);

  const create = useCallback(async (data: { name: string; org: string; path: string }) => {
    const ws = await ipc.createWorkspace(data);
    await ipc.setActiveWorkspace(ws.id);
    await refresh();
    return ws;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await ipc.deleteWorkspace(id);
    await refresh();
  }, [refresh]);

  return { workspaces, activeWorkspace, loading, refresh, switchWorkspace, create, remove };
}
