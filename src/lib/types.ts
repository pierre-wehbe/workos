export interface Workspace {
  id: string;
  name: string;
  org: string;
  path: string;
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
