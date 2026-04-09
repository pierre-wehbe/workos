/// <reference types="vite/client" />

interface ElectronAPI {
  getConfig: () => Promise<import("./lib/types").AppConfig>;
  setTheme: (mode: import("./lib/types").ThemeMode) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
