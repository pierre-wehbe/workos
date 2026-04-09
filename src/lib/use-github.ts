import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubData } from "./types";
import { ipc } from "./ipc";

const EMPTY: GitHubData = { myPRs: [], reviewRequests: [], username: null, lastFetched: null, reviewRequestCount: 0 };

export function useGitHub() {
  const [data, setData] = useState<GitHubData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Load cached data immediately
    ipc.githubCache().then((cached) => {
      if (cached.lastFetched) setData(cached);
    });

    // Subscribe to live updates from polling
    const unsub = ipc.onGithubUpdate((update) => {
      setData(update);
      setLoading(false);
    });
    cleanupRef.current = unsub;

    return () => { unsub(); };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await ipc.githubFetch();
    setData(result);
    setLoading(false);
  }, []);

  return { ...data, loading, refresh };
}
