import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "./types";

const STORAGE_KEY = "workos-theme";

function getSystemPreference(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode): void {
  const resolved = mode === "system" ? getSystemPreference() : mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return stored ?? "system";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    window.electronAPI?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => setThemeState(mode), []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const order: ThemeMode[] = ["light", "dark", "system"];
      return order[(order.indexOf(prev) + 1) % order.length];
    });
  }, []);

  return { theme, setTheme, toggle };
}
