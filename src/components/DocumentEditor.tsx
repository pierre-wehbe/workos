import { useMemo, useState } from "react";
import { Bot, Eye, FileText, PencilLine, Save, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface DocumentEditorAction {
  id: string;
  label: string;
  hint?: string;
  loading?: boolean;
  onClick: () => void;
}

interface DocumentEditorProps {
  title: string;
  path: string;
  draft: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  loading?: boolean;
  saveDisabled?: boolean;
  editable?: boolean;
  exists?: boolean;
  error?: string | null;
  actions?: DocumentEditorAction[];
}

type EditorMode = "write" | "preview";

export function DocumentEditor({
  title,
  path,
  draft,
  onChange,
  onSave,
  saving = false,
  loading = false,
  saveDisabled = false,
  editable = true,
  exists = true,
  error = null,
  actions = [],
}: DocumentEditorProps) {
  const [mode, setMode] = useState<EditorMode>("write");
  const isMarkdown = useMemo(() => path.toLowerCase().endsWith(".md"), [path]);

  return (
    <div className="rounded-xl border border-wo-border bg-wo-bg-elevated overflow-hidden">
      <div className="border-b border-wo-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="mt-1 break-all font-mono text-xs text-wo-text-tertiary">{path}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-wo-border bg-wo-bg-subtle p-0.5">
              <button
                type="button"
                onClick={() => setMode("write")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  mode === "write" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                }`}
              >
                <PencilLine size={12} />
                Write
              </button>
              <button
                type="button"
                onClick={() => setMode("preview")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  mode === "preview" ? "bg-wo-accent text-white" : "text-wo-text-secondary hover:bg-wo-bg hover:text-wo-text"
                }`}
              >
                <Eye size={12} />
                Preview
              </button>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={!editable || saveDisabled || saving || loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-wo-accent px-3 py-2 text-xs font-medium text-white hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
            >
              <Save size={12} />
              {saving ? "Saving..." : exists ? "Save" : "Create"}
            </button>
          </div>
        </div>

        {actions.length > 0 && (
          <div className="mt-3 rounded-lg border border-wo-border bg-wo-bg px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-wo-text-tertiary">Draft Assist</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.loading || loading}
                  title={action.hint}
                  className="inline-flex items-center gap-1.5 rounded-md border border-wo-border px-2.5 py-1.5 text-[11px] font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
                >
                  {action.id.includes("skill") ? <Sparkles size={11} /> : <Bot size={11} />}
                  {action.loading ? "Working..." : action.label}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {actions.map((action) => (
                <p key={`${action.id}-hint`} className="text-xs text-wo-text-tertiary">
                  <span className="font-medium text-wo-text">{action.label}:</span> {action.hint}
                </p>
              ))}
              <p className="text-xs text-wo-text-tertiary">
                Draft assists never save automatically. Review the returned draft, then save when it looks right.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-wo-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="px-4 py-10 text-sm text-wo-text-tertiary">Loading document…</div>
      ) : mode === "write" ? (
        <textarea
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          readOnly={!editable}
          spellCheck={false}
          className="min-h-[360px] w-full resize-y border-0 bg-wo-bg px-4 py-4 font-mono text-[12px] leading-5 text-wo-text focus:outline-none focus:ring-0 read-only:cursor-default read-only:bg-wo-bg-subtle"
        />
      ) : (
        <div className="min-h-[360px] bg-wo-bg px-4 py-4">
          {draft.trim() ? (
            isMarkdown ? (
              <div className="prose-sm prose-wo max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-wo-border bg-wo-bg-subtle px-4 py-3 text-xs text-wo-text-secondary">
                {draft}
              </pre>
            )
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-wo-border bg-wo-bg-subtle text-center">
              <FileText size={18} className="mb-2 text-wo-text-tertiary" />
              <p className="text-sm text-wo-text-tertiary">Nothing to preview yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
