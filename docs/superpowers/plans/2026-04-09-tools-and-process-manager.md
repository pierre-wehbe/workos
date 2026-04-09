# Tools Discovery & Global Process Manager — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add script discovery (package.json, Makefile, launch.json), pinned tools per project, and a global process manager with titlebar badge, log retention, and port detection.

**Architecture:** Discovery runs in Electron main process (filesystem access). Process registry is in-memory with log files on disk. All communication via IPC. Process panel is a popover triggered from titlebar.

**Tech Stack:** Same as v2 base — Electron, React 19, TypeScript, Tailwind 4, better-sqlite3, xterm

---

## File Structure

### New Files

```
desktop/discovery.js       — Script discovery engine (package.json, Makefile, launch.json)
desktop/processes.js       — Process registry, log writing, port detection, cleanup

src/lib/use-tools.ts       — useTools hook (discover, pin, CRUD)
src/lib/use-processes.ts   — useProcesses hook (global process list, start/stop)

src/components/ProcessBadge.tsx      — Titlebar running-count pill
src/components/ProcessPanel.tsx      — Popover listing all processes with filters
src/components/ProcessRow.tsx        — Single process row in panel

src/pages/project/ToolsTab.tsx       — Tools discovery + pinned tools UI
```

### Modified Files

```
desktop/main.js            — Add discovery, tools, and process IPC handlers
desktop/preload.js         — Expose new IPC methods
desktop/db.js              — Add tools table + CRUD
src/env.d.ts               — Add new IPC types
src/lib/ipc.ts             — Add new IPC wrappers
src/pages/project/ProjectDetailPage.tsx  — Add tabbed layout (Terminal / Tools)
src/App.tsx                — Add ProcessBadge + ProcessPanel to titlebar
```

---

## CHECKPOINT 7: Script Discovery + Pinned Tools

### Task 12: Discovery engine + tools schema

**Files:**
- Create: `desktop/discovery.js`
- Modify: `desktop/db.js`
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `src/env.d.ts`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Create desktop/discovery.js**

```js
const fs = require("node:fs");
const path = require("node:path");

function discoverScripts(projectPath) {
  const results = [];

  // Helper: scan a directory for package.json and Makefile
  function scanDir(dir, prefix) {
    // package.json scripts
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.scripts) {
          const runner = fs.existsSync(path.join(dir, "bun.lock")) ? "bun run"
            : fs.existsSync(path.join(dir, "yarn.lock")) ? "yarn"
            : "npm run";
          for (const [key, cmd] of Object.entries(pkg.scripts)) {
            results.push({
              name: prefix ? `${prefix}:${key}` : key,
              command: `${runner} ${key}`,
              workingDir: path.relative(projectPath, dir) || ".",
              source: "package.json",
              sourceKey: key,
            });
          }
        }
      } catch {}
    }

    // Makefile targets
    const makefilePath = path.join(dir, "Makefile");
    if (fs.existsSync(makefilePath)) {
      try {
        const content = fs.readFileSync(makefilePath, "utf8");
        const targetRegex = /^([a-zA-Z_][a-zA-Z0-9_.-]*):/gm;
        let match;
        while ((match = targetRegex.exec(content)) !== null) {
          const target = match[1];
          if (target.startsWith(".") || target === "PHONY") continue;
          results.push({
            name: prefix ? `${prefix}:make ${target}` : `make ${target}`,
            command: `make ${target}`,
            workingDir: path.relative(projectPath, dir) || ".",
            source: "Makefile",
            sourceKey: target,
          });
        }
      } catch {}
    }
  }

  // Scan root
  scanDir(projectPath, "");

  // Scan 1 level deep for monorepo packages
  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const subdir = path.join(projectPath, entry.name);
      scanDir(subdir, entry.name);
    }
  } catch {}

  // .vscode/launch.json
  const launchPath = path.join(projectPath, ".vscode", "launch.json");
  if (fs.existsSync(launchPath)) {
    try {
      // Strip comments (JSONC)
      const raw = fs.readFileSync(launchPath, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const launch = JSON.parse(raw);
      if (launch.configurations) {
        for (const config of launch.configurations) {
          if (config.name) {
            results.push({
              name: config.name,
              command: null, // launch configs can't be run from terminal
              workingDir: ".",
              source: "launch.json",
              sourceKey: config.name,
            });
          }
        }
      }
    } catch {}
  }

  return results;
}

module.exports = { discoverScripts };
```

- [ ] **Step 2: Add tools table to desktop/db.js**

Add after the `projects` CREATE TABLE in the `init` function:

```js
    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      working_dir TEXT DEFAULT '.',
      source TEXT NOT NULL DEFAULT 'custom',
      source_key TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

Add CRUD functions and export them:

```js
// Tools
function rowToTool(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    workingDir: row.working_dir,
    source: row.source,
    sourceKey: row.source_key,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
  };
}

function getTools(projectId) {
  return db.prepare("SELECT * FROM tools WHERE project_id = ? ORDER BY pinned DESC, name").all(projectId).map(rowToTool);
}

function createTool({ projectId, name, command, workingDir, source, sourceKey }) {
  const id = uuid();
  db.prepare(
    "INSERT INTO tools (id, project_id, name, command, working_dir, source, source_key, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
  ).run(id, projectId, name, command, workingDir || ".", source || "custom", sourceKey || null);
  return rowToTool(db.prepare("SELECT * FROM tools WHERE id = ?").get(id));
}

function deleteTool(id) {
  db.prepare("DELETE FROM tools WHERE id = ?").run(id);
}

function updateTool(id, fields) {
  const colMap = { name: "name", command: "command", workingDir: "working_dir", pinned: "pinned" };
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      sets.push(`${col} = ?`);
      values.push(key === "pinned" ? (fields[key] ? 1 : 0) : fields[key]);
    }
  }
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE tools SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return rowToTool(db.prepare("SELECT * FROM tools WHERE id = ?").get(id));
}
```

Add to module.exports: `getTools, createTool, deleteTool, updateTool`

- [ ] **Step 3: Add IPC handlers to desktop/main.js**

After the existing db handlers, add:

```js
  // --- Discovery ---
  ipcMain.handle("shell:discover-scripts", (_e, projectPath) => {
    const { discoverScripts } = require("./discovery.js");
    return discoverScripts(projectPath);
  });

  // --- Tools ---
  ipcMain.handle("db:get-tools", (_e, projectId) => db.getTools(projectId));
  ipcMain.handle("db:create-tool", (_e, data) => db.createTool(data));
  ipcMain.handle("db:delete-tool", (_e, id) => db.deleteTool(id));
  ipcMain.handle("db:update-tool", (_e, id, data) => db.updateTool(id, data));
```

- [ ] **Step 4: Add to desktop/preload.js**

In the Database section add:

```js
  getTools: (projectId) => ipcRenderer.invoke("db:get-tools", projectId),
  createTool: (data) => ipcRenderer.invoke("db:create-tool", data),
  deleteTool: (id) => ipcRenderer.invoke("db:delete-tool", id),
  updateTool: (id, data) => ipcRenderer.invoke("db:update-tool", id, data),
  discoverScripts: (projectPath) => ipcRenderer.invoke("shell:discover-scripts", projectPath),
```

- [ ] **Step 5: Add types to src/env.d.ts**

Add to the ElectronAPI interface:

```ts
  // Tools
  getTools: (projectId: string) => Promise<import("./lib/types").Tool[]>;
  createTool: (data: {
    projectId: string; name: string; command: string;
    workingDir?: string; source?: string; sourceKey?: string;
  }) => Promise<import("./lib/types").Tool>;
  deleteTool: (id: string) => Promise<void>;
  updateTool: (id: string, data: Partial<import("./lib/types").Tool>) => Promise<import("./lib/types").Tool>;
  discoverScripts: (projectPath: string) => Promise<Array<{
    name: string; command: string | null; workingDir: string;
    source: string; sourceKey: string;
  }>>;
```

- [ ] **Step 6: Add Tool type to src/lib/types.ts**

```ts
export interface Tool {
  id: string;
  projectId: string;
  name: string;
  command: string;
  workingDir: string;
  source: string;
  sourceKey: string | null;
  pinned: boolean;
  createdAt: string;
}
```

- [ ] **Step 7: Add to src/lib/ipc.ts**

```ts
  getTools: (projectId: string) => api.getTools(projectId),
  createTool: (data: Parameters<typeof api.createTool>[0]) => api.createTool(data),
  deleteTool: (id: string) => api.deleteTool(id),
  updateTool: (id: string, data: Parameters<typeof api.updateTool>[1]) => api.updateTool(id, data),
  discoverScripts: (projectPath: string) => api.discoverScripts(projectPath),
```

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add desktop/discovery.js desktop/db.js desktop/main.js desktop/preload.js src/env.d.ts src/lib/types.ts src/lib/ipc.ts
git commit -m "feat: add script discovery engine and tools schema"
```

---

### Task 13: Tools tab UI

**Files:**
- Create: `src/lib/use-tools.ts`
- Create: `src/pages/project/ToolsTab.tsx`
- Modify: `src/pages/project/ProjectDetailPage.tsx`

- [ ] **Step 1: Create src/lib/use-tools.ts**

```ts
import { useCallback, useEffect, useState } from "react";
import type { Tool } from "./types";
import { ipc } from "./ipc";

interface DiscoveredScript {
  name: string;
  command: string | null;
  workingDir: string;
  source: string;
  sourceKey: string;
}

export function useTools(projectId: string) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredScript[]>([]);
  const [discovering, setDiscovering] = useState(false);

  const refresh = useCallback(async () => {
    const list = await ipc.getTools(projectId);
    setTools(list);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const discover = useCallback(async (projectPath: string) => {
    setDiscovering(true);
    const scripts = await ipc.discoverScripts(projectPath);
    setDiscovered(scripts);
    setDiscovering(false);
  }, []);

  const pin = useCallback(async (script: DiscoveredScript) => {
    if (!script.command) return;
    await ipc.createTool({
      projectId,
      name: script.name,
      command: script.command,
      workingDir: script.workingDir,
      source: script.source,
      sourceKey: script.sourceKey,
    });
    await refresh();
  }, [projectId, refresh]);

  const addCustom = useCallback(async (name: string, command: string, workingDir?: string) => {
    await ipc.createTool({ projectId, name, command, workingDir, source: "custom" });
    await refresh();
  }, [projectId, refresh]);

  const remove = useCallback(async (id: string) => {
    await ipc.deleteTool(id);
    await refresh();
  }, [refresh]);

  return { tools, discovered, discovering, refresh, discover, pin, addCustom, remove };
}
```

- [ ] **Step 2: Create src/pages/project/ToolsTab.tsx**

```tsx
import { useState } from "react";
import { Loader2, Pin, Play, Plus, Search, Trash2, X } from "lucide-react";
import type { Project } from "../../lib/types";
import { useTools } from "../../lib/use-tools";

interface ToolsTabProps {
  project: Project;
  onRunTool: (command: string, workingDir: string, toolName: string) => void;
}

export function ToolsTab({ project, onRunTool }: ToolsTabProps) {
  const { tools, discovered, discovering, discover, pin, addCustom, remove } = useTools(project.id);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCmd, setCustomCmd] = useState("");
  const [customDir, setCustomDir] = useState("");

  const pinnedTools = tools.filter((t) => t.pinned);

  // Filter out already-pinned scripts from discovered
  const pinnedKeys = new Set(tools.map((t) => `${t.source}:${t.sourceKey}`));
  const unpinned = discovered.filter(
    (d) => d.command && !pinnedKeys.has(`${d.source}:${d.sourceKey}`)
  );

  const handleAddCustom = async () => {
    if (!customName.trim() || !customCmd.trim()) return;
    await addCustom(customName.trim(), customCmd.trim(), customDir.trim() || undefined);
    setCustomName(""); setCustomCmd(""); setCustomDir(""); setShowCustom(false);
  };

  const inputClass = "w-full h-9 px-3 rounded-lg border border-wo-border bg-wo-bg text-sm text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40 transition";

  // Group discovered by source
  const grouped = unpinned.reduce<Record<string, typeof unpinned>>((acc, s) => {
    const key = s.workingDir === "." ? s.source : `${s.workingDir}/${s.source}`;
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Pinned tools */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Pinned Tools</h3>
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className="flex items-center gap-1.5 text-xs font-medium text-wo-accent hover:text-wo-accent-hover transition-colors"
          >
            <Plus size={13} /> Custom
          </button>
        </div>

        {showCustom && (
          <div className="mb-3 p-3 rounded-xl border border-wo-border bg-wo-bg-subtle space-y-2">
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Tool name" className={inputClass} />
            <input value={customCmd} onChange={(e) => setCustomCmd(e.target.value)} placeholder="Command (e.g. npm run dev)" className={inputClass} />
            <input value={customDir} onChange={(e) => setCustomDir(e.target.value)} placeholder="Working dir (optional, relative)" className={inputClass} />
            <div className="flex gap-2">
              <button type="button" onClick={handleAddCustom} disabled={!customName.trim() || !customCmd.trim()} className="px-3 h-8 rounded-lg bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-40">
                Add
              </button>
              <button type="button" onClick={() => setShowCustom(false)} className="px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {pinnedTools.length === 0 ? (
          <p className="text-xs text-wo-text-tertiary py-4 text-center">
            No pinned tools yet. Discover scripts or add a custom tool.
          </p>
        ) : (
          <div className="space-y-1.5">
            {pinnedTools.map((tool) => (
              <div key={tool.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-wo-border bg-wo-bg-elevated">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-medium">{tool.name}</strong>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-wo-bg-subtle text-wo-text-tertiary">{tool.source}</span>
                  </div>
                  <p className="text-xs text-wo-text-tertiary font-mono truncate">{tool.command}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRunTool(tool.command, tool.workingDir, tool.name)}
                    className="p-2 rounded-lg text-wo-success hover:bg-wo-bg-subtle transition-colors"
                    title="Run"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(tool.id)}
                    className="p-2 rounded-lg text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Discover */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Discover Scripts</h3>
          <button
            type="button"
            onClick={() => discover(project.localPath)}
            disabled={discovering}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-wo-border text-xs font-medium text-wo-text hover:bg-wo-bg-subtle transition-colors disabled:opacity-50"
          >
            {discovering ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {discovering ? "Scanning..." : "Scan project"}
          </button>
        </div>

        {Object.keys(grouped).length === 0 && !discovering && discovered.length > 0 && (
          <p className="text-xs text-wo-text-tertiary py-4 text-center">All discovered scripts are already pinned.</p>
        )}

        {Object.entries(grouped).map(([source, scripts]) => (
          <div key={source} className="mb-4">
            <p className="text-xs font-medium text-wo-text-tertiary mb-2">{source}</p>
            <div className="space-y-1">
              {scripts.map((script) => (
                <div key={`${script.source}:${script.sourceKey}`} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-wo-bg-subtle">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm">{script.name}</span>
                    {script.command && (
                      <span className="text-xs text-wo-text-tertiary font-mono ml-2">{script.command}</span>
                    )}
                  </div>
                  {script.command && (
                    <button
                      type="button"
                      onClick={() => pin(script)}
                      className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-wo-accent hover:bg-wo-accent-soft transition-colors shrink-0"
                    >
                      <Pin size={12} />
                      Pin
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Update ProjectDetailPage with tabs**

Add a `tab` state (`"terminal" | "tools"`) and render ToolsTab when selected. The `onRunTool` callback starts a process and switches to the terminal tab.

This is a modification — read the existing file, then add tab navigation between the header and the terminal section. Import `ToolsTab` and wire `onRunTool` to `start(command, path.join(project.localPath, workingDir))`.

- [ ] **Step 4: Run typecheck + build**

Run: `bun run typecheck && bun run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ desktop/
git commit -m "feat: add tools discovery, pinning, and tools tab in project detail"
```

---

### Task 14: Verify Checkpoint 7

- [ ] **Step 1: Test discovery**

Run `bun run dev`. Open a project that has a `package.json` with scripts. Go to Tools tab → Scan → should see all npm scripts listed. Pin one → appears in pinned section. Click Run → switches to terminal, shows output.

- [ ] **Step 2: Test monorepo**

If you have a monorepo project, scripts from subdirectories should appear with `subfolder:scriptname` naming.

- [ ] **Step 3: Test custom tool**

Add a custom tool with command `echo "hello from custom tool"`. Run it → see output.

---

## CHECKPOINT 8: Global Process Manager

### Task 15: Process registry + log storage

**Files:**
- Create: `desktop/processes.js`
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `src/env.d.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Create desktop/processes.js**

```js
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { loadShellEnvironment } = require("./shell-env.js");

const registry = new Map(); // id → ProcessEntry
let logsDir = null;
let mainWindow = null;

const PORT_PATTERNS = [
  /listening on port (\d+)/i,
  /localhost:(\d+)/,
  /0\.0\.0\.0:(\d+)/,
  /http:\/\/[^:]+:(\d+)/,
  /on port (\d+)/i,
];

function init(app, window) {
  logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  mainWindow = window;
  cleanupOldLogs();
}

function setWindow(window) {
  mainWindow = window;
}

function cleanupOldLogs() {
  if (!logsDir) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    for (const file of fs.readdirSync(logsDir)) {
      const filePath = path.join(logsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {}
  // Remove registry entries for deleted logs
  for (const [id, entry] of registry) {
    if (entry.status !== "running" && !fs.existsSync(entry.logFile)) {
      registry.delete(id);
    }
  }
}

function detectPort(chunk) {
  for (const pattern of PORT_PATTERNS) {
    const match = chunk.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function startProcess({ projectId, projectName, workspaceId, workspaceName, toolName, command, workingDir }) {
  const id = crypto.randomUUID();
  const logFile = path.join(logsDir, `${id}.log`);
  const env = loadShellEnvironment();
  const cwd = workingDir || undefined;
  const child = spawn("/bin/zsh", ["-l", "-c", command], { env, cwd, timeout: 0 });

  const entry = {
    id,
    projectId,
    projectName,
    workspaceId,
    workspaceName,
    toolName,
    command,
    pid: child.pid,
    status: "running",
    exitCode: null,
    port: null,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    logFile,
  };

  registry.set(id, entry);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const handleData = (chunk) => {
    const text = chunk.toString();
    logStream.write(text);

    if (!entry.port) {
      const port = detectPort(text);
      if (port) {
        entry.port = port;
        if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
      }
    }

    if (mainWindow) mainWindow.webContents.send("process:on-output", { id, chunk: text });
  };

  child.stdout.on("data", handleData);
  child.stderr.on("data", handleData);

  child.on("close", (code) => {
    entry.status = code === 0 ? "stopped" : "errored";
    entry.exitCode = code;
    entry.stoppedAt = new Date().toISOString();
    logStream.end();
    if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
  });

  child.on("error", () => {
    entry.status = "errored";
    entry.exitCode = 1;
    entry.stoppedAt = new Date().toISOString();
    logStream.end();
    if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
  });

  // Store child ref for killing
  entry._child = child;

  if (mainWindow) mainWindow.webContents.send("process:on-update", toSerializable(entry));
  return toSerializable(entry);
}

function stopProcess(id) {
  const entry = registry.get(id);
  if (!entry || entry.status !== "running" || !entry._child) return;

  entry._child.kill("SIGTERM");
  setTimeout(() => {
    if (entry.status === "running" && entry._child) {
      entry._child.kill("SIGKILL");
    }
  }, 5000);
}

function clearProcess(id) {
  const entry = registry.get(id);
  if (!entry || entry.status === "running") return;
  try { fs.unlinkSync(entry.logFile); } catch {}
  registry.delete(id);
}

function clearAllStopped() {
  for (const [id, entry] of registry) {
    if (entry.status !== "running") {
      try { fs.unlinkSync(entry.logFile); } catch {}
      registry.delete(id);
    }
  }
}

function listProcesses() {
  return Array.from(registry.values()).map(toSerializable);
}

function getProcessLogs(id) {
  const entry = registry.get(id);
  if (!entry) return "";
  try { return fs.readFileSync(entry.logFile, "utf8"); } catch { return ""; }
}

function killAll() {
  for (const [id, entry] of registry) {
    if (entry.status === "running" && entry._child) {
      entry._child.kill("SIGTERM");
    }
  }
  // Force kill after 5s
  setTimeout(() => {
    for (const [id, entry] of registry) {
      if (entry.status === "running" && entry._child) {
        entry._child.kill("SIGKILL");
      }
    }
  }, 5000);
}

function toSerializable(entry) {
  const { _child, ...rest } = entry;
  return rest;
}

function getRunningCount() {
  let count = 0;
  for (const entry of registry.values()) {
    if (entry.status === "running") count++;
  }
  return count;
}

module.exports = {
  init, setWindow, startProcess, stopProcess, clearProcess, clearAllStopped,
  listProcesses, getProcessLogs, killAll, getRunningCount,
};
```

- [ ] **Step 2: Add process IPC handlers to desktop/main.js**

```js
  const processes = require("./processes.js");

  // After createWindow():
  processes.init(app, mainWindow);

  // IPC handlers:
  ipcMain.handle("process:start", (_e, data) => processes.startProcess(data));
  ipcMain.handle("process:stop", (_e, id) => processes.stopProcess(id));
  ipcMain.handle("process:list", () => processes.listProcesses());
  ipcMain.handle("process:clear", (_e, id) => processes.clearProcess(id));
  ipcMain.handle("process:clear-all-stopped", () => processes.clearAllStopped());
  ipcMain.handle("process:logs", (_e, id) => processes.getProcessLogs(id));
  ipcMain.handle("process:running-count", () => processes.getRunningCount());
```

Update `before-quit` to use `processes.killAll()` instead of the old executor's `killAll`.

- [ ] **Step 3: Add to preload, env.d.ts, types.ts, ipc.ts**

Types:
```ts
export interface ProcessEntry {
  id: string;
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  toolName: string;
  command: string;
  pid: number;
  status: "running" | "stopped" | "errored";
  exitCode: number | null;
  port: number | null;
  startedAt: string;
  stoppedAt: string | null;
  logFile: string;
}
```

- [ ] **Step 4: Run typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add global process registry with log storage and port detection"
```

---

### Task 16: Process badge + panel UI

**Files:**
- Create: `src/lib/use-processes.ts`
- Create: `src/components/ProcessBadge.tsx`
- Create: `src/components/ProcessRow.tsx`
- Create: `src/components/ProcessPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/lib/use-processes.ts**

Hook that polls `process:list` and subscribes to `process:on-update` events. Returns `processes`, `runningCount`, `start`, `stop`, `clear`, `clearAllStopped`, `getLogs`.

- [ ] **Step 2: Create ProcessBadge**

Small teal pill in titlebar showing running count. Clickable to toggle ProcessPanel.

- [ ] **Step 3: Create ProcessRow**

Single process row: status dot, tool name, project name, port badge, duration, stop/clear button, expandable log viewer.

- [ ] **Step 4: Create ProcessPanel**

Popover/slide-out panel. Filter by workspace (dropdown), text search, sorted running-first. Uses ProcessRow for each entry. "Clear all stopped" button.

- [ ] **Step 5: Wire into App.tsx**

Add ProcessBadge to titlebar. ProcessPanel as overlay. Connect ToolsTab and DashboardPage to use `processes.start()` instead of the old `useProcess` hook.

- [ ] **Step 6: Run typecheck + build**

- [ ] **Step 7: Test and commit**

```bash
git commit -m "feat: add global process manager with titlebar badge and process panel"
```

---

### Task 17: Wire everything together + cleanup

- [ ] **Step 1: Remove old useProcess hook** (replaced by global process manager)
- [ ] **Step 2: Update ProjectDetailPage** to use global process start
- [ ] **Step 3: Ensure process cleanup on app quit**
- [ ] **Step 4: Test full flow**

Run 2 tools across 2 projects → badge shows "2" → open panel → stop one → shows stopped → clear → gone. Quit app → all processes killed. Restart → old stopped logs still visible (< 24h). Wait or manually set old timestamps → auto-cleaned.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: wire global process manager, remove old useProcess hook"
```
