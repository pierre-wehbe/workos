import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Eye, FolderTree, Loader2, PencilLine, RefreshCw, Sparkles, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AICli,
  AgentContextArtifact,
  AgentContextIntent,
  AgentContextStatus,
  Project,
  RepoCodexSetupAction,
  RepoCodexSetupStatus,
  SkillScope,
  Workspace,
} from "../../lib/types";
import { useAgentContext } from "../../lib/use-agent-context";
import { useCodexSetup } from "../../lib/use-codex-setup";
import { DocumentEditor, type DocumentEditorAction } from "../../components/DocumentEditor";
import { InstructionStudioModal } from "../../components/InstructionStudioModal";
import { SkillStudioModal } from "../../components/SkillStudioModal";

interface ProjectContextTabProps {
  project: Project;
  workspace: Workspace | null;
  selectedCli: AICli;
  onOpenSettingsAgentContext: (intent: AgentContextIntent) => void;
}

type ProjectContextView = "setup" | "effective";
type ScopeKey = "global" | "workspace" | "repo";
type PreviewMode = "preview" | "source";

interface RowAction {
  label: string;
  onClick: () => void;
  tone?: "accent" | "subtle" | "danger";
  disabled?: boolean;
}

function statusClasses(status: RepoCodexSetupStatus) {
  if (status === "ready") return "bg-[rgba(21,128,61,0.12)] text-wo-success";
  if (status === "advanced") return "bg-wo-accent-soft text-wo-accent";
  return "bg-[rgba(217,119,6,0.12)] text-wo-warning";
}

function artifactStatusClasses(status: AgentContextStatus) {
  if (status === "active") return "bg-[rgba(21,128,61,0.12)] text-wo-success";
  if (status === "available") return "bg-wo-accent-soft text-wo-accent";
  if (status === "inactive") return "bg-wo-bg-subtle text-wo-text-tertiary";
  if (status === "missing") return "bg-[rgba(217,119,6,0.12)] text-wo-warning";
  return "bg-wo-bg-subtle text-wo-text-tertiary";
}

function kindLabel(kind: AgentContextArtifact["kind"]) {
  if (kind === "config") return "Config";
  if (kind === "rules") return "Rules";
  if (kind === "skill") return "Skill";
  if (kind === "plugin") return "Plugin";
  if (kind === "trust") return "Trust";
  return "Instructions";
}

function scopeLabel(scope: ScopeKey) {
  if (scope === "repo") return "Local";
  if (scope === "workspace") return "Workspace";
  return "Global";
}

function scopeDescription(scope: ScopeKey) {
  if (scope === "repo") return "Artifacts checked into this repo.";
  if (scope === "workspace") return "Workspace policy and shared repo-adjacent artifacts.";
  return "Machine-wide defaults and shared capabilities.";
}

function editorTitle(artifact: AgentContextArtifact) {
  if (artifact.scope === "repo") return `${artifact.name} · Local`;
  if (artifact.scope === "workspace") return `${artifact.name} · Workspace`;
  return artifact.name;
}

function settingsViewForArtifact(artifact: AgentContextArtifact): "behavior" | "permissions" | "capabilities" {
  if (artifact.kind === "skill" || artifact.kind === "plugin") return "capabilities";
  if (artifact.lane === "permission" || artifact.kind === "rules" || artifact.kind === "trust") return "permissions";
  return "behavior";
}

function sortArtifacts(artifacts: AgentContextArtifact[]) {
  return [...artifacts].sort((a, b) => {
    if (a.kind === "plugin" && b.kind !== "plugin") return -1;
    if (b.kind === "plugin" && a.kind !== "plugin") return 1;
    if (a.status === "available" && b.status !== "available") return -1;
    if (b.status === "available" && a.status !== "available") return 1;
    return (a.precedence ?? 999) - (b.precedence ?? 999) || a.name.localeCompare(b.name);
  });
}

function isDeletableSkill(artifact: AgentContextArtifact) {
  return artifact.kind === "skill" && artifact.editable && Boolean(artifact.path) && !/[\\/]\.system[\\/]/.test(artifact.path ?? "");
}

function languageFromPath(filePath: string | null, fallback = "") {
  if (!filePath) return fallback;
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".md")) return "md";
  if (normalized.endsWith(".toml")) return "toml";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".rules")) return "text";
  if (normalized.endsWith(".sh")) return "bash";
  return fallback;
}

function truncateText(content: string, maxLines = 220) {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content.trim();
  return `${lines.slice(0, maxLines).join("\n")}\n\n[truncated ${lines.length - maxLines} more lines]`;
}

function ScopePanel({
  label,
  description,
  count,
  emptyMessage,
  children,
  footer,
}: {
  label: string;
  description: string;
  count: number;
  emptyMessage: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-wo-border bg-wo-bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold">{label}</h5>
          <p className="mt-1 text-xs text-wo-text-tertiary">{description}</p>
        </div>
        <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
          {count}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {count === 0 ? (
          <div className="rounded-xl border border-dashed border-wo-border px-3 py-4 text-sm text-wo-text-tertiary">
            {emptyMessage}
          </div>
        ) : children}
      </div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}

function ArtifactRow({
  artifact,
  summary,
  primaryAction,
  secondaryAction,
}: {
  artifact: AgentContextArtifact;
  summary?: string;
  primaryAction?: RowAction | null;
  secondaryAction?: RowAction | null;
}) {
  const primaryTone = primaryAction?.tone ?? "accent";
  const secondaryTone = secondaryAction?.tone ?? "subtle";

  return (
    <div className="rounded-xl border border-wo-border bg-wo-bg px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{artifact.name}</p>
            <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-wo-text-tertiary">
              {kindLabel(artifact.kind)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${artifactStatusClasses(artifact.status)}`}>
              {artifact.status}
            </span>
          </div>
          <p className="mt-2 text-xs text-wo-text-secondary">{summary ?? artifact.summary ?? artifact.description}</p>
        </div>
        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryAction ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  secondaryTone === "danger"
                    ? "border border-[rgba(220,38,38,0.25)] text-wo-danger hover:bg-[rgba(220,38,38,0.06)]"
                    : "border border-wo-border text-wo-text hover:bg-wo-bg-subtle"
                }`}
              >
                {secondaryAction.label}
              </button>
            ) : null}
            {primaryAction ? (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  primaryTone === "subtle"
                    ? "border border-wo-border text-wo-text hover:bg-wo-bg-subtle"
                    : primaryTone === "danger"
                      ? "bg-wo-danger text-white hover:opacity-90"
                      : "border border-wo-border text-wo-accent hover:bg-wo-accent-soft"
                }`}
              >
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

async function buildContextPreview({
  cli,
  snapshot,
  readFile,
}: {
  cli: AICli;
  snapshot: NonNullable<ReturnType<typeof useAgentContext>["snapshot"]>;
  readFile: (filePath: string) => Promise<{ content: string }>;
}) {
  const supportedArtifacts = snapshot.artifacts.filter((artifact) => artifact.status !== "unsupported" && artifact.supportedClis.includes(cli));
  const behaviorArtifacts = sortArtifacts(
    supportedArtifacts.filter((artifact) =>
      ["global", "workspace", "repo"].includes(artifact.scope)
      && (artifact.kind === "instruction" || artifact.kind === "config")
      && (artifact.exists || artifact.kind === "config")
    )
  );
  const permissionArtifacts = sortArtifacts(
    supportedArtifacts.filter((artifact) =>
      artifact.lane === "permission"
      && (artifact.exists || artifact.kind === "trust")
    )
  );
  const pluginArtifacts = sortArtifacts(
    supportedArtifacts.filter((artifact) => artifact.kind === "plugin")
  );
  const skillArtifacts = sortArtifacts(
    supportedArtifacts.filter((artifact) => artifact.kind === "skill")
  );

  const sections: string[] = [];
  sections.push(`# ${cli.toUpperCase()} Context Preview`);
  sections.push([
    "This is an approximation of the file-backed context WorkOS discovered for this repo.",
    "Instruction files and rule files are shown inline.",
    "Capabilities are listed separately because plugins and skills are available on demand rather than pasted into every prompt.",
  ].join(" "));

  if (behaviorArtifacts.length > 0) {
    sections.push("## Always-loaded behavior");
    for (const artifact of behaviorArtifacts) {
      const lines = [`### ${scopeLabel(artifact.scope as ScopeKey)} · ${artifact.name}`];
      if (artifact.path) lines.push(`Source: \`${artifact.path}\``);

      let body = "";
      if (artifact.kind === "instruction" && artifact.path && artifact.exists) {
        try {
          const file = await readFile(artifact.path);
          body = `\`\`\`${languageFromPath(artifact.path, "md")}\n${truncateText(file.content || "_Empty file._")}\n\`\`\``;
        } catch {
          body = artifact.summary;
        }
      } else {
        const preview = artifact.previewLines?.length ? artifact.previewLines.join("\n") : artifact.summary || artifact.description;
        body = `\`\`\`${languageFromPath(artifact.path, "toml")}\n${preview}\n\`\`\``;
      }
      sections.push([...lines, body].join("\n\n"));
    }
  }

  if (permissionArtifacts.length > 0) {
    sections.push("## Permission policy");
    for (const artifact of permissionArtifacts) {
      const lines = [`### ${scopeLabel(artifact.scope as ScopeKey)} · ${artifact.name}`];
      if (artifact.path) lines.push(`Source: \`${artifact.path}\``);

      let body = "";
      if ((artifact.kind === "rules" || artifact.kind === "instruction") && artifact.path && artifact.exists) {
        try {
          const file = await readFile(artifact.path);
          body = `\`\`\`${languageFromPath(artifact.path, "text")}\n${truncateText(file.content || "_Empty file._")}\n\`\`\``;
        } catch {
          body = artifact.summary;
        }
      } else {
        const preview = artifact.previewLines?.length ? artifact.previewLines.join("\n") : artifact.summary || artifact.description;
        body = `\`\`\`${languageFromPath(artifact.path, "toml")}\n${preview}\n\`\`\``;
      }
      sections.push([...lines, body].join("\n\n"));
    }
  }

  sections.push("## Available capabilities");
  if (pluginArtifacts.length > 0) {
    sections.push([
      "### Global plugins",
      ...pluginArtifacts.map((artifact) => `- ${artifact.name} — ${artifact.summary}`),
    ].join("\n"));
  }
  if (skillArtifacts.length > 0) {
    const skillGroups: ScopeKey[] = ["global", "workspace", "repo"];
    for (const scope of skillGroups) {
      const items = skillArtifacts.filter((artifact) => artifact.scope === scope);
      if (items.length === 0) continue;
      sections.push([
        `### ${scopeLabel(scope)} skills`,
        ...items.map((artifact) => `- ${artifact.name}`),
      ].join("\n"));
    }
  }
  if (pluginArtifacts.length === 0 && skillArtifacts.length === 0) {
    sections.push("_No capability artifacts discovered for this CLI._");
  }

  return sections.join("\n\n");
}

export function ProjectContextTab({ project, workspace, selectedCli, onOpenSettingsAgentContext }: ProjectContextTabProps) {
  const codexSelected = selectedCli === "codex";
  const [view, setView] = useState<ProjectContextView>(codexSelected ? "setup" : "effective");
  const [creatingArtifactId, setCreatingArtifactId] = useState<string | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ path: string; title: string } | null>(null);
  const [editorFile, setEditorFile] = useState<{ path: string | null; exists: boolean; editable: boolean; content: string } | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteSkillId, setDeleteSkillId] = useState<string | null>(null);
  const [skillStudioMode, setSkillStudioMode] = useState<"create" | "edit">("create");
  const [skillStudioScope, setSkillStudioScope] = useState<SkillScope>("repo");
  const [skillStudioFilePath, setSkillStudioFilePath] = useState<string | null>(null);
  const [skillStudioName, setSkillStudioName] = useState("");
  const [skillStudioOpen, setSkillStudioOpen] = useState(false);
  const [instructionStudioOpen, setInstructionStudioOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const {
    snapshot,
    loading,
    saving,
    toggling,
    refresh,
    readFile,
    saveFile,
    createDirectory,
    deleteSkill,
    setPluginEnabled,
  } = useAgentContext({
    cli: selectedCli,
    workspacePath: workspace?.path ?? null,
    projectPath: project.localPath,
  });
  const {
    report,
    loading: setupLoading,
    refresh: refreshSetup,
  } = useCodexSetup({
    workspacePath: workspace?.path ?? null,
    projectPath: project.localPath,
    enabled: codexSelected,
  });

  useEffect(() => {
    setView(selectedCli === "codex" ? "setup" : "effective");
  }, [selectedCli]);

  useEffect(() => {
    let cancelled = false;

    async function loadEditorFile() {
      if (!editorTarget) {
        setEditorFile(null);
        setEditorDraft("");
        setEditorError(null);
        setEditorLoading(false);
        return;
      }
      setEditorLoading(true);
      setEditorError(null);
      try {
        const file = await readFile(editorTarget.path);
        if (cancelled) return;
        setEditorFile(file);
        setEditorDraft(file.content);
      } catch (error) {
        if (cancelled) return;
        setEditorError(error instanceof Error ? error.message : "Failed to open file");
      } finally {
        if (!cancelled) setEditorLoading(false);
      }
    }

    void loadEditorFile();
    return () => {
      cancelled = true;
    };
  }, [editorTarget, readFile]);

  const relevantArtifacts = useMemo(
    () => sortArtifacts((snapshot?.artifacts ?? []).filter((artifact) => artifact.status !== "unsupported" && artifact.supportedClis.includes(selectedCli))),
    [selectedCli, snapshot?.artifacts]
  );
  const behaviorArtifacts = useMemo(
    () => relevantArtifacts.filter((artifact) => ["global", "workspace", "repo"].includes(artifact.scope) && (artifact.kind === "instruction" || artifact.kind === "config")),
    [relevantArtifacts]
  );
  const permissionArtifacts = useMemo(
    () => relevantArtifacts.filter((artifact) => artifact.lane === "permission"),
    [relevantArtifacts]
  );
  const capabilityArtifacts = useMemo(
    () => relevantArtifacts.filter((artifact) => artifact.lane === "capability"),
    [relevantArtifacts]
  );
  const globalPlugins = useMemo(
    () => capabilityArtifacts.filter((artifact) => artifact.scope === "global" && artifact.kind === "plugin"),
    [capabilityArtifacts]
  );
  const globalSkills = useMemo(
    () => capabilityArtifacts.filter((artifact) => artifact.scope === "global" && artifact.kind === "skill"),
    [capabilityArtifacts]
  );
  const workspaceCapabilities = useMemo(
    () => capabilityArtifacts.filter((artifact) => artifact.scope === "workspace"),
    [capabilityArtifacts]
  );
  const repoCapabilities = useMemo(
    () => capabilityArtifacts.filter((artifact) => artifact.scope === "repo"),
    [capabilityArtifacts]
  );
  const repoSkills = useMemo(
    () => repoCapabilities.filter((artifact) => artifact.kind === "skill"),
    [repoCapabilities]
  );
  const structureActionMap = useMemo(() => {
    const map = new Map<string, RepoCodexSetupAction>();
    for (const action of report?.actions ?? []) {
      if (action.kind !== "create_file" || !action.path?.endsWith("/AGENTS.md")) continue;
      map.set(action.path, action);
    }
    return map;
  }, [report?.actions]);
  const rootAgentsAction = useMemo(
    () => report?.actions.find((action) => action.id === "create-root-agents") ?? null,
    [report?.actions]
  );
  const directoryRows = useMemo(
    () => (report?.structure ?? []).filter((row) => row.path !== "/" && (row.hasLocalAgents || row.recommendation === "recommended")).slice(0, 6),
    [report?.structure]
  );

  const openEditor = (path: string, title: string) => {
    setEditorTarget({ path, title });
  };

  const closeEditor = () => {
    setEditorTarget(null);
    setEditorFile(null);
    setEditorDraft("");
    setEditorError(null);
    setInstructionStudioOpen(false);
  };

  const openInSettings = ({
    artifactPath = null,
    view: targetView,
  }: {
    artifactPath?: string | null;
    view?: "behavior" | "permissions" | "capabilities";
  } = {}) => {
    onOpenSettingsAgentContext({
      cli: selectedCli,
      workspaceId: workspace?.id ?? null,
      projectId: project.id,
      artifactPath,
      view: targetView,
    });
  };

  const handleSetupAction = async (action: RepoCodexSetupAction) => {
    setRunningActionId(action.id);
    setActionError(null);
    try {
      if (action.kind === "create_file" && action.path) {
        await saveFile(action.path, action.content ?? "");
        openEditor(action.path, action.title);
      } else if (action.kind === "create_directory" && action.path) {
        await createDirectory(action.path);
      } else if (action.kind === "enable_plugin" && action.pluginId) {
        await setPluginEnabled(action.pluginId, true);
      }
      await refreshSetup();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to apply setup action");
    } finally {
      setRunningActionId(null);
    }
  };

  const handleCreateMissing = async (artifact: AgentContextArtifact) => {
    if (!artifact.path) return;
    setCreatingArtifactId(artifact.id);
    setActionError(null);
    try {
      await saveFile(artifact.path, artifact.starterTemplate ?? "");
      openEditor(artifact.path, editorTitle(artifact));
      if (codexSelected) await refreshSetup();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create file");
    } finally {
      setCreatingArtifactId(null);
    }
  };

  const handleDeleteSkill = async (artifact: AgentContextArtifact) => {
    if (!artifact.path || !isDeletableSkill(artifact)) return;
    if (deleteSkillId !== artifact.id) {
      setDeleteSkillId(artifact.id);
      return;
    }

    setRunningActionId(`delete-skill-${artifact.id}`);
    setActionError(null);
    try {
      await deleteSkill(artifact.path);
      setDeleteSkillId(null);
      await refresh();
      await refreshSetup();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete skill");
    } finally {
      setRunningActionId(null);
    }
  };

  const handleEditorSave = async () => {
    if (!editorTarget) return;
    setEditorError(null);
    try {
      const next = await saveFile(editorTarget.path, editorDraft);
      setEditorFile(next);
      setEditorDraft(next.content);
      await refreshSetup();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Failed to save file");
    }
  };

  const handleRefreshAll = async () => {
    setActionError(null);
    await refresh();
    if (codexSelected) await refreshSetup();
  };

  const handleSkillStudioSaved = async () => {
    await refresh();
    await refreshSetup();
  };

  const handleInstructionStudioSaved = async (file: { path: string | null; exists: boolean; editable: boolean; content: string }) => {
    setEditorFile(file);
    setEditorDraft(file.content);
    await refresh();
    await refreshSetup();
  };

  const openSkillStudio = ({
    mode,
    filePath = null,
    skillName = "",
    scope = "repo" as SkillScope,
  }: {
    mode: "create" | "edit";
    filePath?: string | null;
    skillName?: string;
    scope?: SkillScope;
  }) => {
    setSkillStudioMode(mode);
    setSkillStudioScope(scope);
    setSkillStudioFilePath(filePath);
    setSkillStudioName(skillName);
    setSkillStudioOpen(true);
  };

  const openLocalArtifact = (artifact: AgentContextArtifact) => {
    if (!artifact.path) return;
    if (artifact.kind === "skill") {
      openSkillStudio({
        mode: "edit",
        filePath: artifact.path,
        skillName: artifact.name,
        scope: "repo",
      });
      return;
    }
    openEditor(artifact.path, editorTitle(artifact));
  };

  const openContextPreview = async () => {
    if (!snapshot) return;
    setPreviewOpen(true);
    setPreviewMode("preview");
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const content = await buildContextPreview({
        cli: selectedCli,
        snapshot,
        readFile,
      });
      setPreviewContent(content);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Failed to build context preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const editorActions = useMemo<DocumentEditorAction[]>(() => {
    if (!editorTarget?.path || !editorTarget.path.toLowerCase().endsWith(".md")) return [];
    return [
      {
        id: "instruction-studio",
        label: "Open Instruction Studio",
        hint: "Open the full-screen drafting flow with chat on the left and a live preview on the right.",
        onClick: () => setInstructionStudioOpen(true),
      },
    ];
  }, [editorTarget?.path]);

  const setupSummary = useMemo(() => {
    if (!report) return "";
    if (report.status === "ready") {
      return report.isMonorepo
        ? "Root guidance is in place. Only add local AGENTS.md files where a package really diverges."
        : "The repo baseline is in place. Use local skills only for repeatable workflows.";
    }
    if (!report.rootAgentsExists) {
      return "Start with one root AGENTS.md so Codex has a single shared repo policy layer.";
    }
    if (report.isMonorepo) {
      return "Keep this lean: root AGENTS.md first, then only a few directory-specific overrides where commands or constraints differ.";
    }
    return "This repo needs a small Codex baseline, not a large instruction tree.";
  }, [report]);

  const renderBehaviorScope = (scope: ScopeKey) => {
    const artifacts = behaviorArtifacts.filter((artifact) => artifact.scope === scope);
    return (
      <ScopePanel
        key={`behavior-${scope}`}
        label={scopeLabel(scope)}
        description={scopeDescription(scope)}
        count={artifacts.length}
        emptyMessage={`No ${scopeLabel(scope).toLowerCase()} behavior artifacts found for ${selectedCli}.`}
      >
        {artifacts.map((artifact) => {
          const repoLocal = scope === "repo";
          const primaryAction = repoLocal
            ? artifact.exists
              ? { label: "Edit", onClick: () => openLocalArtifact(artifact) }
              : artifact.editable && artifact.recommended
                ? {
                    label: creatingArtifactId === artifact.id ? "Creating..." : "Create",
                    onClick: () => void handleCreateMissing(artifact),
                    disabled: creatingArtifactId === artifact.id,
                  }
                : null
            : {
                label: "Open In Settings",
                onClick: () => openInSettings({ artifactPath: artifact.path, view: settingsViewForArtifact(artifact) }),
                tone: "subtle" as const,
              };

          return (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              summary={artifact.summary || artifact.description}
              primaryAction={primaryAction}
            />
          );
        })}
      </ScopePanel>
    );
  };

  const renderPermissionScope = (scope: ScopeKey) => {
    const artifacts = permissionArtifacts.filter((artifact) => artifact.scope === scope);
    return (
      <ScopePanel
        key={`permission-${scope}`}
        label={scopeLabel(scope)}
        description={scope === "repo" ? "Repo-local rules and permission files." : scopeDescription(scope)}
        count={artifacts.length}
        emptyMessage={`No ${scopeLabel(scope).toLowerCase()} permission artifacts found for ${selectedCli}.`}
      >
        {artifacts.map((artifact) => {
          const repoLocal = scope === "repo" && artifact.path;
          const primaryAction = repoLocal
            ? { label: "Edit", onClick: () => openLocalArtifact(artifact) }
            : {
                label: "Open In Settings",
                onClick: () => openInSettings({ artifactPath: artifact.path, view: settingsViewForArtifact(artifact) }),
                tone: "subtle" as const,
              };

          return (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              summary={artifact.summary || artifact.description}
              primaryAction={primaryAction}
            />
          );
        })}
      </ScopePanel>
    );
  };

  const renderCapabilityScope = (scope: ScopeKey) => {
    const artifacts = scope === "global"
      ? globalPlugins
      : scope === "workspace"
        ? workspaceCapabilities
        : repoCapabilities;
    const globalSkillSummary = scope === "global" ? globalSkills : [];

    return (
      <ScopePanel
        key={`capability-${scope}`}
        label={scopeLabel(scope)}
        description={scope === "repo" ? "Repo-scoped skills that ship with this codebase." : scopeDescription(scope)}
        count={artifacts.length + (scope === "global" ? globalSkillSummary.length : 0)}
        emptyMessage={scope === "repo"
          ? "No repo-local capabilities yet. Add a local skill only when the workflow is repeatable and repo-specific."
          : `No ${scopeLabel(scope).toLowerCase()} capabilities found for ${selectedCli}.`}
        footer={scope === "repo" ? (
          <button
            type="button"
            onClick={() => openSkillStudio({ mode: "create", scope: "repo" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
          >
            <Sparkles size={12} />
            Create Repo Skill
          </button>
        ) : undefined}
      >
        {artifacts.map((artifact) => {
          const repoLocalSkill = scope === "repo" && artifact.kind === "skill" && artifact.path;
          const deleting = runningActionId === `delete-skill-${artifact.id}`;
          const primaryAction = repoLocalSkill
            ? {
                label: "Edit",
                onClick: () => openLocalArtifact(artifact),
              }
            : {
                label: "Open In Settings",
                onClick: () => openInSettings({ artifactPath: artifact.path, view: "capabilities" }),
                tone: "subtle" as const,
              };
          const secondaryAction = repoLocalSkill && isDeletableSkill(artifact)
            ? deleteSkillId === artifact.id
              ? {
                  label: deleting ? "Deleting..." : "Confirm Delete",
                  onClick: () => void handleDeleteSkill(artifact),
                  tone: "danger" as const,
                  disabled: deleting,
                }
              : {
                  label: "Delete",
                  onClick: () => void handleDeleteSkill(artifact),
                  tone: "danger" as const,
                }
            : null;

          return (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              summary={artifact.summary || artifact.description}
              primaryAction={primaryAction}
              secondaryAction={secondaryAction}
            />
          );
        })}
        {scope === "global" && globalSkillSummary.length > 0 && (
          globalSkillSummary.length <= 6 ? (
            globalSkillSummary.map((artifact) => (
              <ArtifactRow
                key={artifact.id}
                artifact={artifact}
                summary="Global on-demand skill"
                primaryAction={{
                  label: "Open In Settings",
                  onClick: () => openInSettings({ artifactPath: artifact.path, view: "capabilities" }),
                  tone: "subtle",
                }}
              />
            ))
          ) : (
            <div className="rounded-xl border border-wo-border bg-wo-bg px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{globalSkillSummary.length} global skills available</p>
                  <p className="mt-1 text-xs text-wo-text-secondary">
                    Keep the repo page focused on enabled plugins and local overrides. Browse the full global skill library in Settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openInSettings({ view: "capabilities" })}
                  className="rounded-md border border-wo-border px-3 py-1.5 text-[11px] font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
                >
                  Open In Settings
                </button>
              </div>
            </div>
          )
        )}
      </ScopePanel>
    );
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Agent Context</h3>
          <p className="mt-1 text-sm text-wo-text-secondary">
            {codexSelected
              ? "Keep this repo page action-oriented. Use Setup for the baseline, then inspect the effective inherited context."
              : `Inspect the effective ${selectedCli} context here. Codex-specific setup automation stays Codex-first for now.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefreshAll()}
          disabled={loading || setupLoading}
          className="flex items-center gap-1.5 rounded-lg border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading || setupLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {codexSelected && (
        <div className="inline-flex rounded-xl border border-wo-border bg-wo-bg-subtle p-1">
          <button
            type="button"
            onClick={() => setView("setup")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              view === "setup" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
            }`}
          >
            Setup
          </button>
          <button
            type="button"
            onClick={() => setView("effective")}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              view === "effective" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
            }`}
          >
            Effective Context
          </button>
        </div>
      )}

      {actionError ? (
        <div className="rounded-xl border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] p-4 text-sm text-wo-danger">
          {actionError}
        </div>
      ) : null}

      {view === "setup" && codexSelected && report ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-wo-border bg-wo-bg-elevated p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold">Configure Codex For This Repo</h4>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClasses(report.status)}`}>
                    {report.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-wo-text-secondary">{setupSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => openInSettings({ view: "behavior" })}
                className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
              >
                Open Full Inventory
                <ArrowUpRight size={12} />
              </button>
            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-3">
            <div className="rounded-2xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-wo-text-tertiary">Root Instructions</p>
              <p className="mt-2 text-sm text-wo-text-secondary">
                One root `AGENTS.md` should carry the shared repo policy. Add local files only where commands or constraints diverge.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {report.rootAgentsExists ? (
                  <button
                    type="button"
                    onClick={() => openEditor(report.rootAgentsPath, "Root AGENTS.md")}
                    className="rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
                  >
                    Open Root AGENTS
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => rootAgentsAction && void handleSetupAction(rootAgentsAction)}
                    disabled={!rootAgentsAction || runningActionId === rootAgentsAction.id || saving}
                    className="rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50"
                  >
                    {runningActionId === rootAgentsAction?.id ? "Creating..." : "Create Root AGENTS"}
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-wo-text-tertiary">Repo Skills</p>
              <p className="mt-2 text-sm text-wo-text-secondary">
                Keep repo-local skills for repeatable workflows. Root `/.codex/skills` is the happy path for shared repo workflows.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openSkillStudio({ mode: "create", scope: "repo" })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
                >
                  <Sparkles size={12} />
                  Open Skill Studio
                </button>
                {!report.sharedSkillsExists ? (
                  <span className="text-[11px] text-wo-text-tertiary">Creates `/.codex/skills` on save.</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-wo-text-tertiary">Global Baseline</p>
              <p className="mt-2 text-sm text-wo-text-secondary">
                Plugins and machine-wide defaults stay global. Review them once in Settings instead of duplicating them per repo.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => openInSettings({ view: "capabilities" })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
                >
                  Open Global Capabilities
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          </section>

          {directoryRows.length > 0 ? (
            <section className="rounded-2xl border border-wo-border bg-wo-bg-elevated p-4">
              <div className="flex items-start gap-3">
                <FolderTree size={16} className="mt-0.5 text-wo-accent" />
                <div>
                  <h4 className="text-sm font-semibold">Directory Overrides</h4>
                  <p className="mt-1 text-sm text-wo-text-secondary">
                    Only create local `AGENTS.md` files where a package really behaves differently from the repo root.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {directoryRows.map((row) => {
                  const agentsPath = `${project.localPath}/${row.path}/AGENTS.md`;
                  const createAction = structureActionMap.get(agentsPath);
                  const canOpen = row.hasLocalAgents;
                  return (
                    <div key={row.path} className="rounded-xl border border-wo-border bg-wo-bg px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-xs text-wo-text">{row.path}</p>
                            <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                              {row.ecosystem}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-wo-text-secondary">{row.note}</p>
                        </div>
                        {canOpen ? (
                          <button
                            type="button"
                            onClick={() => openEditor(agentsPath, `AGENTS.md · ${row.path}`)}
                            className="rounded-md border border-wo-border px-3 py-1.5 text-[11px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
                          >
                            Open AGENTS
                          </button>
                        ) : createAction ? (
                          <button
                            type="button"
                            onClick={() => void handleSetupAction(createAction)}
                            disabled={runningActionId === createAction.id || saving}
                            className="rounded-md border border-wo-border px-3 py-1.5 text-[11px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50"
                          >
                            {runningActionId === createAction.id ? "Creating..." : "Create AGENTS"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {view === "setup" && codexSelected && !report && setupLoading ? (
        <div className="rounded-xl border border-wo-border bg-wo-bg-elevated p-6 text-sm text-wo-text-tertiary">
          Scanning this repo for Codex setup recommendations…
        </div>
      ) : null}

      {(view === "effective" || !codexSelected) && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold">Effective Context</h4>
              <p className="mt-1 text-sm text-wo-text-secondary">
                See what {selectedCli} inherits here, split into global, workspace, and local scope.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void openContextPreview()}
                disabled={!snapshot || previewLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
              >
                <Eye size={12} />
                Preview {selectedCli.toUpperCase()} Context
              </button>
              <button
                type="button"
                onClick={() => openInSettings({ view: "behavior" })}
                className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
              >
                Open Full Inventory
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>

          <section className="space-y-3">
            <div>
              <h5 className="text-sm font-semibold">Behavior</h5>
              <p className="mt-1 text-xs text-wo-text-tertiary">
                Instruction files and config that shape the baseline behavior for this repo.
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {(["global", "workspace", "repo"] as ScopeKey[]).map((scope) => renderBehaviorScope(scope))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h5 className="text-sm font-semibold">Capabilities</h5>
              <p className="mt-1 text-xs text-wo-text-tertiary">
                Plugins are global. Skills can be global, workspace-scoped, or repo-local.
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {(["global", "workspace", "repo"] as ScopeKey[]).map((scope) => renderCapabilityScope(scope))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h5 className="text-sm font-semibold">Permissions</h5>
              <p className="mt-1 text-xs text-wo-text-tertiary">
                Trust and rule files that influence command approvals or CLI-specific policy.
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {(["global", "workspace", "repo"] as ScopeKey[]).map((scope) => renderPermissionScope(scope))}
            </div>
          </section>
        </div>
      )}

      {editorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/55" onClick={closeEditor}>
          <div
            className="max-h-[88vh] w-[min(1000px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-wo-border bg-wo-bg-elevated shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-wo-border px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold">{editorTarget.title}</h4>
                <p className="mt-1 text-xs text-wo-text-tertiary">Draft assists revise the file but never save automatically.</p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-md border border-wo-border p-2 text-wo-text-secondary hover:bg-wo-bg-subtle hover:text-wo-text transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4">
              <DocumentEditor
                title={editorTarget.title}
                path={editorTarget.path}
                draft={editorDraft}
                onChange={setEditorDraft}
                onSave={handleEditorSave}
                saving={saving}
                loading={editorLoading}
                saveDisabled={editorFile ? editorDraft === editorFile.content : false}
                editable={editorFile?.editable ?? true}
                exists={editorFile?.exists ?? true}
                error={editorError}
                actions={editorActions}
              />
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/35 dark:bg-black/60" onClick={() => setPreviewOpen(false)}>
          <div
            className="flex h-[min(90vh,920px)] w-[min(1260px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-wo-border bg-wo-bg-elevated shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-wo-border px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{selectedCli.toUpperCase()} Context Preview</h3>
                  <span className="rounded-full bg-wo-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-wo-accent">
                    Approximate
                  </span>
                </div>
                <p className="mt-1 text-sm text-wo-text-secondary">
                  This shows the discovered file-backed context in order. Capabilities stay separate because they are available on demand, not pasted into every prompt.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-wo-border bg-wo-bg-subtle p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      previewMode === "preview" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                    }`}
                  >
                    <Eye size={12} />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("source")}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      previewMode === "source" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                    }`}
                  >
                    <PencilLine size={12} />
                    Source
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-md border border-wo-border p-2 text-wo-text-secondary hover:bg-wo-bg-subtle hover:text-wo-text transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {previewLoading ? (
                <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-wo-text-tertiary">
                  <Loader2 size={16} className="animate-spin" />
                  Building preview…
                </div>
              ) : previewError ? (
                <div className="rounded-2xl border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] px-4 py-4 text-sm text-wo-danger">
                  {previewError}
                </div>
              ) : previewMode === "preview" ? (
                <div className="prose-sm prose-wo max-w-none rounded-2xl border border-wo-border bg-wo-bg px-6 py-6">
                  <Markdown remarkPlugins={[remarkGfm]}>{previewContent || "_No preview available._"}</Markdown>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-2xl border border-wo-border bg-wo-bg px-6 py-6 font-mono text-[12px] leading-5 text-wo-text">
                  {previewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      <SkillStudioModal
        open={skillStudioOpen}
        cli={selectedCli}
        workspace={workspace}
        project={project}
        mode={skillStudioMode}
        initialScope={skillStudioScope}
        initialSkillName={skillStudioName}
        initialSkillFilePath={skillStudioFilePath}
        onClose={() => {
          setSkillStudioOpen(false);
          setSkillStudioFilePath(null);
          setSkillStudioName("");
          setDeleteSkillId(null);
        }}
        onSaved={handleSkillStudioSaved}
      />

      {editorTarget && (
        <InstructionStudioModal
          open={instructionStudioOpen}
          cli={selectedCli}
          title={editorTarget.title}
          filePath={editorTarget.path}
          initialContent={editorDraft}
          onClose={() => setInstructionStudioOpen(false)}
          onSaved={handleInstructionStudioSaved}
        />
      )}
    </div>
  );
}
