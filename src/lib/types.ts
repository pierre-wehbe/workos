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
  selectedAICli: "claude" | "codex" | "gemini";
}

export type AICli = "claude" | "codex" | "gemini";

export type AgentContextScope = "runtime" | "global" | "workspace" | "repo";
export type AgentContextLaneId = "runtime" | "global" | "workspace" | "repo" | "capability" | "permission";
export type AgentContextKind = "runtime" | "instruction" | "config" | "rules" | "skill" | "plugin" | "trust";
export type AgentContextStatus = "active" | "available" | "inactive" | "missing" | "unsupported";
export type AgentContextActivationMode = "always" | "on_demand" | "runtime";
export type AgentContextPanelView = "overview" | "behavior" | "permissions" | "capabilities";

export interface AgentContextIntent {
  cli: AICli;
  workspaceId?: string | null;
  projectId?: string | null;
  artifactPath?: string | null;
  view?: AgentContextPanelView;
}

export type SkillScope = "global" | "workspace" | "repo";

export interface SkillStudioTarget {
  scope: SkillScope;
  label: string;
  description: string;
  rootPath: string | null;
  available: boolean;
  recommended: boolean;
}

export interface SkillStudioFile {
  path: string;
  content: string;
}

export interface SkillPackage {
  cli: AICli;
  scope: SkillScope;
  rootPath: string;
  skillDir: string;
  skillFilePath: string;
  skillName: string;
  skillMd: string;
  scripts: SkillStudioFile[];
}

export interface AgentContextDiagnostic {
  level: "info" | "warning" | "error";
  message: string;
}

export interface AgentContextArtifact {
  id: string;
  name: string;
  kind: AgentContextKind;
  lane: AgentContextLaneId;
  scope: AgentContextScope;
  path: string | null;
  exists: boolean;
  editable: boolean;
  activationMode: AgentContextActivationMode;
  status: AgentContextStatus;
  supportedClis: AICli[];
  description: string;
  summary: string;
  precedence: number | null;
  recommended: boolean;
  lineCount: number | null;
  size: number | null;
  modifiedAt: string | null;
  fingerprint: string | null;
  diagnostics: AgentContextDiagnostic[];
  groupKey?: string | null;
  groupLabel?: string | null;
  pluginId?: string | null;
  previewLines?: string[] | null;
  starterTemplate?: string | null;
  pluginEnabled?: boolean;
  pluginConfigured?: boolean;
  pluginDetected?: boolean;
}

export interface AgentContextLane {
  id: AgentContextLaneId;
  label: string;
  description: string;
  items: AgentContextArtifact[];
}

export interface AgentContextSnapshot {
  cli: AICli;
  workspacePath: string | null;
  projectPath: string | null;
  artifacts: AgentContextArtifact[];
  lanes: AgentContextLane[];
  warnings: string[];
}

export interface AgentContextFile {
  path: string | null;
  exists: boolean;
  editable: boolean;
  content: string;
}

export type RepoCodexSetupStatus = "ready" | "needs_setup" | "advanced";
export type RepoCodexSetupSeverity = "required" | "recommended" | "optional";
export type RepoCodexSetupActionKind = "create_file" | "create_directory" | "enable_plugin";

export interface RepoCodexPluginRecommendation {
  pluginId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  recommended: boolean;
}

export interface RepoCodexStructureRow {
  path: string;
  ecosystem: string;
  manifest: string | null;
  hasLocalAgents: boolean;
  inheritsRootAgents: boolean;
  localSkillCount: number;
  localRuleCount: number;
  recommendation: "root" | "recommended" | "optional" | "covered";
  note: string;
}

export interface RepoCodexSetupAction {
  id: string;
  kind: RepoCodexSetupActionKind;
  severity: RepoCodexSetupSeverity;
  title: string;
  description: string;
  path: string | null;
  content: string | null;
  pluginId: string | null;
  done: boolean;
}

export interface RepoCodexSetupSummary {
  requiredActions: number;
  recommendedActions: number;
  optionalActions: number;
  localScopeCount: number;
  pluginReadyCount: number;
  pluginRecommendedCount: number;
}

export interface RepoCodexSetupReport {
  cli: "codex";
  rootPath: string;
  workspacePath: string | null;
  status: RepoCodexSetupStatus;
  readinessScore: number;
  isMonorepo: boolean;
  rootAgentsPath: string;
  rootAgentsExists: boolean;
  sharedSkillsPath: string;
  sharedSkillsExists: boolean;
  sharedRulesPath: string;
  sharedRulesExists: boolean;
  nestedCodexDirCount: number;
  structure: RepoCodexStructureRow[];
  pluginRecommendations: RepoCodexPluginRecommendation[];
  actions: RepoCodexSetupAction[];
  validations: string[];
  summary: RepoCodexSetupSummary;
}

export interface AICliStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
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
