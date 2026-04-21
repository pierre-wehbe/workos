import { useEffect, useMemo, useState } from "react";
import { FilePlus2, FileText, RefreshCw, Save, WandSparkles } from "lucide-react";
import type { AICli, AgentContextArtifact, AgentContextFile, AgentContextIntent, AgentContextPanelView, Project, SkillPackage, SkillScope, Workspace } from "../../lib/types";
import { useAgentContext } from "../../lib/use-agent-context";
import { useProjects } from "../../lib/use-projects";
import { ipc } from "../../lib/ipc";
import { AgentContextLanes, AgentContextStatusBadge } from "../../components/AgentContextLanes";
import { DocumentEditor, type DocumentEditorAction } from "../../components/DocumentEditor";
import { InstructionStudioModal } from "../../components/InstructionStudioModal";
import { SkillStudioModal } from "../../components/SkillStudioModal";

interface AgentContextPanelProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  selectedCli: AICli;
  initialIntent?: AgentContextIntent | null;
}

interface SkillStudioState {
  mode: "create" | "edit";
  initialScope: SkillScope;
  initialSkillName?: string;
  initialSkillFilePath?: string | null;
}

type AgentContextView = AgentContextPanelView;
const views: Array<{ id: AgentContextView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "behavior", label: "Behavior" },
  { id: "permissions", label: "Permissions" },
  { id: "capabilities", label: "Capabilities" },
];

function formatSize(size: number | null) {
  if (size == null) return "n/a";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function cliChipLabel(cli: AICli) {
  return cli.toUpperCase();
}

function parentPath(filePath: string) {
  return filePath.replace(/[/\\][^/\\]+$/, "");
}

function kindLabel(kind: AgentContextArtifact["kind"]) {
  if (kind === "config") return "Config";
  if (kind === "rules") return "Rules";
  if (kind === "skill") return "Skill";
  if (kind === "plugin") return "Plugin";
  if (kind === "trust") return "Trust";
  if (kind === "runtime") return "Runtime";
  return "Instruction";
}

function isUserManagedSkill(artifact: AgentContextArtifact | null) {
  if (!artifact || artifact.kind !== "skill" || !artifact.path || !artifact.editable) return false;
  return !/[\\/]\.system[\\/]/.test(artifact.path);
}

function groupCapabilities(items: AgentContextArtifact[]) {
  const map = new Map<string, { key: string; label: string; items: AgentContextArtifact[] }>();
  const kindOrder = { plugin: 0, skill: 1, runtime: 2, config: 3, rules: 4, trust: 5, instruction: 6 } as const;

  for (const item of items) {
    const key = item.groupKey ?? item.kind;
    const label = item.groupLabel ?? "General";
    if (!map.has(key)) map.set(key, { key, label, items: [] });
    map.get(key)!.items.push(item);
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => {
        const kindDelta = kindOrder[a.kind] - kindOrder[b.kind];
        if (kindDelta !== 0) return kindDelta;
        if (a.recommended && !b.recommended) return -1;
        if (b.recommended && !a.recommended) return 1;
        return a.name.localeCompare(b.name);
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function selectorMeta(artifact: AgentContextArtifact) {
  if (artifact.kind === "plugin") return artifact.pluginEnabled ? "Enabled" : artifact.pluginConfigured ? "Disabled" : "Missing";
  if (artifact.kind === "rules") return artifact.previewLines?.[0] || artifact.summary;
  if (artifact.kind === "config") return "Defaults";
  if (artifact.kind === "trust") return artifact.summary;
  return artifact.summary;
}

function ArtifactTabs({
  artifacts,
  selectedArtifactId,
  onSelect,
  compact = false,
}: {
  artifacts: AgentContextArtifact[];
  selectedArtifactId: string | null;
  onSelect: (artifactId: string) => void;
  compact?: boolean;
}) {
  if (artifacts.length === 0) return null;
  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${compact ? "" : "pt-1"}`}>
      {artifacts.map((artifact) => {
        const selected = artifact.id === selectedArtifactId;
        return (
          <button
            key={artifact.id}
            type="button"
            onClick={() => onSelect(artifact.id)}
            className={`min-w-0 shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-wo-accent bg-wo-accent-soft/60"
                : "border-wo-border bg-wo-bg hover:bg-wo-bg-subtle"
            } ${compact ? "w-[180px]" : "w-[220px]"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-wo-text">{artifact.name}</p>
              <AgentContextStatusBadge status={artifact.status} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-wo-text-secondary">
                {kindLabel(artifact.kind)}
              </span>
            </div>
            <p className="mt-2 line-clamp-1 text-xs text-wo-text-tertiary">
              {selectorMeta(artifact)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function GroupTabs({
  groups,
  selectedKey,
  onSelect,
}: {
  groups: Array<{ key: string; label: string; items: AgentContextArtifact[] }>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {groups.map((group) => {
        const selected = group.key === selectedKey;
        return (
          <button
            key={group.key}
            type="button"
            onClick={() => onSelect(group.key)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-wo-accent bg-wo-accent-soft/60"
                : "border-wo-border bg-wo-bg hover:bg-wo-bg-subtle"
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-wo-text">{group.label}</p>
              <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                {group.items.length}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: AgentContextArtifact }) {
  if (!artifact.previewLines || artifact.previewLines.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {artifact.previewLines.slice(0, 6).map((line) => (
        <p key={line} className="font-mono text-[11px] text-wo-text-tertiary">
          {line}
        </p>
      ))}
    </div>
  );
}

function ArtifactDetail({
  artifact,
  cli,
  file,
  draft,
  setDraft,
  fileLoading,
  saving,
  toggling,
  saveError,
  editorActions,
  deletingSkill,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
  onOpenSkillStudio,
  onOpenInstructionStudio,
  onSave,
  onTogglePlugin,
}: {
  artifact: AgentContextArtifact | null;
  cli: AICli;
  file: AgentContextFile | null;
  draft: string;
  setDraft: (value: string) => void;
  fileLoading: boolean;
  saving: boolean;
  toggling: boolean;
  saveError: string | null;
  editorActions: DocumentEditorAction[];
  deletingSkill: boolean;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onOpenSkillStudio: (() => void) | null;
  onOpenInstructionStudio: (() => void) | null;
  onSave: () => void;
  onTogglePlugin: (enabled: boolean) => void;
}) {
  const dirty = file != null && draft !== file.content;
  const deletableSkill = isUserManagedSkill(artifact);
  const draftableInstruction = artifact?.kind === "instruction" && artifact.path?.toLowerCase().endsWith(".md") && artifact.editable;
  const pluginToggleTitle = artifact?.pluginConfigured ? "Enabled In `config.toml`" : "Add And Enable In `config.toml`";
  const pluginToggleDescription = artifact?.pluginConfigured
    ? "Toggle the plugin directly instead of editing the boolean by hand."
    : "This plugin is recommended but not configured yet. Turning it on will add the right section to `config.toml`.";

  if (!artifact) {
    return (
      <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-6 text-sm text-wo-text-tertiary">
        No artifact selected.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-wo-border bg-wo-bg-elevated">
      <div className="border-b border-wo-border px-4 py-3">
        <h4 className="text-sm font-semibold">{artifact.name}</h4>
        <p className="mt-1 text-xs text-wo-text-tertiary">{artifact.description}</p>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-wo-text-tertiary">Status</p>
            <div className="mt-2"><AgentContextStatusBadge status={artifact.status} /></div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-wo-text-tertiary">Kind</p>
            <p className="mt-2 text-sm text-wo-text">{kindLabel(artifact.kind)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-wo-text-tertiary">Scope</p>
            <p className="mt-2 text-sm text-wo-text">{artifact.scope}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-wo-text-tertiary">Size</p>
            <p className="mt-2 text-sm text-wo-text">{formatSize(artifact.size)}</p>
          </div>
        </div>

        {artifact.previewLines && artifact.previewLines.length > 0 && (
          <div className="rounded-lg border border-wo-border bg-wo-bg px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-wo-text-tertiary">Structured Preview</p>
            <div className="mt-2 space-y-1">
              {artifact.previewLines.map((line) => (
                <p key={line} className="font-mono text-xs text-wo-text-secondary">{line}</p>
              ))}
            </div>
          </div>
        )}

        {artifact.kind === "plugin" && typeof artifact.pluginEnabled === "boolean" && artifact.pluginId && (
          <div className="rounded-lg border border-wo-border bg-wo-bg px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{pluginToggleTitle}</p>
                <p className="mt-1 text-xs text-wo-text-tertiary">
                  {pluginToggleDescription}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={artifact.pluginEnabled}
                onClick={() => onTogglePlugin(!artifact.pluginEnabled)}
                disabled={toggling}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  artifact.pluginEnabled ? "bg-wo-accent" : "bg-wo-bg-subtle"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                    artifact.pluginEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {draftableInstruction && onOpenInstructionStudio && (
          <div className="rounded-lg border border-wo-border bg-wo-bg px-3 py-3">
            <p className="text-sm font-medium">Instruction Studio</p>
            <p className="mt-1 text-xs text-wo-text-tertiary">
              Open a full-screen drafting flow with chat on the left and a live rendered preview on the right.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={onOpenInstructionStudio}
                className="rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
              >
                Open Instruction Studio
              </button>
            </div>
          </div>
        )}

        {deletableSkill && onOpenSkillStudio && (
          <div className="rounded-lg border border-wo-border bg-wo-bg px-3 py-3">
            <p className="text-sm font-medium">Skill Studio</p>
            <p className="mt-1 text-xs text-wo-text-tertiary">
              Open the full-screen skill builder to refine `SKILL.md`, scripts, and package structure together.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={onOpenSkillStudio}
                className="rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
              >
                Open Skill Studio
              </button>
            </div>
          </div>
        )}

        {deletableSkill && (
          <div className="rounded-lg border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.04)] px-3 py-3">
            <p className="text-sm font-medium text-wo-text">Delete Skill</p>
            <p className="mt-1 text-xs text-wo-text-tertiary">
              This removes the entire skill folder, not just `SKILL.md`. Use this when the workflow is obsolete.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={onCancelDelete}
                    disabled={deletingSkill}
                    className="rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmDelete}
                    disabled={deletingSkill}
                    className="rounded-md bg-wo-danger px-3 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {deletingSkill ? "Deleting..." : "Delete Skill"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={deletingSkill}
                  className="rounded-md border border-[rgba(220,38,38,0.25)] px-3 py-2 text-xs font-medium text-wo-danger hover:bg-[rgba(220,38,38,0.06)] transition-colors disabled:opacity-50"
                >
                  Delete Skill
                </button>
              )}
            </div>
          </div>
        )}

        {artifact.path && (
          <div className="rounded-lg border border-wo-border bg-wo-bg px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-wo-text-tertiary">Path</p>
            <p className="mt-2 break-all font-mono text-xs text-wo-text-secondary">{artifact.path}</p>
          </div>
        )}

        {artifact.diagnostics.length > 0 && (
          <div className="rounded-lg border border-[rgba(217,119,6,0.2)] bg-[rgba(217,119,6,0.06)] px-3 py-2">
            {artifact.diagnostics.map((diagnostic) => (
              <p key={`${diagnostic.level}-${diagnostic.message}`} className="text-xs text-wo-text-secondary">
                {diagnostic.message}
              </p>
            ))}
          </div>
        )}

        {artifact.path ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-wo-text-tertiary">
                {artifact.modifiedAt ? `Updated ${new Date(artifact.modifiedAt).toLocaleString()}` : "Not created yet"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => ipc.openInFinder(parentPath(artifact.path!))}
                  className="rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
                >
                  Open Folder
                </button>
                {!artifact.exists && artifact.starterTemplate && (
                  <button
                    type="button"
                    onClick={() => setDraft(artifact.starterTemplate ?? "")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors"
                  >
                    <WandSparkles size={12} />
                    Use Starter
                  </button>
                )}
                {artifact.editable && (
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={!dirty || saving}
                    className="flex items-center gap-1.5 rounded-md bg-wo-accent px-3 py-2 text-xs font-medium text-white hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
                  >
                    <Save size={12} />
                    {artifact.exists ? "Save" : "Create"}
                  </button>
                )}
              </div>
            </div>

            {(artifact.groupLabel || artifact.supportedClis.length > 1) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-wo-border bg-wo-bg px-3 py-2">
                {artifact.groupLabel && (
                  <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-wo-text-secondary">
                    {artifact.groupLabel}
                  </span>
                )}
                {artifact.supportedClis.length > 1 && artifact.supportedClis.map((supportedCli) => (
                  <span
                    key={supportedCli}
                    className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-wo-text-tertiary"
                  >
                    {cliChipLabel(supportedCli)}
                  </span>
                ))}
              </div>
            )}

            {saveError && <p className="text-sm text-wo-danger">{saveError}</p>}

            <DocumentEditor
              title={`${artifact.name} · ${cli.toUpperCase()}`}
              path={artifact.path}
              draft={draft}
              onChange={setDraft}
              onSave={onSave}
              saving={saving}
              loading={fileLoading}
              saveDisabled={!dirty}
              editable={artifact.editable}
              exists={artifact.exists}
              error={saveError}
              actions={editorActions}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-wo-border px-4 py-8 text-center text-sm text-wo-text-tertiary">
            <FileText size={18} className="mx-auto mb-2" />
            This artifact is managed at runtime and cannot be edited on disk.
          </div>
        )}
      </div>
    </section>
  );
}

export function AgentContextPanel({
  workspaces,
  activeWorkspace,
  selectedCli,
  initialIntent = null,
}: AgentContextPanelProps) {
  const [cli, setCli] = useState<AICli>(selectedCli);
  const [workspaceId, setWorkspaceId] = useState(activeWorkspace?.id ?? workspaces[0]?.id ?? "");
  const [view, setView] = useState<AgentContextView>("overview");
  const [showOtherClis, setShowOtherClis] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedCapabilityGroupKey, setSelectedCapabilityGroupKey] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<AgentContextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creatingArtifactId, setCreatingArtifactId] = useState<string | null>(null);
  const [deleteConfirmSkillId, setDeleteConfirmSkillId] = useState<string | null>(null);
  const [pendingArtifactPath, setPendingArtifactPath] = useState<string | null>(null);
  const [skillStudio, setSkillStudio] = useState<SkillStudioState | null>(null);
  const [instructionStudioOpen, setInstructionStudioOpen] = useState(false);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  const { projects } = useProjects(selectedWorkspace?.id ?? null);
  const [projectId, setProjectId] = useState<string>("");
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const selectedProjectRecord = selectedProject ?? null;
  const { snapshot, loading, saving, toggling, refresh, readFile, saveFile, deleteSkill, setPluginEnabled } = useAgentContext({
    cli,
    workspacePath: selectedWorkspace?.path ?? null,
    projectPath: selectedProjectRecord?.localPath ?? null,
  });

  useEffect(() => {
    setCli(selectedCli);
  }, [selectedCli]);

  useEffect(() => {
    if (!initialIntent) return;
    setCli(initialIntent.cli);
    if (initialIntent.workspaceId) setWorkspaceId(initialIntent.workspaceId);
    setProjectId(initialIntent.projectId ?? "");
    if (initialIntent.view) {
      setView(initialIntent.view);
    } else if (initialIntent.artifactPath?.endsWith("SKILL.md")) {
      setView("capabilities");
    } else if (initialIntent.artifactPath?.includes("/rules/") || initialIntent.artifactPath?.endsWith(".rules")) {
      setView("permissions");
    } else if (initialIntent.artifactPath) {
      setView("behavior");
    }
  }, [initialIntent]);

  useEffect(() => {
    if (!selectedWorkspace) return;
    if (projects.some((project) => project.id === projectId)) return;
    setProjectId("");
  }, [projectId, projects, selectedWorkspace]);

  const allArtifacts = useMemo(() => snapshot?.artifacts ?? [], [snapshot]);
  const relevantArtifacts = useMemo(
    () => (showOtherClis ? allArtifacts : allArtifacts.filter((artifact) => artifact.supportedClis.includes(cli))),
    [allArtifacts, cli, showOtherClis]
  );
  const cliScopedArtifacts = useMemo(
    () => allArtifacts.filter((artifact) => artifact.supportedClis.includes(cli)),
    [allArtifacts, cli]
  );
  const missingRecommendedFiles = useMemo(
    () => cliScopedArtifacts.filter((artifact) => artifact.kind !== "plugin" && artifact.status === "missing" && artifact.recommended && artifact.editable),
    [cliScopedArtifacts]
  );
  const behaviorArtifacts = useMemo(
    () => relevantArtifacts.filter((artifact) => ["runtime", "global", "workspace", "repo"].includes(artifact.lane)),
    [relevantArtifacts]
  );
  const permissionArtifacts = useMemo(
    () => relevantArtifacts.filter((artifact) => artifact.lane === "permission" || artifact.kind === "config"),
    [relevantArtifacts]
  );
  const capabilityArtifacts = useMemo(
    () => relevantArtifacts.filter((artifact) => artifact.lane === "capability"),
    [relevantArtifacts]
  );
  const recommendedPluginArtifacts = useMemo(
    () => cliScopedArtifacts.filter((artifact) => artifact.lane === "capability" && artifact.kind === "plugin" && artifact.recommended),
    [cliScopedArtifacts]
  );
  const actionableRecommendedPlugins = useMemo(
    () => recommendedPluginArtifacts.filter((artifact) => artifact.pluginEnabled !== true),
    [recommendedPluginArtifacts]
  );
  const capabilityGroups = useMemo(() => groupCapabilities(capabilityArtifacts), [capabilityArtifacts]);
  const activeCapabilityGroup = useMemo(() => {
    if (capabilityGroups.length === 0) return null;
    return capabilityGroups.find((group) => group.key === selectedCapabilityGroupKey) ?? capabilityGroups[0];
  }, [capabilityGroups, selectedCapabilityGroupKey]);
  const visibleCapabilityArtifacts = activeCapabilityGroup?.items ?? [];
  const detailArtifacts = useMemo(() => {
    if (view === "behavior") return behaviorArtifacts;
    if (view === "permissions") return permissionArtifacts;
    if (view === "capabilities") return visibleCapabilityArtifacts;
    return [];
  }, [behaviorArtifacts, permissionArtifacts, view, visibleCapabilityArtifacts]);
  const selectedArtifact = detailArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? detailArtifacts[0] ?? null;

  useEffect(() => {
    if (selectedArtifact || detailArtifacts.length === 0) return;
    const preferred = detailArtifacts.find((artifact) => artifact.path && artifact.editable)
      ?? detailArtifacts.find((artifact) => artifact.path)
      ?? detailArtifacts[0];
    setSelectedArtifactId(preferred.id);
  }, [detailArtifacts, selectedArtifact]);

  useEffect(() => {
    if (!initialIntent?.artifactPath || detailArtifacts.length === 0) return;
    const match = detailArtifacts.find((artifact) => artifact.path === initialIntent.artifactPath);
    if (match) setSelectedArtifactId(match.id);
  }, [detailArtifacts, initialIntent?.artifactPath]);

  useEffect(() => {
    if (!pendingArtifactPath || !snapshot) return;
    const match = snapshot.artifacts.find((artifact) => artifact.path === pendingArtifactPath);
    if (!match) return;
    setView(match.kind === "skill" ? "capabilities" : match.lane === "permission" ? "permissions" : "behavior");
    setSelectedArtifactId(match.id);
    setPendingArtifactPath(null);
  }, [pendingArtifactPath, snapshot]);

  useEffect(() => {
    if (capabilityGroups.length === 0) {
      setSelectedCapabilityGroupKey(null);
      return;
    }
    if (selectedCapabilityGroupKey && capabilityGroups.some((group) => group.key === selectedCapabilityGroupKey)) return;
    setSelectedCapabilityGroupKey(capabilityGroups[0].key);
  }, [capabilityGroups, selectedCapabilityGroupKey]);

  useEffect(() => {
    if (view !== "capabilities" || !selectedArtifact?.groupKey) return;
    if (selectedArtifact.groupKey === selectedCapabilityGroupKey) return;
    setSelectedCapabilityGroupKey(selectedArtifact.groupKey);
  }, [selectedArtifact?.groupKey, selectedCapabilityGroupKey, view]);

  useEffect(() => {
    let cancelled = false;

    async function loadFile() {
      if (!selectedArtifact?.path) {
        setSelectedFile(null);
        setDraft("");
        setSaveError(null);
        setFileLoading(false);
        return;
      }
      setFileLoading(true);
      setSaveError(null);
      try {
        const file = await readFile(selectedArtifact.path);
        if (cancelled) return;
        setSelectedFile(file);
        setDraft(file.content || (selectedArtifact.starterTemplate ?? ""));
      } finally {
        if (!cancelled) setFileLoading(false);
      }
    }

    loadFile();
    return () => {
      cancelled = true;
    };
  }, [readFile, selectedArtifact?.path, selectedArtifact?.fingerprint, selectedArtifact?.starterTemplate]);

  useEffect(() => {
    setDeleteConfirmSkillId(null);
    setInstructionStudioOpen(false);
  }, [selectedArtifact?.id]);

  const counts = useMemo(() => ({
    active: relevantArtifacts.filter((artifact) => artifact.status === "active").length,
    missingRecommended: missingRecommendedFiles.length + actionableRecommendedPlugins.length,
    capabilityGroups: capabilityGroups.length,
    editable: relevantArtifacts.filter((artifact) => artifact.path && artifact.editable).length,
  }), [actionableRecommendedPlugins.length, capabilityGroups.length, missingRecommendedFiles.length, relevantArtifacts]);

  const handleSave = async (artifact = selectedArtifact, content = draft) => {
    if (!artifact?.path) return;
    setSaveError(null);
    try {
      const next = await saveFile(artifact.path, content);
      if (artifact.id === selectedArtifact?.id) {
        setSelectedFile(next);
        setDraft(next.content);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save file");
    }
  };

  const handleCreateMissing = async (artifact: AgentContextArtifact) => {
    if (!artifact.path) return;
    setCreatingArtifactId(artifact.id);
    try {
      await handleSave(artifact, artifact.starterTemplate ?? "");
      setSelectedArtifactId(artifact.id);
    } finally {
      setCreatingArtifactId(null);
    }
  };

  const handleDeleteSkill = async () => {
    if (!selectedArtifact?.path || !isUserManagedSkill(selectedArtifact)) return;
    if (deleteConfirmSkillId !== selectedArtifact.id) {
      setDeleteConfirmSkillId(selectedArtifact.id);
      return;
    }

    setSaveError(null);
    try {
      await deleteSkill(selectedArtifact.path);
      setDeleteConfirmSkillId(null);
      setSelectedArtifactId(null);
      setSelectedFile(null);
      setDraft("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to delete skill");
    }
  };

  const editorActions = useMemo<DocumentEditorAction[]>(() => [], []);

  const handleSetPluginEnabled = async (artifact: AgentContextArtifact, enabled: boolean) => {
    if (!artifact.pluginId) return;
    setSaveError(null);
    try {
      const next = await setPluginEnabled(artifact.pluginId, enabled);
      if (artifact.id === selectedArtifact?.id || selectedArtifact?.path === artifact.path) {
        setSelectedFile(next);
        setDraft(next.content);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to update plugin");
    }
  };

  const handleTogglePlugin = async (enabled: boolean) => {
    if (!selectedArtifact) return;
    await handleSetPluginEnabled(selectedArtifact, enabled);
  };

  const openSkillStudioForCreate = (scopeOverride?: SkillScope) => {
    const fallbackScope: SkillScope = selectedProjectRecord ? "repo" : selectedWorkspace ? "workspace" : "global";
    setSkillStudio({
      mode: "create",
      initialScope: scopeOverride ?? fallbackScope,
      initialSkillName: "",
      initialSkillFilePath: null,
    });
  };

  const openSkillStudioForEdit = () => {
    if (!selectedArtifact?.path || !isUserManagedSkill(selectedArtifact)) return;
    const skillScope: SkillScope = selectedArtifact.scope === "workspace"
      ? "workspace"
      : selectedArtifact.scope === "global"
        ? "global"
        : "repo";
    setSkillStudio({
      mode: "edit",
      initialScope: skillScope,
      initialSkillName: selectedArtifact.name,
      initialSkillFilePath: selectedArtifact.path,
    });
  };

  const openInstructionStudio = () => {
    if (!selectedArtifact?.path || selectedArtifact.kind !== "instruction") return;
    setInstructionStudioOpen(true);
  };

  const handleSkillStudioSaved = async (skillPackage: SkillPackage) => {
    await refresh();
    setPendingArtifactPath(skillPackage.skillFilePath);
  };

  const handleInstructionStudioSaved = async (file: AgentContextFile) => {
    await refresh();
    setSelectedFile(file);
    setDraft(file.content);
    setPendingArtifactPath(file.path);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Agent Context</h3>
          <p className="mt-1 text-sm text-wo-text-secondary">
            Understand the stack in order: overview first, then behavior, permissions, and capabilities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-wo-text-secondary">
            <input
              type="checkbox"
              checked={showOtherClis}
              onChange={(event) => setShowOtherClis(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-wo-border bg-wo-bg text-wo-accent focus:ring-wo-accent/40"
            />
            Show other CLI artifacts
          </label>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-wo-border px-3 py-2 text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-wo-text-secondary">CLI</span>
          <select
            value={cli}
            onChange={(event) => setCli(event.target.value as AICli)}
            className="h-9 w-full rounded-lg border border-wo-border bg-wo-bg px-3 text-sm text-wo-text focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-wo-text-secondary">Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            className="h-9 w-full rounded-lg border border-wo-border bg-wo-bg px-3 text-sm text-wo-text focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-wo-text-secondary">Project</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="h-9 w-full rounded-lg border border-wo-border bg-wo-bg px-3 text-sm text-wo-text focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
          >
            <option value="">Workspace only</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="inline-flex rounded-xl border border-wo-border bg-wo-bg-subtle p-1">
        {views.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setView(entry.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              view === entry.id ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {snapshot?.warnings.length ? (
        <div className="rounded-xl border border-[rgba(217,119,6,0.2)] bg-[rgba(217,119,6,0.06)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-wo-warning">Warnings</p>
          <div className="mt-2 space-y-1 text-sm text-wo-text-secondary">
            {snapshot.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      ) : null}

      {view === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-wo-text-tertiary">Active</p>
              <p className="mt-2 text-2xl font-semibold">{counts.active}</p>
            </div>
            <div className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-wo-text-tertiary">Needs Setup</p>
              <p className="mt-2 text-2xl font-semibold">{counts.missingRecommended}</p>
            </div>
            <div className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-wo-text-tertiary">Capability Groups</p>
              <p className="mt-2 text-2xl font-semibold">{counts.capabilityGroups}</p>
            </div>
            <div className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-wo-text-tertiary">Editable Files</p>
              <p className="mt-2 text-2xl font-semibold">{counts.editable}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <h4 className="text-sm font-semibold">How To Read This</h4>
              <div className="mt-3 space-y-3 text-sm text-wo-text-secondary">
                <p><strong className="text-wo-text">1. Global</strong> sets machine-wide defaults and permissions.</p>
                <p><strong className="text-wo-text">2. Workspace</strong> adds org-wide policy for repos under the workspace root.</p>
                <p><strong className="text-wo-text">3. Repo</strong> is the most specific behavior layer and where local overrides belong.</p>
                <p><strong className="text-wo-text">4. Permissions</strong> gate what the agent may do even when instructions request it.</p>
              </div>
            </section>

            <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <h4 className="text-sm font-semibold">Quick Setup</h4>
              <p className="mt-1 text-xs text-wo-text-tertiary">Enable recommended plugins and create missing files without leaving WorkOS.</p>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">Recommended Plugins</p>
                    <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                      {recommendedPluginArtifacts.length}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {recommendedPluginArtifacts.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-wo-border px-3 py-4 text-sm text-wo-text-tertiary">
                        No plugin recommendations for this CLI.
                      </div>
                    ) : (
                      recommendedPluginArtifacts.map((artifact) => (
                        <div key={artifact.id} className="rounded-lg border border-wo-border bg-wo-bg px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{artifact.name}</p>
                              <p className="mt-1 text-xs text-wo-text-secondary">{artifact.description}</p>
                              <p className="mt-2 text-[11px] text-wo-text-tertiary">
                                {artifact.pluginEnabled ? "Enabled" : artifact.pluginConfigured ? "Configured but disabled" : "Not configured yet"}
                              </p>
                            </div>
                            {artifact.pluginEnabled ? (
                              <span className="rounded-full bg-[rgba(16,185,129,0.12)] px-2 py-1 text-[11px] font-medium text-[rgb(5,150,105)]">
                                Enabled
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetPluginEnabled(artifact, true)}
                                disabled={toggling}
                                className="inline-flex items-center gap-1 rounded-md border border-wo-border px-2 py-1 text-[11px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50"
                              >
                                <WandSparkles size={11} />
                                Enable
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">Missing Files</p>
                    <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                      {missingRecommendedFiles.length}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {missingRecommendedFiles.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-wo-border px-3 py-4 text-sm text-wo-text-tertiary">
                        No missing recommended files for this selection.
                      </div>
                    ) : (
                      missingRecommendedFiles.map((artifact) => (
                        <div key={artifact.id} className="rounded-lg border border-wo-border bg-wo-bg px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{artifact.name}</p>
                              <p className="mt-1 text-xs text-wo-text-secondary">{artifact.description}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCreateMissing(artifact)}
                              disabled={creatingArtifactId === artifact.id}
                              className="inline-flex items-center gap-1 rounded-md border border-wo-border px-2 py-1 text-[11px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors disabled:opacity-50"
                            >
                              <FilePlus2 size={11} />
                              {creatingArtifactId === artifact.id ? "Creating..." : "Create"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {view === "behavior" && snapshot && (
        <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.35fr)]">
          <div className="space-y-4">
            <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <h4 className="text-sm font-semibold">Behavior Stack</h4>
              <p className="mt-1 text-sm text-wo-text-secondary">
                Read this top to bottom. Lower scopes are more specific than the ones above them. Select any cell to inspect or edit it on the right.
              </p>
            </section>
            <AgentContextLanes
              lanes={snapshot.lanes}
              stacked
              includeLaneIds={["runtime", "global", "workspace", "repo"]}
              selectedArtifactId={selectedArtifact?.id ?? null}
              onSelectArtifact={(artifact) => setSelectedArtifactId(artifact.id)}
              onCreateMissing={handleCreateMissing}
              creatingArtifactId={creatingArtifactId}
            />
          </div>
          <ArtifactDetail
            artifact={selectedArtifact}
            cli={cli}
            file={selectedFile}
            draft={draft}
            setDraft={setDraft}
            fileLoading={fileLoading}
            saving={saving}
            toggling={toggling}
            saveError={saveError}
            editorActions={editorActions}
            deletingSkill={saving && deleteConfirmSkillId === selectedArtifact?.id}
            confirmDelete={deleteConfirmSkillId === selectedArtifact?.id}
            onConfirmDelete={handleDeleteSkill}
            onCancelDelete={() => setDeleteConfirmSkillId(null)}
            onOpenSkillStudio={isUserManagedSkill(selectedArtifact) ? openSkillStudioForEdit : null}
            onOpenInstructionStudio={selectedArtifact?.kind === "instruction" ? openInstructionStudio : null}
            onSave={() => handleSave()}
            onTogglePlugin={handleTogglePlugin}
          />
        </div>
      )}

      {view === "permissions" && (
        <div className="space-y-4">
          <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
            <h4 className="text-sm font-semibold">Permissions And Trust</h4>
            <p className="mt-1 text-sm text-wo-text-secondary">
              Rules files approve command prefixes, while config and trust shape what Codex can do and where it can do it.
            </p>
          </section>
          <div className="space-y-4">
            <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Permission Artifacts</h4>
                  <p className="mt-1 text-xs text-wo-text-tertiary">
                    Choose a permission source to inspect. The detailed content stays below.
                  </p>
                </div>
                <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                  {permissionArtifacts.length}
                </span>
              </div>
              <div className="mt-4">
                <ArtifactTabs
                  artifacts={permissionArtifacts}
                  selectedArtifactId={selectedArtifact?.id ?? null}
                  onSelect={setSelectedArtifactId}
                  compact
                />
              </div>
            </section>
            <ArtifactDetail
              artifact={selectedArtifact}
              cli={cli}
              file={selectedFile}
              draft={draft}
              setDraft={setDraft}
              fileLoading={fileLoading}
              saving={saving}
              toggling={toggling}
              saveError={saveError}
              editorActions={editorActions}
              deletingSkill={saving && deleteConfirmSkillId === selectedArtifact?.id}
              confirmDelete={deleteConfirmSkillId === selectedArtifact?.id}
              onConfirmDelete={handleDeleteSkill}
              onCancelDelete={() => setDeleteConfirmSkillId(null)}
              onOpenSkillStudio={isUserManagedSkill(selectedArtifact) ? openSkillStudioForEdit : null}
              onOpenInstructionStudio={selectedArtifact?.kind === "instruction" ? openInstructionStudio : null}
              onSave={() => handleSave()}
              onTogglePlugin={handleTogglePlugin}
            />
          </div>
        </div>
      )}

      {view === "capabilities" && (
        <div className="space-y-4">
          <section className="rounded-xl border border-wo-border bg-wo-bg-elevated p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold">Capability Library</h4>
                <p className="mt-1 text-xs text-wo-text-tertiary">
                  Plugins enable larger capability surfaces. Skills are on-demand helpers. Select any item to inspect it on the right.
                </p>
                {cli === "codex" && recommendedPluginArtifacts.length > 0 && (
                  <p className="mt-2 text-xs text-wo-text-secondary">
                    Recommended for Codex setups: {recommendedPluginArtifacts.map((artifact) => artifact.name).join(", ")}.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-wo-bg-subtle px-2 py-0.5 text-[10px] font-semibold text-wo-text-secondary">
                  {capabilityArtifacts.length} visible
                </span>
                <button
                  type="button"
                  onClick={() => openSkillStudioForCreate()}
                  className="rounded-md border border-wo-border px-3 py-1.5 text-[11px] font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors"
                >
                  Create Skill
                </button>
              </div>
            </div>

            {capabilityGroups.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-wo-border px-4 py-8 text-sm text-wo-text-tertiary">
                No capabilities are relevant for this CLI in the current selection.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">Providers</p>
                  <GroupTabs
                    groups={capabilityGroups}
                    selectedKey={activeCapabilityGroup?.key ?? null}
                    onSelect={setSelectedCapabilityGroupKey}
                  />
                </div>
                {activeCapabilityGroup && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">
                        {activeCapabilityGroup.label}
                      </p>
                      <span className="text-[11px] text-wo-text-tertiary">
                        {activeCapabilityGroup.items.filter((item) => item.kind === "plugin").length} plugins · {activeCapabilityGroup.items.filter((item) => item.kind === "skill").length} skills
                      </span>
                    </div>
                    <ArtifactTabs
                      artifacts={visibleCapabilityArtifacts}
                      selectedArtifactId={selectedArtifact?.id ?? null}
                      onSelect={setSelectedArtifactId}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
          <ArtifactDetail
            artifact={selectedArtifact}
            cli={cli}
            file={selectedFile}
            draft={draft}
            setDraft={setDraft}
            fileLoading={fileLoading}
            saving={saving}
            toggling={toggling}
            saveError={saveError}
            editorActions={editorActions}
            deletingSkill={saving && deleteConfirmSkillId === selectedArtifact?.id}
            confirmDelete={deleteConfirmSkillId === selectedArtifact?.id}
            onConfirmDelete={handleDeleteSkill}
            onCancelDelete={() => setDeleteConfirmSkillId(null)}
            onOpenSkillStudio={isUserManagedSkill(selectedArtifact) ? openSkillStudioForEdit : null}
            onOpenInstructionStudio={selectedArtifact?.kind === "instruction" ? openInstructionStudio : null}
            onSave={() => handleSave()}
            onTogglePlugin={handleTogglePlugin}
          />
        </div>
      )}

      <SkillStudioModal
        open={skillStudio != null}
        cli={cli}
        workspace={selectedWorkspace}
        project={selectedProjectRecord as Project | null}
        mode={skillStudio?.mode ?? "create"}
        initialScope={skillStudio?.initialScope ?? "repo"}
        initialSkillName={skillStudio?.initialSkillName ?? ""}
        initialSkillFilePath={skillStudio?.initialSkillFilePath ?? null}
        onClose={() => setSkillStudio(null)}
        onSaved={handleSkillStudioSaved}
      />

      {selectedArtifact?.path && (
        <InstructionStudioModal
          open={instructionStudioOpen}
          cli={cli}
          title={selectedArtifact.name}
          filePath={selectedArtifact.path}
          initialContent={draft}
          onClose={() => setInstructionStudioOpen(false)}
          onSaved={handleInstructionStudioSaved}
        />
      )}
    </div>
  );
}
