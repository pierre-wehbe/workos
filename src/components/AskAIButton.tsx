import { useEffect, useState, useCallback, useRef, type RefObject } from "react";
import { Bot, Send, X } from "lucide-react";

interface AskAIButtonProps {
  containerRef: RefObject<HTMLElement | null>;
  onAsk: (selectedText: string, question: string) => void;
}

export function AskAIButton({ containerRef, onAsk }: AskAIButtonProps) {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelectionChange = useCallback(() => {
    if (showInput) return; // Don't update while input is open
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setTimeout(() => {
        if (showInput) return;
        const current = window.getSelection();
        if (!current || current.isCollapsed) setSelection(null);
      }, 200);
      return;
    }

    const anchor = sel.anchorNode;
    if (!anchor || !containerRef.current?.contains(anchor)) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 3) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelection({ text, x: rect.left + rect.width / 2, y: rect.top - 8 });
  }, [containerRef, showInput]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const handleSubmit = () => {
    if (!selection) return;
    const q = question.trim() || "Explain this in the context of this PR.";
    onAsk(selection.text, q);
    setShowInput(false);
    setQuestion("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCancel = () => {
    setShowInput(false);
    setQuestion("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!selection) return null;

  // Show just the trigger button
  if (!showInput) {
    return (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setShowInput(true);
        }}
        className="fixed z-50 flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-wo-accent text-white text-[11px] font-medium shadow-lg hover:opacity-90 transition-opacity"
        style={{
          left: `${selection.x}px`,
          top: `${selection.y}px`,
          transform: "translate(-50%, -100%)",
        }}
      >
        <Bot size={11} />
        Ask AI
      </button>
    );
  }

  // Show the question input popup
  return (
    <div
      className="fixed z-50 w-80 rounded-lg bg-wo-bg-elevated border border-wo-border shadow-2xl overflow-hidden"
      style={{
        left: `${Math.min(selection.x, window.innerWidth - 340)}px`,
        top: `${selection.y}px`,
        transform: "translateY(-100%)",
      }}
    >
      <div className="px-3 py-2 border-b border-wo-border bg-wo-bg-subtle flex items-center justify-between">
        <span className="text-[10px] text-wo-text-tertiary font-medium">Ask about selection</span>
        <button type="button" onClick={handleCancel} className="p-0.5 text-wo-text-tertiary hover:text-wo-text transition-colors">
          <X size={11} />
        </button>
      </div>
      <div className="px-3 py-2">
        <p className="text-[10px] text-wo-text-tertiary mb-1.5 truncate font-mono">
          "{selection.text.slice(0, 60)}{selection.text.length > 60 ? "..." : ""}"
        </p>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What would you like to know?"
            className="flex-1 h-7 px-2 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") handleCancel(); }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            className="h-7 px-2.5 rounded-md bg-wo-accent text-white text-xs hover:opacity-90 transition-opacity"
          >
            <Send size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
