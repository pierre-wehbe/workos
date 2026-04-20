import { useState, useRef, useEffect } from "react";
import { Bot, ChevronDown, ChevronRight, Loader2, MessageCircle, Send, Trash2, User } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Discussion, DiscussionMessage } from "../lib/pr-types";
import { ipc } from "../lib/ipc";

interface DiscussionPanelProps {
  prId: string;
  selectedCli: string;
  discussions: Discussion[];
  onRefresh: () => void;
}

export function DiscussionPanel({ prId, selectedCli, discussions, onRefresh }: DiscussionPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = async (discussionId: string) => {
    if (!input.trim() || sending) return;
    const question = input.trim();
    setInput("");
    setSending(true);

    // Save user message
    await ipc.addDiscussionMessage({ discussionId, role: "user", content: question });

    // Build conversation history for context
    const disc = discussions.find((d) => d.id === discussionId);
    const history = disc?.messages.map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`).join("\n\n") ?? "";
    const selectedText = disc?.selectedText ?? "";
    const context = disc?.context ?? "";

    const prompt = `You are answering questions about a pull request. Here is the context:

Selected text from the PR: "${selectedText}"
${context ? `Section: ${context}` : ""}

${history ? `Previous conversation:\n${history}\n\n` : ""}User's new question: ${question}

Provide a concise, helpful answer.`;

    const result = await ipc.runAgentPrompt(selectedCli, prompt);
    const answer = result.ok ? result.output : "Sorry, I couldn't get a response. Please try again.";

    await ipc.addDiscussionMessage({ discussionId, role: "assistant", content: answer, cli: selectedCli });
    setSending(false);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await ipc.deleteDiscussion(id);
    if (expandedId === id) setExpandedId(null);
    onRefresh();
  };

  if (discussions.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        <MessageCircle size={13} className="text-wo-accent" />
        Discussions ({discussions.length})
      </h3>
      <div className="space-y-1.5">
        {discussions.map((disc) => {
          const isExpanded = expandedId === disc.id;
          const lastMsg = disc.messages[disc.messages.length - 1];
          return (
            <div key={disc.id} className="rounded-lg border border-wo-border overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : disc.id)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-wo-bg-subtle/50 transition-colors"
              >
                {isExpanded ? <ChevronDown size={11} className="mt-0.5 shrink-0 text-wo-text-tertiary" /> : <ChevronRight size={11} className="mt-0.5 shrink-0 text-wo-text-tertiary" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-wo-text-secondary truncate">
                    "{disc.selectedText.slice(0, 80)}{disc.selectedText.length > 80 ? "..." : ""}"
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-wo-text-tertiary">{disc.messages.length} message{disc.messages.length !== 1 ? "s" : ""}</span>
                    <span className="text-[10px] text-wo-text-tertiary">{new Date(disc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(disc.id); }}
                  className="p-1 rounded text-wo-text-tertiary hover:text-wo-danger transition-colors shrink-0"
                  title="Delete discussion"
                >
                  <Trash2 size={11} />
                </button>
              </button>

              {isExpanded && (
                <div className="border-t border-wo-border">
                  {/* Selected text context */}
                  <div className="px-3 py-2 bg-wo-bg-subtle/50 border-b border-wo-border">
                    <p className="text-[10px] text-wo-text-tertiary mb-1">Selected text:</p>
                    <p className="text-xs text-wo-text-secondary font-mono whitespace-pre-wrap">{disc.selectedText}</p>
                  </div>

                  {/* Messages */}
                  <div className="divide-y divide-wo-border/50">
                    {disc.messages.map((msg) => (
                      <div key={msg.id} className={`px-3 py-2 ${msg.role === "assistant" ? "bg-wo-accent/3" : ""}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {msg.role === "user" ? (
                            <User size={10} className="text-wo-text-tertiary" />
                          ) : (
                            <Bot size={10} className="text-wo-accent" />
                          )}
                          <span className="text-[10px] font-semibold text-wo-text-tertiary">
                            {msg.role === "user" ? "You" : msg.cli ?? "AI"}
                          </span>
                          <span className="text-[10px] text-wo-text-tertiary">
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        {msg.role === "assistant" ? (
                          <div className="prose-xs prose-wo">
                            <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                          </div>
                        ) : (
                          <p className="text-xs text-wo-text-secondary">{msg.content}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Follow-up input */}
                  <div className="flex gap-2 p-2 border-t border-wo-border">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask a follow-up..."
                      disabled={sending}
                      className="flex-1 h-8 px-2.5 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 disabled:opacity-50"
                      onKeyDown={(e) => { if (e.key === "Enter") handleSend(disc.id); }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSend(disc.id)}
                      disabled={!input.trim() || sending}
                      className="h-8 px-3 rounded-md bg-wo-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
