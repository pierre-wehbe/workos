import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  output: string;
  isRunning?: boolean;
  allowFullscreen?: boolean;
}

export function Terminal({ output, isRunning = false, allowFullscreen = true }: TerminalProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastLengthRef = useRef(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!termContainerRef.current) return;

    const term = new XTerminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
      convertEol: true,
      theme: {
        background: "transparent",
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
    term.open(termContainerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    lastLengthRef.current = 0;

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(termContainerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, []);

  // Re-fit when fullscreen toggles
  useEffect(() => {
    setTimeout(() => fitRef.current?.fit(), 50);
  }, [fullscreen]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newContent = output.slice(lastLengthRef.current);
    if (newContent) {
      term.write(newContent);
      lastLengthRef.current = output.length;
    }
  }, [output]);

  return (
    <div
      ref={wrapperRef}
      className={`relative group ${
        fullscreen
          ? "fixed inset-0 z-50 bg-[#0f1512] flex flex-col"
          : "h-full min-h-[120px] rounded-lg bg-wo-bg-subtle"
      }`}
    >
      {fullscreen && (
        <div className="shrink-0 flex items-center justify-between px-4 h-10 border-b border-wo-border/30">
          <div className="flex items-center gap-2">
            {isRunning && <span className="w-2 h-2 rounded-full bg-wo-success animate-pulse" />}
            <span className="text-xs text-wo-text-tertiary">{isRunning ? "Running" : "Stopped"}</span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="p-1.5 rounded-md text-wo-text-tertiary hover:text-wo-text hover:bg-wo-bg-subtle transition-colors"
            title="Exit fullscreen (Esc)"
          >
            <Minimize2 size={14} />
          </button>
        </div>
      )}
      {allowFullscreen && !fullscreen && (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-wo-bg-elevated/80 text-wo-text-tertiary hover:text-wo-text opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Fullscreen"
        >
          <Maximize2 size={12} />
        </button>
      )}
      <div
        ref={termContainerRef}
        className={fullscreen ? "flex-1 min-h-0 p-3" : "h-full p-3"}
      />
    </div>
  );
}
