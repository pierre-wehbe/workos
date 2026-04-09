export interface Workspace {
  id: string;
  name: string;
  org: string;
  path: string;
  githubOrgs: string[];
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  repoUrl: string | null;
  localPath: string;
  devCommand: string | null;
  ide: "cursor" | "vscode" | "xcode";
  bootstrapCommand: string | null;
  pinned: boolean;
  createdAt: string;
}

export interface AppConfig {
  setupComplete: boolean;
  activeWorkspaceId: string | null;
  appVersion: string;
}

export type DetectionStatus = "checking" | "installed" | "missing" | "error";

export interface PrerequisiteResult {
  id: string;
  name: string;
  status: DetectionStatus;
  version?: string;
  detail?: string;
}

export type ThemeMode = "light" | "dark" | "system";

export interface Tool {
  id: string;
  projectId: string;
  name: string;
  command: string;
  workingDir: string;
  source: string;
  sourceKey: string | null;
  pinned: boolean;
  createdAt: string;
}

export interface ProcessEntry {
  id: string;
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  toolName: string;
  command: string;
  pid: number;
  status: "running" | "stopped" | "errored";
  exitCode: number | null;
  port: number | null;
  startedAt: string;
  stoppedAt: string | null;
  logFile: string;
}

export interface MachineInfo {
  homebrew: {
    installed: boolean;
    version: string | null;
    path: string | null;
    shellConfigured: boolean;
    outdatedCount: number | null;
  };
  python: {
    pyenv: {
      installed: boolean;
      version: string | null;
      shellConfigured: boolean;
      installedVersions: string[];
      globalVersion: string | null;
      latestAvailable: string | null;
    };
    poetry: {
      installed: boolean;
      version: string | null;
      path: string | null;
      shellConfigured: boolean;
    };
    systemPython: string | null;
  };
  node: {
    bun: { installed: boolean; version: string | null; path: string | null; latestVersion: string | null };
    node: { installed: boolean; version: string | null };
    npm: { installed: boolean; version: string | null };
    nvm: { installed: boolean };
  };
  rust: {
    rustup: { installed: boolean; version: string | null };
    rustc: { version: string | null };
    cargo: { version: string | null };
    activeToolchain: string | null;
    installedToolchains: string[];
    installedTargets: string[];
    shellConfigured: boolean;
    updateAvailable: boolean | null;
  };
  android: {
    studio: { installed: boolean };
    sdk: { installed: boolean; path: string };
    shellConfigured: boolean;
    installedPackages: Array<{ package: string; version: string }>;
    kotlin: { version: string | null };
  };
  swift: {
    xcode: { installed: boolean; path: string | null; version: string | null };
    swift: { version: string | null };
    tools: { swiftformat: string | null; swiftlint: string | null; cocoapods: string | null };
  };
  ai: {
    claude: { installed: boolean; version: string | null; latestVersion: string | null; authenticated: boolean | null };
    codex: { installed: boolean; version: string | null; latestVersion: string | null; authenticated: boolean | null };
    gemini: { installed: boolean; version: string | null; latestVersion: string | null; authenticated: boolean | null };
  };
  shell: {
    zshrcExists: boolean;
    zprofileExists: boolean;
    issues: Array<{
      file: string;
      label: string;
      configured: boolean;
      fix: string;
    }>;
  };
}

export interface GitHubPR {
  id: string;
  repo: string;
  repoName: string;
  owner: string;
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  url: string;
  updatedAt: string;
  author: string;
  labels: string[];
}

export interface GitHubData {
  myPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  username: string | null;
  lastFetched: string | null;
  reviewRequestCount: number;
}
