import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentTask } from "./pr-types";
import { ipc } from "./ipc";

export function useAgents() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const cleanupRef = useRef<Array<() => void>>([]);

  const refresh = useCallback(async () => {
    const list = await ipc.listAgents();
    setTasks(list);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = ipc.onAgentUpdate((task) => {
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = task;
          return next;
        }
        return [task, ...prev];
      });
    });
    cleanupRef.current = [unsub];
    return () => cleanupRef.current.forEach((fn) => fn());
  }, [refresh]);

  const start = useCallback(async (data: Parameters<typeof ipc.startAgent>[0]) => {
    return ipc.startAgent(data);
  }, []);

  const cancel = useCallback(async (id: string) => {
    await ipc.cancelAgent(id);
    setTimeout(refresh, 1000);
  }, [refresh]);

  const clear = useCallback(async (id: string) => {
    await ipc.clearAgent(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllCompleted = useCallback(async () => {
    await ipc.clearAllCompletedAgents();
    setTasks((prev) => prev.filter((t) => t.status === "running"));
  }, []);

  const getLogs = useCallback(async (id: string) => {
    return ipc.getAgentLogs(id);
  }, []);

  const runningCount = tasks.filter((t) => t.status === "running").length;

  return { tasks, runningCount, start, cancel, clear, clearAllCompleted, getLogs, refresh };
}
