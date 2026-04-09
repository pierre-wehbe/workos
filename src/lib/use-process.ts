import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "./ipc";

interface ProcessState {
  isRunning: boolean;
  output: string;
  exitCode: number | null;
}

export function useProcess(projectId: string) {
  const [state, setState] = useState<ProcessState>({ isRunning: false, output: "", exitCode: null });
  const cleanupRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
    };
  }, []);

  const start = useCallback((command: string, workingDir?: string) => {
    const id = projectId;
    setState({ isRunning: true, output: "", exitCode: null });

    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];

    const cmd = workingDir ? `cd "${workingDir}" && ${command}` : command;

    const unsub1 = ipc.onStdout((sid, chunk) => {
      if (sid !== id) return;
      setState((s) => ({ ...s, output: s.output + chunk }));
    });
    const unsub2 = ipc.onStderr((sid, chunk) => {
      if (sid !== id) return;
      setState((s) => ({ ...s, output: s.output + chunk }));
    });
    const unsub3 = ipc.onComplete((sid, exitCode) => {
      if (sid !== id) return;
      setState((s) => ({ ...s, isRunning: false, exitCode }));
    });

    cleanupRef.current = [unsub1, unsub2, unsub3];
    ipc.runStreaming(id, cmd);
  }, [projectId]);

  const stop = useCallback(() => {
    ipc.cancelCommand(projectId);
  }, [projectId]);

  return { ...state, start, stop };
}
