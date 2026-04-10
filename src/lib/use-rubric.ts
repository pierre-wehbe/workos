import { useCallback, useEffect, useState } from "react";
import type { RubricCategory, RubricThresholds } from "./pr-types";
import { ipc } from "./ipc";

export function useRubric() {
  const [categories, setCategories] = useState<RubricCategory[]>([]);
  const [thresholds, setThresholds] = useState<RubricThresholds>({
    autoApproveScore: 95,
    autoApproveMaxFiles: 5,
    autoApproveMaxLines: 300,
    autoSummarizeMaxFiles: 5,
    autoSummarizeMaxLines: 300,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([ipc.getRubricCategories(), ipc.getRubricThresholds()]).then(([cats, thresh]) => {
      setCategories(cats);
      setThresholds(thresh);
      setLoading(false);
    });
  }, []);

  const saveCategories = useCallback(async (cats: RubricCategory[]) => {
    const saved = await ipc.saveRubricCategories(cats);
    setCategories(saved);
  }, []);

  const saveThresholds = useCallback(async (thresh: RubricThresholds) => {
    const saved = await ipc.saveRubricThresholds(thresh);
    setThresholds(saved);
  }, []);

  return { categories, thresholds, loading, saveCategories, saveThresholds };
}
