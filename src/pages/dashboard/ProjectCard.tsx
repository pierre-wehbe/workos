import { FolderOpen, Play, Square, Terminal as TerminalIcon } from "lucide-react";
import type { Project } from "../../lib/types";
import { ipc } from "../../lib/ipc";

interface ProjectCardProps {
  project: Project;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

export function ProjectCard({ project, isRunning, onStart, onStop, onOpen, onDelete }: ProjectCardProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-wo-border bg-wo-bg-elevated hover:border-wo-accent/20 transition-colors">
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2 mb-0.5">
          {isRunning && <span className="w-2 h-2 rounded-full bg-wo-success animate-pulse" />}
          <strong className="text-sm font-medium truncate">{project.name}</strong>
        </div>
        <p className="text-xs text-wo-text-tertiary truncate">{project.localPath}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {project.devCommand && (
          isRunning ? (
            <button type="button" onClick={onStop} className="p-2 rounded-lg text-wo-danger hover:bg-wo-bg-subtle transition-colors" title="Stop">
              <Square size={14} />
            </button>
          ) : (
            <button type="button" onClick={onStart} className="p-2 rounded-lg text-wo-success hover:bg-wo-bg-subtle transition-colors" title="Start">
              <Play size={14} />
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => ipc.openInIDE(project.localPath, project.ide)}
          className="p-2 rounded-lg text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors"
          title={`Open in ${project.ide}`}
        >
          <TerminalIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => ipc.openInFinder(project.localPath)}
          className="p-2 rounded-lg text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors"
          title="Reveal in Finder"
        >
          <FolderOpen size={14} />
        </button>
      </div>
    </div>
  );
}
