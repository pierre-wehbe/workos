# Tools Discovery & Global Process Manager — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Script discovery, pinned tools, global process manager with titlebar badge, log retention

---

## Increment A: Script Discovery + Pinned Tools

### A1. Discovery Engine

Scan a project directory for runnable scripts from 3 sources:

| Source | How to discover | Example entry |
|---|---|---|
| package.json `scripts` | Parse JSON, extract `scripts` object | `{ key: "dev", command: "next dev", source: "package.json" }` |
| Makefile targets | Parse with regex `^[a-zA-Z_-]+:` (skip `.PHONY`, lines starting with tab) | `{ key: "build", command: "make build", source: "Makefile" }` |
| .vscode/launch.json | Parse JSON, extract `configurations[].name` | `{ key: "Debug Server", command: null, source: "launch.json" }` |

For monorepos: scan root + 1 level deep for additional `package.json` / `Makefile` files. Group by subfolder.

Discovery runs on-demand via IPC (`shell:discover-scripts`). Returns structured results to the renderer.

### A2. SQLite Schema Addition

```sql
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- display name (user-editable)
  command TEXT NOT NULL,        -- shell command to run
  working_dir TEXT,             -- relative to project root (for monorepo subfolders)
  source TEXT NOT NULL,         -- "package.json" | "Makefile" | "launch.json" | "custom"
  source_key TEXT,              -- original script key (e.g. "dev", "build")
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### A3. UI: Project Detail — Tools Tab

Project detail page gets a tabbed layout:
- **Terminal** tab (existing — process runner)
- **Tools** tab (new)

Tools tab shows:
- "Discover scripts" button → scans and shows found scripts grouped by source
- Each discovered script has a "Pin" button → saves to SQLite
- Pinned tools section at top with Run button for each
- Custom tool "Add" button (name + command + working dir)
- Pinned tools persist across sessions

### A4. Running a Tool

Clicking Run on a pinned tool starts a process via the streaming executor. Multiple tools can run simultaneously per project (monorepo use case). Each running tool creates a process entry in the global process manager.

---

## Increment B: Global Process Manager

### B1. Process Registry (Main Process)

In-memory registry in `desktop/processes.js`:

```js
// Each running or recently-stopped process
{
  id: string,              // uuid
  projectId: string,
  projectName: string,
  workspaceId: string,
  workspaceName: string,
  toolName: string,        // display name of what's running
  command: string,
  pid: number,
  status: "running" | "stopped" | "errored",
  exitCode: number | null,
  port: number | null,     // detected from stdout
  startedAt: string,       // ISO timestamp
  stoppedAt: string | null,
  logFile: string,         // path to log file on disk
}
```

### B2. Log Storage

- Logs written to `~/Library/Application Support/workos/logs/{processId}.log`
- Append-only file, written as stdout/stderr chunks arrive
- Auto-cleanup: on app startup, delete log files older than 24 hours for stopped processes
- Manual clear: user can clear a specific process log (deletes file + removes from registry)
- Running processes retain logs until stopped + 24h

### B3. Port Detection

Parse stdout lines for common patterns:
- `listening on port (\d+)`
- `localhost:(\d+)`
- `0.0.0.0:(\d+)`
- `http://[^:]+:(\d+)`
- `on port (\d+)`

First match wins. Stored in process registry. Displayed in process list.

### B4. IPC Channels (New)

| Channel | Direction | Purpose |
|---|---|---|
| `process:start` | handle | Start a tool, returns process entry |
| `process:stop` | handle | Stop by process id (SIGTERM → SIGKILL) |
| `process:list` | handle | Return all process entries |
| `process:clear` | handle | Remove stopped process + delete log |
| `process:clear-all-stopped` | handle | Remove all stopped processes |
| `process:logs` | handle | Read log file content for a process |
| `process:on-update` | main→renderer | Process state changed (started/stopped/port detected) |
| `process:on-output` | main→renderer | New log chunk for a process |

### B5. Titlebar Badge

To the left of the theme toggle: a small pill showing the count of running processes. Teal accent color when > 0, subtle when 0.

Click → opens a popover/panel.

### B6. Process Panel (Popover or Slide-out)

Shows all processes (running + recently stopped). Layout:

- **Filter bar**: workspace dropdown (default: current workspace, option: "All workspaces"), text search
- **Sort**: running first, then by startedAt descending
- **Each process row**:
  - Status dot (green pulse = running, gray = stopped, red = errored)
  - Tool name + project name
  - Port badge (if detected)
  - Workspace name (if showing all)
  - Duration / time since started
  - Stop button (if running)
  - Clear button (if stopped)
  - Click → expands to show streaming log (xterm)
- **Batch actions**: "Clear all stopped" button
- **Running process count** in panel header

### B7. Process Cleanup on Quit

`app.on("before-quit")` → SIGTERM all running processes, wait up to 5s, SIGKILL any remaining.

### B8. 24-Hour Auto-Cleanup

On app startup:
1. Read all log files in `logs/` directory
2. For each: check if the associated process is stopped AND `stoppedAt` > 24h ago
3. If so: delete log file, remove from registry

---

## Implementation Checkpoints

### Checkpoint 7: Script Discovery + Pinned Tools
- Tasks 12-14
- **Test**: Open project detail → Tools tab → Discover → pin a script → Run it → see output

### Checkpoint 8: Global Process Manager
- Tasks 15-17
- **Test**: Run 2 tools across 2 projects → titlebar shows "2" → click → process panel → stop one → shows stopped → clear it → gone

---

## Non-Goals

- No `.vscode/launch.json` execution (just discovery — launch configs are IDE-specific)
- No automatic process restart on crash
- No process grouping / orchestration (run A then B)
- No remote process management
