import { useEffect, useMemo, useState } from "react";
import { Bot, Eye, FileCode2, Loader2, PencilLine, Send, Sparkles, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AICli, Project, SkillPackage, SkillScope, SkillStudioFile, SkillStudioTarget, Workspace } from "../lib/types";
import { ipc } from "../lib/ipc";
import {
  buildSkillStarterTemplate,
  buildSkillStudioPrompt,
  parseSkillStudioOutput,
  type SkillStudioMessage,
} from "../lib/document-assist";

interface SkillStudioModalProps {
  open: boolean;
  cli: AICli;
  workspace: Workspace | null;
  project: Project | null;
  mode: "create" | "edit";
  initialScope?: SkillScope;
  initialSkillName?: string;
  initialSkillFilePath?: string | null;
  onClose: () => void;
  onSaved: (skillPackage: SkillPackage) => void;
}

type PreviewMode = "preview" | "source";

function slugifySkillName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "new-skill";
}

function studioIntro(mode: "create" | "edit") {
  if (mode === "edit") {
    return "Describe what should change. I will revise the skill package, keep the preview updated, and nothing will save until you confirm.";
  }
  return "Describe the workflow, trigger conditions, and whether helper scripts are useful. I will draft the package and keep the preview on the right.";
}

export function SkillStudioModal({
  open,
  cli,
  workspace,
  project,
  mode,
  initialScope = "repo",
  initialSkillName = "",
  initialSkillFilePath = null,
  onClose,
  onSaved,
}: SkillStudioModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<SkillStudioTarget[]>([]);
  const [scope, setScope] = useState<SkillScope>(initialScope);
  const [skillName, setSkillName] = useState(initialSkillName);
  const [allowScripts, setAllowScripts] = useState(true);
  const [skillMd, setSkillMd] = useState("");
  const [scripts, setScripts] = useState<SkillStudioFile[]>([]);
  const [messages, setMessages] = useState<SkillStudioMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeFile, setActiveFile] = useState<string>("SKILL.md");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");

  const workspacePath = workspace?.path ?? null;
  const projectPath = project?.localPath ?? null;
  const editingExistingSkill = mode === "edit" && Boolean(initialSkillFilePath);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setSaving(false);
      setGenerating(false);
      setError(null);
      setActiveFile("SKILL.md");
      setPreviewMode("preview");
      setInput("");

      try {
        const targetData = await ipc.getSkillStudioTargets({ cli, workspacePath, projectPath });
        if (cancelled) return;
        setTargets(targetData.targets);

        if (editingExistingSkill && initialSkillFilePath) {
          const skillPackage = await ipc.readSkillPackage(initialSkillFilePath, { cli, workspacePath, projectPath });
          if (cancelled) return;
          setScope(skillPackage.scope);
          setSkillName(skillPackage.skillName);
          setSkillMd(skillPackage.skillMd);
          setScripts(skillPackage.scripts);
          setAllowScripts(skillPackage.scripts.length > 0);
        } else {
          const recommendedTarget = targetData.targets.find((target) => target.scope === initialScope && target.available)
            || targetData.targets.find((target) => target.recommended && target.available)
            || targetData.targets.find((target) => target.available)
            || targetData.targets[0];
          const nextName = initialSkillName.trim();
          setScope(recommendedTarget?.scope ?? "global");
          setSkillName(nextName);
          setSkillMd(buildSkillStarterTemplate(nextName || "new-skill"));
          setScripts([]);
          setAllowScripts(true);
        }

        setMessages([{ role: "assistant", content: studioIntro(mode) }]);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to open Skill Studio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cli, editingExistingSkill, initialScope, initialSkillFilePath, initialSkillName, mode, open, projectPath, workspacePath]);

  const availableTargets = useMemo(
    () => targets.filter((target) => target.available),
    [targets]
  );
  const selectedTarget = targets.find((target) => target.scope === scope) ?? null;
  const normalizedSkillName = slugifySkillName(skillName);
  const targetSkillDir = useMemo(() => {
    if (editingExistingSkill && initialSkillFilePath) return initialSkillFilePath.replace(/[/\\]SKILL\.md$/, "");
    if (!selectedTarget?.rootPath) return null;
    return `${selectedTarget.rootPath}/${normalizedSkillName}`;
  }, [editingExistingSkill, initialSkillFilePath, normalizedSkillName, selectedTarget?.rootPath]);

  const previewFiles = useMemo(
    () => [{ path: "SKILL.md", content: skillMd }, ...scripts],
    [scripts, skillMd]
  );
  const activePreview = previewFiles.find((file) => file.path === activeFile) ?? previewFiles[0];

  useEffect(() => {
    if (!activePreview) return;
    if (activePreview.path !== "SKILL.md") setPreviewMode("source");
  }, [activePreview?.path]);

  const handleGenerate = async () => {
    if (!input.trim() || !selectedTarget?.rootPath || generating) return;
    const userMessage = input.trim();
    const nextMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(nextMessages);
    setInput("");
    setGenerating(true);
    setError(null);

    try {
      const result = await ipc.runAgentPrompt(cli, buildSkillStudioPrompt({
        cli,
        scope,
        targetRoot: selectedTarget.rootPath,
        skillName,
        allowScripts,
        currentSkillMd: skillMd,
        currentScripts: scripts,
        messages: nextMessages,
      }));
      if (!result.ok) throw new Error("The selected CLI did not return a valid skill package draft.");
      const parsed = parseSkillStudioOutput(result.output);
      if (!editingExistingSkill && parsed.suggestedName) setSkillName(parsed.suggestedName);
      setSkillMd(parsed.skillMd);
      setScripts(allowScripts ? parsed.scripts : []);
      setMessages([...nextMessages, { role: "assistant", content: parsed.assistantMessage }]);
      setActiveFile("SKILL.md");
      setPreviewMode("preview");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Failed to generate skill draft");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!skillMd.trim()) {
      setError("SKILL.md cannot be empty.");
      return;
    }
    if (!editingExistingSkill && !skillName.trim()) {
      setError("Skill name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const skillPackage = await ipc.saveSkillPackage({
        cli,
        scope,
        workspacePath,
        projectPath,
        skillName,
        skillMd,
        scripts: allowScripts ? scripts : [],
        skillFilePath: editingExistingSkill ? initialSkillFilePath : null,
      });
      onSaved(skillPackage);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save skill package");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 dark:bg-black/60" onClick={onClose}>
      <div
        className="flex h-[min(92vh,980px)] w-[min(1480px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-wo-border bg-wo-bg-elevated shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-wo-border px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Skill Studio</h3>
              <span className="rounded-full bg-wo-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-wo-accent">
                {cli}
              </span>
            </div>
            <p className="mt-1 text-sm text-wo-text-secondary">
              Design a skill package with a live preview, explicit scope, and optional scripts. Nothing saves until you confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-wo-border p-2 text-wo-text-secondary hover:bg-wo-bg-subtle hover:text-wo-text transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(420px,0.82fr)_minmax(0,1.18fr)]">
          <section className="flex min-h-0 flex-col border-r border-wo-border">
            <div className="space-y-4 border-b border-wo-border px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-wo-text-secondary">Skill Name</span>
                  <input
                    value={skillName}
                    onChange={(event) => setSkillName(event.target.value)}
                    disabled={editingExistingSkill || loading}
                    placeholder="new-skill"
                    className="h-10 w-full rounded-lg border border-wo-border bg-wo-bg px-3 text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 disabled:opacity-60"
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-wo-text-secondary">Scope</span>
                  <div className="inline-flex rounded-xl border border-wo-border bg-wo-bg-subtle p-1">
                    {availableTargets.map((target) => (
                      <button
                        key={target.scope}
                        type="button"
                        onClick={() => setScope(target.scope)}
                        disabled={editingExistingSkill || loading}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          scope === target.scope ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                        } disabled:opacity-60`}
                      >
                        {target.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-wo-border bg-wo-bg px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-wo-text-tertiary">Target Location</p>
                    <p className="mt-2 break-all font-mono text-xs text-wo-text-secondary">
                      {targetSkillDir ? `${targetSkillDir}/SKILL.md` : "Select a valid scope to continue."}
                    </p>
                    <p className="mt-2 text-xs text-wo-text-tertiary">{selectedTarget?.description}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-wo-text-secondary">
                    <input
                      type="checkbox"
                      checked={allowScripts}
                      onChange={(event) => setAllowScripts(event.target.checked)}
                      disabled={loading}
                      className="h-3.5 w-3.5 rounded border-wo-border bg-wo-bg text-wo-accent focus:ring-wo-accent/40"
                    />
                    Allow `scripts/`
                  </label>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl border px-4 py-3 ${
                      message.role === "assistant"
                        ? "border-wo-border bg-wo-accent/4"
                        : "border-wo-border bg-wo-bg"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {message.role === "assistant" ? <Bot size={13} className="text-wo-accent" /> : <Sparkles size={13} className="text-wo-text-secondary" />}
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">
                        {message.role === "assistant" ? `${cli} Studio` : "You"}
                      </span>
                    </div>
                    {message.role === "assistant" ? (
                      <div className="prose-sm prose-wo max-w-none">
                        <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                      </div>
                    ) : (
                      <p className="text-sm text-wo-text-secondary">{message.content}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-wo-border px-6 py-5">
              <div className="rounded-2xl border border-wo-border bg-wo-bg px-4 py-4">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Describe the workflow, trigger conditions, guardrails, example commands, or helper scripts you want."
                  disabled={loading || generating}
                  className="min-h-[120px] w-full resize-none border-0 bg-transparent text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-0 disabled:opacity-60"
                />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-wo-text-tertiary">
                    Mention real commands and edge cases. The studio keeps the preview updated but never saves automatically.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!input.trim() || !selectedTarget?.rootPath || loading || generating}
                    className="inline-flex items-center gap-1.5 rounded-md bg-wo-accent px-3 py-2 text-xs font-medium text-white hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
                  >
                    {generating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {generating ? "Drafting..." : "Refine Draft"}
                  </button>
                </div>
              </div>
              {error && (
                <p className="mt-3 text-sm text-wo-danger">{error}</p>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wo-border px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Preview</p>
                <p className="mt-1 text-xs text-wo-text-tertiary">
                  Review the skill package before saving. SKILL.md renders as markdown; scripts stay in source view.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-wo-border bg-wo-bg-subtle p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("preview")}
                    disabled={activePreview?.path !== "SKILL.md"}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      previewMode === "preview" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                    } disabled:opacity-50`}
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
                  onClick={handleSave}
                  disabled={loading || saving || !skillMd.trim() || (!editingExistingSkill && !skillName.trim())}
                  className="inline-flex items-center gap-1.5 rounded-md bg-wo-accent px-3 py-2 text-xs font-medium text-white hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {saving ? "Saving..." : editingExistingSkill ? "Save Skill" : "Create Skill"}
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="w-52 shrink-0 border-r border-wo-border bg-wo-bg-subtle/40 px-3 py-4">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">Files</p>
                <div className="mt-3 space-y-1">
                  {previewFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => {
                        setActiveFile(file.path);
                        if (file.path !== "SKILL.md") setPreviewMode("source");
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        activeFile === file.path ? "bg-wo-accent-soft text-wo-accent" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                      }`}
                    >
                      <FileCode2 size={14} />
                      <span className="truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-sm text-wo-text-tertiary">
                    Loading Skill Studio…
                  </div>
                ) : !activePreview ? (
                  <div className="flex h-full items-center justify-center text-sm text-wo-text-tertiary">
                    No preview available yet.
                  </div>
                ) : activePreview.path === "SKILL.md" && previewMode === "preview" ? (
                  <div className="prose-sm prose-wo max-w-none rounded-2xl border border-wo-border bg-wo-bg px-6 py-6">
                    <Markdown remarkPlugins={[remarkGfm]}>{activePreview.content || "_Empty draft._"}</Markdown>
                  </div>
                ) : (
                  <pre className="min-h-full whitespace-pre-wrap break-words rounded-2xl border border-wo-border bg-wo-bg px-6 py-6 font-mono text-[12px] leading-5 text-wo-text">
                    {activePreview.content || ""}
                  </pre>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
