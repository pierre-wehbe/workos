import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessEntry } from "./types";
import { ipc } from "./ipc";

export function useProcesses() {
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const cleanupRef = useRef<Array<() => void>>([]);

  const refresh = useCallback(async () => {
    const list = await ipc.listProcesses();
    setProcesses(list);
  }, []);

  useEffect(() => {
    refresh();

    const unsub1 = ipc.onProcessUpdate((entry) => {
      setProcesses((prev) => {
        const idx = prev.findIndex((p) => p.id === entry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [entry, ...prev];
      });
    });

    cleanupRef.current = [unsub1];
    return () => cleanupRef.current.forEach((fn) => fn());
  }, [refresh]);

  const start = useCallback(async (data: Parameters<typeof ipc.startProcess>[0]) => {
    return ipc.startProcess(data);
  }, []);

  const stop = useCallback(async (id: string) => {
    await ipc.stopProcess(id);
    // Process close event will fire async via onProcessUpdate,
    // but also do a manual refresh after a short delay as fallback
    setTimeout(refresh, 1000);
  }, [refresh]);

  const clear = useCallback(async (id: string) => {
    await ipc.clearProcess(id);
    setProcesses((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearAllStopped = useCallback(async () => {
    await ipc.clearAllStopped();
    setProcesses((prev) => prev.filter((p) => p.status === "running"));
  }, []);

  const getLogs = useCallback(async (id: string) => {
    return ipc.getProcessLogs(id);
  }, []);

  const runningCount = processes.filter((p) => p.status === "running").length;

  return { processes, runningCount, start, stop, clear, clearAllStopped, getLogs, refresh };
}
