/// <reference types="vite/client" />

import type { AppConfig, Project, ThemeMode, Workspace } from "./lib/types";

interface ElectronAPI {
  // App
  getConfig: () => Promise<AppConfig>;
  openInIDE: (path: string, ide: string) => Promise<void>;
  openInFinder: (path: string) => Promise<void>;
  getDbPath: () => Promise<string>;
  revealDb: () => Promise<void>;

  // Theme
  setTheme: (mode: ThemeMode) => Promise<void>;

  // Shell
  runSync: (cmd: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
  selectDirectory: () => Promise<string | null>;
  scanRepos: (wsPath: string) => Promise<Array<{ name: string; localPath: string; repoUrl: string }>>;
  initRepo: (projectPath: string) => Promise<{ ok: boolean; error?: string }>;
  cloneRepo: (repoUrl: string, targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  isGitRepo: (dirPath: string) => Promise<boolean>;
  gitBranch: (dirPath: string) => Promise<string | null>;
  deleteDirectory: (dirPath: string) => Promise<{ ok: boolean; error?: string }>;
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
  getTools: (projectId: string) => Promise<import("./lib/types").Tool[]>;
  createTool: (data: {
    projectId: string; name: string; command: string;
    workingDir?: string; source?: string; sourceKey?: string;
  }) => Promise<import("./lib/types").Tool>;
  deleteTool: (id: string) => Promise<void>;
  updateTool: (id: string, data: Partial<import("./lib/types").Tool>) => Promise<import("./lib/types").Tool>;
  discoverScripts: (projectPath: string) => Promise<Array<{
    name: string; command: string | null; workingDir: string;
    source: string; sourceKey: string;
  }>>;

  // Processes
  startProcess: (data: {
    projectId: string; projectName: string; workspaceId: string;
    workspaceName: string; toolName: string; command: string; workingDir?: string;
  }) => Promise<import("./lib/types").ProcessEntry>;
  stopProcess: (id: string) => Promise<void>;
  listProcesses: () => Promise<import("./lib/types").ProcessEntry[]>;
  clearProcess: (id: string) => Promise<void>;
  clearAllStopped: () => Promise<void>;
  getProcessLogs: (id: string) => Promise<string>;
  getRunningCount: () => Promise<number>;
  getProcessEnv: (id: string) => Promise<Record<string, string>>;
  onProcessUpdate: (cb: (entry: import("./lib/types").ProcessEntry) => void) => () => void;
  onProcessOutput: (cb: (id: string, chunk: string) => void) => () => void;

  // Machine
  scanMachine: () => Promise<import("./lib/types").MachineInfo>;
  fixShellConfig: (file: string, line: string) => Promise<{ ok: boolean; message: string }>;
  checkBrewOutdated: () => Promise<number>;
  setPyenvGlobal: (version: string) => Promise<{ ok: boolean }>;
  checkMachineUpdates: () => Promise<{
    brewOutdatedCount: number;
    rustUpdateAvailable: boolean;
    pyenvLatestAvailable: string | null;
    ai: {
      claude: { latestVersion: string | null; authenticated: boolean | null };
      codex: { latestVersion: string | null; authenticated: boolean | null };
      gemini: { latestVersion: string | null; authenticated: boolean | null };
    };
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
