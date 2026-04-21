/// <reference types="vite/client" />

import type {
  AgentContextFile,
  AgentContextSnapshot,
  AppConfig,
  Project,
  RepoCodexSetupReport,
  SkillPackage,
  SkillScope,
  SkillStudioTarget,
  ThemeMode,
  Workspace,
} from "./lib/types";

interface ElectronAPI {
  // App
  getConfig: () => Promise<AppConfig>;
  openInIDE: (path: string, ide: string) => Promise<void>;
  openInFinder: (path: string) => Promise<void>;
  getDbPath: () => Promise<string>;
  setAICli: (cli: import("./lib/types").AICli) => Promise<void>;
  getAIStatus: (cli: import("./lib/types").AICli) => Promise<import("./lib/types").AICliStatus>;
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
      claude: { latestVersion: string | null };
      codex: { latestVersion: string | null };
      gemini: { latestVersion: string | null };
    };
  }>;

  // GitHub
  githubFetch: () => Promise<import("./lib/types").GitHubData>;
  githubCache: () => Promise<import("./lib/types").GitHubData>;
  githubCheck: () => Promise<{ installed: boolean; authenticated: boolean; username: string | null }>;
  githubUserOrgs: () => Promise<string[]>;
  updateWorkspace: (id: string, data: { githubOrgs?: string[]; name?: string; org?: string }) => Promise<import("./lib/types").Workspace>;
  onGithubUpdate: (cb: (data: import("./lib/types").GitHubData) => void) => () => void;

  // Agent Context
  getAgentContext: (data: { cli: import("./lib/types").AICli; workspacePath?: string | null; projectPath?: string | null }) => Promise<AgentContextSnapshot>;
  getCodexRepoSetup: (data: { workspacePath?: string | null; projectPath?: string | null }) => Promise<RepoCodexSetupReport>;
  getSkillStudioTargets: (data: { cli: import("./lib/types").AICli; workspacePath?: string | null; projectPath?: string | null }) => Promise<{ cli: import("./lib/types").AICli; targets: SkillStudioTarget[] }>;
  readSkillPackage: (filePath: string, data: { cli?: import("./lib/types").AICli; workspacePath?: string | null; projectPath?: string | null }) => Promise<SkillPackage>;
  saveSkillPackage: (data: {
    cli: import("./lib/types").AICli;
    scope: SkillScope;
    workspacePath?: string | null;
    projectPath?: string | null;
    skillName: string;
    skillMd: string;
    scripts: Array<{ path: string; content: string }>;
    skillFilePath?: string | null;
  }) => Promise<SkillPackage>;
  readAgentContextFile: (filePath: string) => Promise<AgentContextFile>;
  saveAgentContextFile: (filePath: string, content: string) => Promise<AgentContextFile>;
  createAgentContextDirectory: (dirPath: string) => Promise<{ path: string; exists: boolean }>;
  deleteAgentContextSkill: (filePath: string) => Promise<{ path: string; deleted: boolean }>;
  setAgentContextPluginEnabled: (pluginId: string, enabled: boolean) => Promise<AgentContextFile>;

  // PR Detail
  fetchPRDetail: (owner: string, repo: string, number: number) => Promise<import("./lib/pr-types").PRDetail | null>;
  fetchPRHeadSha: (owner: string, repo: string, number: number) => Promise<string | null>;
  fetchFilePatch: (owner: string, repo: string, number: number, filePath: string) => Promise<string | null>;
  postPRComment: (owner: string, repo: string, number: number, body: string) => Promise<{ ok: boolean }>;
  replyToThread: (owner: string, repo: string, number: number, commentId: string, body: string) => Promise<{ ok: boolean }>;
  submitReview: (owner: string, repo: string, number: number, event: string, body?: string) => Promise<{ ok: boolean }>;
  resolveThread: (owner: string, repo: string, number: number, threadId: string) => Promise<{ ok: boolean }>;
  closePR: (owner: string, repo: string, number: number) => Promise<{ ok: boolean }>;

  // Agents
  startAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string; reasoningEffort?: string; changedFiles?: number; changedLines?: number }) => Promise<import("./lib/pr-types").AgentTask>;
  cancelAgent: (id: string) => Promise<void>;
  listAgents: () => Promise<import("./lib/pr-types").AgentTask[]>;
  getAgentLogs: (id: string) => Promise<string>;
  clearAgent: (id: string) => Promise<void>;
  clearAllCompletedAgents: () => Promise<void>;
  getAgentRunningCount: () => Promise<number>;
  runAgentPrompt: (cli: string, prompt: string) => Promise<{ ok: boolean; output: string }>;
  onAgentUpdate: (cb: (task: import("./lib/pr-types").AgentTask) => void) => () => void;
  onAgentOutput: (cb: (id: string, chunk: string) => void) => () => void;

  // Rubric
  getRubricCategories: () => Promise<import("./lib/pr-types").RubricCategory[]>;
  saveRubricCategories: (categories: import("./lib/pr-types").RubricCategory[]) => Promise<import("./lib/pr-types").RubricCategory[]>;
  getRubricThresholds: () => Promise<import("./lib/pr-types").RubricThresholds>;
  saveRubricThresholds: (thresholds: import("./lib/pr-types").RubricThresholds) => Promise<import("./lib/pr-types").RubricThresholds>;

  // PR Cache
  getPrCache: (prId: string) => Promise<import("./lib/pr-types").PRCacheEntry | null>;
  listPrCaches: () => Promise<import("./lib/pr-types").PRCacheEntry[]>;
  upsertPrCache: (prId: string, fields: Partial<import("./lib/pr-types").PRCacheEntry>) => Promise<void>;
  cleanupPrCache: () => Promise<void>;

  // PR Discussions
  getDiscussions: (prId: string) => Promise<import("./lib/pr-types").Discussion[]>;
  createDiscussion: (data: { prId: string; selectedText: string; context?: string }) => Promise<import("./lib/pr-types").Discussion>;
  addDiscussionMessage: (data: { discussionId: string; role: string; content: string; cli?: string }) => Promise<import("./lib/pr-types").DiscussionMessage>;
  deleteDiscussion: (id: string) => Promise<void>;

  // Worktrees
  listWorktrees: (repoPath: string) => Promise<import("./lib/pr-types").WorktreeInfo[]>;
  checkWorktreeSyncStatus: (repoPath: string, worktreePath: string) => Promise<string | null>;
  createWorktreeForBranch: (repoPath: string, branch: string, targetPath?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  removeWorktree: (repoPath: string, worktreePath: string) => Promise<{ ok: boolean; error?: string }>;
  pruneWorktrees: (repoPath: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
