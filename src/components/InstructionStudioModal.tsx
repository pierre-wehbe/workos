import { useEffect, useState } from "react";
import { Bot, Eye, Loader2, PencilLine, Send, Sparkles, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AICli, AgentContextFile } from "../lib/types";
import { ipc } from "../lib/ipc";
import {
  buildInstructionStudioPrompt,
  parseInstructionStudioOutput,
  type SkillStudioMessage,
} from "../lib/document-assist";

interface InstructionStudioModalProps {
  open: boolean;
  cli: AICli;
  title: string;
  filePath: string;
  initialContent: string;
  onClose: () => void;
  onSaved: (file: AgentContextFile) => void;
}

type PreviewMode = "preview" | "source";

function studioIntro(filePath: string) {
  const basename = filePath.split(/[/\\]/).pop() || filePath;
  if (basename === "AGENTS.md") {
    return "Describe the workflow, constraints, and repo specifics you want captured. I will keep the live draft updated and nothing will save until you confirm.";
  }
  return "Describe what this instruction file should capture. I will revise the live draft on the right and keep save as an explicit step.";
}

export function InstructionStudioModal({
  open,
  cli,
  title,
  filePath,
  initialContent,
  onClose,
  onSaved,
}: InstructionStudioModalProps) {
  const [draft, setDraft] = useState(initialContent);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SkillStudioMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview");

  useEffect(() => {
    if (!open) return;
    setDraft(initialContent);
    setInput("");
    setLoading(false);
    setGenerating(false);
    setSaving(false);
    setError(null);
    setPreviewMode("preview");
    setMessages([{ role: "assistant", content: studioIntro(filePath) }]);
  }, [filePath, initialContent, open]);

  const handleGenerate = async () => {
    if (!input.trim() || generating) return;
    const userMessage = input.trim();
    const nextMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(nextMessages);
    setInput("");
    setGenerating(true);
    setError(null);

    try {
      const result = await ipc.runAgentPrompt(cli, buildInstructionStudioPrompt({
        cli,
        filePath,
        currentContent: draft,
        messages: nextMessages,
      }));
      if (!result.ok) throw new Error("The selected CLI did not return a valid instruction draft.");
      const parsed = parseInstructionStudioOutput(result.output);
      setDraft(parsed.documentContent);
      setMessages([...nextMessages, { role: "assistant", content: parsed.assistantMessage }]);
      setPreviewMode("preview");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Failed to draft document");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const file = await ipc.saveAgentContextFile(filePath, draft);
      onSaved(file);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/35 dark:bg-black/60" onClick={onClose}>
      <div
        className="flex h-[min(92vh,940px)] w-[min(1460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-wo-border bg-wo-bg-elevated shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-wo-border px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Instruction Studio</h3>
              <span className="rounded-full bg-wo-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-wo-accent">
                {cli}
              </span>
            </div>
            <p className="mt-1 text-sm text-wo-text-secondary">
              Refine this instruction file with a chat-driven drafting workflow and a live preview. Nothing saves until you confirm.
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
            <div className="border-b border-wo-border px-6 py-5">
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 break-all font-mono text-xs text-wo-text-tertiary">{filePath}</p>
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
                  placeholder="Describe what should change, what must stay, and any commands, constraints, or style you want preserved."
                  disabled={loading || generating}
                  className="min-h-[120px] w-full resize-none border-0 bg-transparent text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-0 disabled:opacity-60"
                />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-wo-text-tertiary">
                    Be concrete. Mention real commands, directories, failure modes, and review expectations.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!input.trim() || loading || generating}
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
              <div>
                <p className="text-sm font-semibold">Live Preview</p>
                <p className="mt-1 text-xs text-wo-text-tertiary">
                  Preview the rendered markdown or inspect the raw source before saving.
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
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-wo-accent px-3 py-2 text-xs font-medium text-white hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {saving ? "Saving..." : "Save Draft"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {previewMode === "preview" ? (
                <div className="prose-sm prose-wo max-w-none rounded-2xl border border-wo-border bg-wo-bg px-6 py-6">
                  <Markdown remarkPlugins={[remarkGfm]}>{draft || "_Empty draft._"}</Markdown>
                </div>
              ) : (
                <pre className="min-h-full whitespace-pre-wrap break-words rounded-2xl border border-wo-border bg-wo-bg px-6 py-6 font-mono text-[12px] leading-5 text-wo-text">
                  {draft}
                </pre>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
