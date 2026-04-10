import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface AgentTerminalProps {
  output: string;
  isRunning: boolean;
  title?: string;
  onClose: () => void;
}

export function AgentTerminal({ output, isRunning, title, onClose }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastLengthRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
      convertEol: true,
      theme: {
        background: "#0f1512",
        foreground: "#9ab5aa",
        cursor: "transparent",
      },
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon((_event, uri) => {
      window.open(uri, "_blank");
    });
    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.open(containerRef.current);

    if (output) term.write(output);
    lastLengthRef.current = output.length;

    termRef.current = term;
    fitRef.current = fit;

    requestAnimationFrame(() => fit.fit());

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newContent = output.slice(lastLengthRef.current);
    if (newContent) {
      term.write(newContent);
      lastLengthRef.current = output.length;
    }
  }, [output]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-100 bg-[#0f1512] flex flex-col pt-11">
      <div className="shrink-0 flex items-center justify-between px-5 h-10 border-b border-[#1c2622]">
        <div className="flex items-center gap-2">
          {isRunning && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          <span className="text-xs text-[#6b8a7e]">
            {title ?? (isRunning ? "Running" : "Stopped")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-[#6b8a7e] hover:text-[#e0ede7] hover:bg-[#1c2622] transition-colors"
          title="Exit fullscreen (Esc)"
        >
          <Minimize2 size={14} />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 p-3" />
    </div>,
    document.body
  );
}
