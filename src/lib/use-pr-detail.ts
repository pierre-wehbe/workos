import { useCallback, useState } from "react";
import type { PRDetail, PRCacheEntry } from "./pr-types";
import { ipc } from "./ipc";

export function usePRDetail() {
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [cache, setCache] = useState<PRCacheEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (owner: string, repo: string, number: number) => {
    const prId = `${owner}/${repo}#${number}`;
    setLoading(true);

    // Load cache first
    const cached = await ipc.getPrCache(prId);
    if (cached?.prData) {
      setPrDetail(cached.prData);
      setCache(cached);
    }

    // Fetch fresh data
    const detail = await ipc.fetchPRDetail(owner, repo, number);
    if (detail) {
      setPrDetail(detail);
      await ipc.upsertPrCache(prId, {
        prData: detail,
        lastFetchedAt: new Date().toISOString(),
        prState: detail.state === "MERGED" ? "MERGED" : detail.state === "CLOSED" ? "CLOSED" : "OPEN",
        headSha: detail.headSha,
      });
      const updatedCache = await ipc.getPrCache(prId);
      setCache(updatedCache);
    }

    setLoading(false);
    return detail;
  }, []);

  const updateCache = useCallback(async (prId: string, fields: Partial<PRCacheEntry>) => {
    await ipc.upsertPrCache(prId, fields);
    const updated = await ipc.getPrCache(prId);
    setCache(updated);
  }, []);

  const isStale = !!(cache?.headSha && prDetail?.headSha && cache.headSha !== prDetail.headSha);

  return { prDetail, cache, loading, fetchDetail, updateCache, isStale };
}
