/// <reference types="vite/client" />

import type { AppConfig, Project, ThemeMode, Workspace } from "./lib/types";

interface ElectronAPI {
  // App
  getConfig: () => Promise<AppConfig>;
  openInIDE: (path: string, ide: string) => Promise<void>;
  openInFinder: (path: string) => Promise<void>;

  // Theme
  setTheme: (mode: ThemeMode) => Promise<void>;

  // Shell
  runSync: (cmd: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
  selectDirectory: () => Promise<string | null>;
  scanRepos: (wsPath: string) => Promise<Array<{ name: string; localPath: string; repoUrl: string }>>;
  runStreaming: (id: string, cmd: string) => void;
  cancelCommand: (id: string) => void;
  onStdout: (cb: (id: string, chunk: string) => void) => () => void;
  onStderr: (cb: (id: string, chunk: string) => void) => () => void;
  onComplete: (cb: (id: string, exitCode: number) => void) => () => void;
  removeShellListeners: () => void;

  // Database
  getWorkspaces: () => Promise<Workspace[]>;
  createWorkspace: (data: { name: string; org: string; path: string }) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  getActiveWorkspace: () => Promise<Workspace | null>;
  setActiveWorkspace: (id: string) => Promise<void>;
  getProjects: (workspaceId: string) => Promise<Project[]>;
  createProject: (data: {
    workspaceId: string;
    name: string;
    repoUrl?: string;
    localPath: string;
    devCommand?: string;
    ide?: string;
    bootstrapCommand?: string;
  }) => Promise<Project>;
  updateProject: (id: string, data: Partial<Project>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  getProject: (id: string) => Promise<Project | null>;
  setSetupComplete: (val: boolean) => Promise<void>;
  exportConfig: () => Promise<string>;
  importConfig: (json: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
