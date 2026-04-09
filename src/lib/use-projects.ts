import { useCallback, useEffect, useState } from "react";
import type { Project } from "./types";
import { ipc } from "./ipc";

export function useProjects(workspaceId: string | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) { setProjects([]); setLoading(false); return; }
    setLoading(true);
    const list = await ipc.getProjects(workspaceId);
    setProjects(list);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (data: Parameters<typeof ipc.createProject>[0]) => {
    const project = await ipc.createProject(data);
    await refresh();
    return project;
  }, [refresh]);

  const update = useCallback(async (id: string, data: Parameters<typeof ipc.updateProject>[1]) => {
    const project = await ipc.updateProject(id, data);
    await refresh();
    return project;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await ipc.deleteProject(id);
    await refresh();
  }, [refresh]);

  return { projects, loading, refresh, create, update, remove };
}
