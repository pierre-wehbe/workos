# WorkOS Command Center v2 — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Scope:** Full rewrite — Electron shell, SQLite data layer, onboarding wizard, dashboard, project management, process runner, settings, export/import

---

## 1. Summary

Standalone Electron desktop app for machine setup, multi-workspace management, and project bootstrapping. Node-only architecture (no Python backend). Bun as package manager. Strongly typed TypeScript frontend with React 19, Tailwind 4, and a health-inspired color palette.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Desktop runtime | Electron 36 | Cross-platform, mature, process management |
| Main process | CJS (CommonJS) | Required — ESM breaks `require("electron")` on Node 22 |
| Package manager | Bun | Fast installs, native TS script support |
| Frontend framework | React 19 + TypeScript (strict) | Type safety, component reuse |
| Build tool | Vite 7 + `@vitejs/plugin-react` | Fast HMR, content-hashed output |
| Styling | Tailwind CSS 4 (Vite plugin) | Utility-first, CSS vars for theming |
| Icons | Lucide React | Clean, consistent, same as reference |
| Terminal | @xterm/xterm + @xterm/addon-fit | Real-time process output |
| Database | better-sqlite3 | Synchronous SQLite in Electron main process |
| Routing | react-router-dom | SPA navigation |

---

## 3. File Structure

```
workos/
  package.json
  bunfig.toml
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html

  desktop/                    # Electron main process (CJS)
    main.js                   # App lifecycle, window management, IPC dispatch
    preload.js                # Context bridge → electronAPI
    db.js                     # SQLite schema, migrations, CRUD operations
    executor.js               # Child process spawner, streaming, kill
    shell-env.js              # Login shell environment loader
    updater.js                # Version check, cache clearing on update

  src/                        # React frontend (TypeScript)
    main.tsx                  # React DOM entry
    App.tsx                   # Router + layout shell
    styles.css                # Tailwind imports + CSS vars theme

    lib/
      types.ts                # All TypeScript interfaces
      ipc.ts                  # Typed wrapper around window.electronAPI
      theme.ts                # useTheme hook + ThemeProvider
      workspaces.ts           # useWorkspaces, useActiveWorkspace hooks
      projects.ts             # useProjects hook
      processes.ts            # useProcess hook (start/stop/stream)

    components/
      StatusBadge.tsx         # installed/missing/checking status pill
      Terminal.tsx            # xterm wrapper component
      ThemeToggle.tsx         # Dark/light/system toggle
      Sidebar.tsx             # Navigation sidebar
      WorkspaceSwitcher.tsx   # Dropdown to switch active workspace

    pages/
      onboarding/
        OnboardingPage.tsx    # Orchestrator: prerequisites → workspace setup
        PrerequisiteCheck.tsx # Detect + install brew/git/ssh
        WorkspaceSetup.tsx    # Create first workspace (org name + directory)
      dashboard/
        DashboardPage.tsx     # Project list for active workspace
        ProjectCard.tsx       # Single project row with status + actions
        AddProjectDialog.tsx  # Form: repo URL, path, dev command, IDE
      project/
        ProjectDetailPage.tsx # Process runner + terminal + IDE launcher
      settings/
        SettingsPage.tsx      # Tabs: prerequisites, workspaces, export/import
        PrerequisitePanel.tsx # Re-run brew/git/ssh checks
        WorkspacePanel.tsx    # CRUD workspaces
        ExportImportPanel.tsx # JSON export/import
```

---

## 4. Electron Main Process

### 4.1 Window Management (`desktop/main.js`)

Single window. On startup:
1. Load config (`app.getVersion()` vs stored version → clear cache if updated)
2. Check `db.getSetupComplete()` → if false, renderer shows onboarding; if true, shows dashboard
3. Create `BrowserWindow` with:
   - `titleBarStyle: "hiddenInset"` (macOS traffic lights)
   - `contextIsolation: true`, `nodeIntegration: false`
   - Preload: `desktop/preload.js`
4. In dev: load `http://localhost:5555` (Vite). In prod: load `dist/index.html`

### 4.2 Shell Environment (`desktop/shell-env.js`)

Same pattern as tools-gui:
- Spawn login shell (`zsh -l -c env`) to capture full PATH and exports
- Cache the environment for all child process spawning
- Critical for brew, git, pyenv, nvm etc. to be found

```js
// Returns { PATH: "...", HOME: "...", ... }
function loadShellEnvironment() { ... }
```

### 4.3 Command Executor (`desktop/executor.js`)

Two modes:

**Synchronous** (for detect/verify — returns result):
```js
function runSync(command, opts) → Promise<{ ok, stdout, stderr }>
```

**Streaming** (for install/dev processes — sends IPC events):
```js
function runStreaming(id, command, window, opts) → void
// Sends: execute:stdout, execute:stderr, execute:complete
// Supports: cancel via SIGTERM → SIGKILL after 5s
```

Both use `zsh -l -c "command"` with the loaded shell environment.

### 4.4 Database (`desktop/db.js`)

Uses `better-sqlite3` (synchronous, no async overhead).

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,          -- uuid
  name TEXT NOT NULL,           -- display name
  org TEXT NOT NULL,            -- org identifier
  path TEXT NOT NULL,           -- absolute path to workspace directory
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,          -- uuid
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- display name
  repo_url TEXT,                -- git clone URL (optional)
  local_path TEXT NOT NULL,     -- absolute path to project directory
  dev_command TEXT,             -- e.g. "npm run dev"
  ide TEXT DEFAULT 'cursor',    -- 'cursor' | 'vscode' | 'xcode'
  bootstrap_command TEXT,       -- e.g. "bun install && bun run setup"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Meta keys:**
- `setup_complete` → `"true"` / `"false"`
- `active_workspace_id` → uuid of current workspace
- `app_version` → last seen `app.getVersion()`
- `theme` → `"light"` / `"dark"` / `"system"`

**Operations (all synchronous, called via IPC handle):**
- `db.getSetupComplete()` → boolean
- `db.setSetupComplete(value)` → void
- `db.getMeta(key)` / `db.setMeta(key, value)`
- `db.getWorkspaces()` → Workspace[]
- `db.createWorkspace({ name, org, path })` → Workspace
- `db.deleteWorkspace(id)` → void
- `db.getActiveWorkspace()` → Workspace | null
- `db.setActiveWorkspace(id)` → void
- `db.getProjects(workspaceId)` → Project[]
- `db.createProject({ workspaceId, name, ... })` → Project
- `db.updateProject(id, fields)` → Project
- `db.deleteProject(id)` → void
- `db.exportConfig()` → JSON string (all workspaces + projects, no machine-specific paths)
- `db.importConfig(json)` → void (merges into existing data)

### 4.5 Update & Cache Management (`desktop/updater.js`)

On app startup:
1. Compare `app.getVersion()` with `db.getMeta("app_version")`
2. If different: `session.defaultSession.clearCache()`, update stored version
3. Vite already produces content-hashed filenames, so the main concern is Electron's HTTP cache for dev server

### 4.6 IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `db:*` | handle (invoke) | All database CRUD (one handler per operation) |
| `shell:run-sync` | handle | Run command, return result |
| `shell:run-streaming` | send/on | Start streaming command |
| `shell:cancel` | send | Cancel running command |
| `shell:stdout` | main→renderer | Streaming output chunk |
| `shell:stderr` | main→renderer | Streaming error chunk |
| `shell:complete` | main→renderer | Command finished (exit code) |
| `shell:select-directory` | handle | Native directory picker dialog |
| `app:get-config` | handle | Return setup state + active workspace |
| `app:open-in-ide` | handle | `spawn("cursor", [path])` or `spawn("code", [path])` |
| `app:open-in-finder` | handle | `spawn("open", [path])` |
| `theme:set` | handle | Set `nativeTheme.themeSource` |

### 4.7 Preload Bridge (`desktop/preload.js`)

```js
contextBridge.exposeInMainWorld("electronAPI", {
  // Database
  getWorkspaces: () => ipcRenderer.invoke("db:get-workspaces"),
  createWorkspace: (data) => ipcRenderer.invoke("db:create-workspace", data),
  deleteWorkspace: (id) => ipcRenderer.invoke("db:delete-workspace", id),
  getActiveWorkspace: () => ipcRenderer.invoke("db:get-active-workspace"),
  setActiveWorkspace: (id) => ipcRenderer.invoke("db:set-active-workspace", id),
  getProjects: (wsId) => ipcRenderer.invoke("db:get-projects", wsId),
  createProject: (data) => ipcRenderer.invoke("db:create-project", data),
  updateProject: (id, data) => ipcRenderer.invoke("db:update-project", id, data),
  deleteProject: (id) => ipcRenderer.invoke("db:delete-project", id),
  exportConfig: () => ipcRenderer.invoke("db:export-config"),
  importConfig: (json) => ipcRenderer.invoke("db:import-config", json),

  // Shell
  runSync: (cmd) => ipcRenderer.invoke("shell:run-sync", cmd),
  runStreaming: (id, cmd) => ipcRenderer.send("shell:run-streaming", { id, cmd }),
  cancelCommand: (id) => ipcRenderer.send("shell:cancel", { id }),
  onStdout: (cb) => { ipcRenderer.on("shell:stdout", (_, d) => cb(d.id, d.chunk)); },
  onStderr: (cb) => { ipcRenderer.on("shell:stderr", (_, d) => cb(d.id, d.chunk)); },
  onComplete: (cb) => { ipcRenderer.on("shell:complete", (_, d) => cb(d.id, d.exitCode)); },
  removeShellListeners: () => {
    ipcRenderer.removeAllListeners("shell:stdout");
    ipcRenderer.removeAllListeners("shell:stderr");
    ipcRenderer.removeAllListeners("shell:complete");
  },

  // App
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  selectDirectory: () => ipcRenderer.invoke("shell:select-directory"),
  openInIDE: (path, ide) => ipcRenderer.invoke("app:open-in-ide", path, ide),
  openInFinder: (path) => ipcRenderer.invoke("app:open-in-finder", path),
  setTheme: (mode) => ipcRenderer.invoke("theme:set", mode),
})
```

---

## 5. React Frontend

### 5.1 TypeScript Interfaces (`src/lib/types.ts`)

```ts
export interface Workspace {
  id: string;
  name: string;
  org: string;
  path: string;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  repoUrl: string | null;
  localPath: string;
  devCommand: string | null;
  ide: "cursor" | "vscode" | "xcode";
  bootstrapCommand: string | null;
  createdAt: string;
}

export interface AppConfig {
  setupComplete: boolean;
  activeWorkspaceId: string | null;
  appVersion: string;
}

export type DetectionStatus = "checking" | "installed" | "missing" | "error";

export interface PrerequisiteResult {
  id: string;
  name: string;
  status: DetectionStatus;
  version?: string;
  detail?: string;
}

export type ThemeMode = "light" | "dark" | "system";
```

### 5.2 IPC Wrapper (`src/lib/ipc.ts`)

Thin typed wrapper around `window.electronAPI` that adds TypeScript signatures. No logic — just type safety.

```ts
const api = window.electronAPI;

export const db = {
  getWorkspaces: () => api.getWorkspaces() as Promise<Workspace[]>,
  createWorkspace: (data: Omit<Workspace, "id" | "createdAt">) => api.createWorkspace(data) as Promise<Workspace>,
  // ... etc
};

export const shell = {
  runSync: (cmd: string) => api.runSync(cmd) as Promise<{ ok: boolean; stdout: string; stderr: string }>,
  // ... etc
};
```

### 5.3 Routing (`src/App.tsx`)

```
/onboarding         → OnboardingPage (prerequisites + workspace setup)
/                   → DashboardPage (project list for active workspace)
/projects/:id       → ProjectDetailPage (process runner + terminal)
/settings           → SettingsPage (tabs: prerequisites, workspaces, export/import)
```

On mount: fetch `AppConfig`. If `!setupComplete`, redirect to `/onboarding`. Otherwise `/`.

### 5.4 Layout

Same structure as tools-gui:
- **Titlebar** — drag region, app name, theme toggle (top, 44px)
- **Sidebar** — workspace switcher, nav links (Dashboard), workspace info. Settings gear icon pinned to sidebar bottom (left, 240px)
- **Content** — main area, scrollable

### 5.5 Theme System

CSS custom properties, same pattern as tools-gui:

```css
:root {
  --wo-bg: #f8faf9;
  --wo-bg-elevated: #ffffff;
  --wo-bg-subtle: #f0f5f3;
  --wo-border: rgba(16, 69, 54, 0.08);
  --wo-text: #1a2e28;
  --wo-text-secondary: #5a7a70;
  --wo-text-tertiary: #8fa89e;
  --wo-accent: #0d9373;          /* Teal-green — health/wellness */
  --wo-accent-hover: #0b7d63;
  --wo-accent-soft: rgba(13, 147, 115, 0.08);
  --wo-success: #15803d;
  --wo-warning: #a16207;
  --wo-danger: #dc2626;
}

.dark {
  --wo-bg: #0f1512;
  --wo-bg-elevated: #161d1a;
  --wo-bg-subtle: #1c2622;
  --wo-border: rgba(167, 210, 194, 0.08);
  --wo-text: #e0ede7;
  --wo-text-secondary: #9ab5aa;
  --wo-text-tertiary: #6b8a7e;
  --wo-accent: #34d399;
  --wo-accent-hover: #4aeaaf;
  --wo-accent-soft: rgba(52, 211, 153, 0.12);
  --wo-success: #4ade80;
  --wo-warning: #fbbf24;
  --wo-danger: #f87171;
}
```

Class-based dark mode via Tailwind `@custom-variant dark`.

Three modes: light, dark, system. Persisted in SQLite meta table. Applied via `document.documentElement.classList.toggle("dark")`. Electron `nativeTheme.themeSource` synced for window chrome.

---

## 6. Onboarding Flow

### Phase 1: Prerequisites

Auto-detects on mount. Vertical list of 3 items:

| Check | detect command | install command | configure |
|---|---|---|---|
| Homebrew | `brew --version` | Official curl script | Add shellenv to .zprofile |
| Git | `git --version` | `brew install git` | — |
| SSH Key | `test -f ~/.ssh/id_ed25519` | `ssh-keygen -t ed25519` | Show public key for GitHub copy |

Each item shows:
- Name + status badge (checking → installed / missing)
- "Install" button if missing
- Expandable terminal output during install (xterm)
- SSH: copyable public key block after generation

"Continue" button enabled when all 3 are green.

### Phase 2: Create First Workspace

- Org name text input
- Workspace name text input
- Directory picker (native dialog via `shell:select-directory`)
- "Create & Continue" → creates workspace in SQLite, sets as active, marks setup complete
- Lands on dashboard

---

## 7. Dashboard

Shows projects for the active workspace.

- **Header**: workspace name, "Add Project" button
- **Project list**: cards with name, local path, status (dev running / stopped), actions
- **Empty state**: illustration + "Add your first project" CTA

### Project Card

Compact row showing:
- Project name
- Local path (truncated)
- Status indicator (green dot if dev process running)
- Quick actions: Start/Stop, Open in IDE, Open in Finder

### Add Project Dialog

Modal form:
- **Name** — text input (required)
- **Repository URL** — text input (optional, for future clone support)
- **Local path** — text input + directory picker button (required)
- **Dev command** — text input, e.g. `bun run dev` (optional)
- **IDE** — select: Cursor / VS Code / Xcode (default: Cursor)
- **Bootstrap command** — text input, e.g. `bun install` (optional)

---

## 8. Project Detail Page

Full page for a single project:

- **Header**: project name, Open in IDE button, Open in Finder button, Edit button
- **Process runner**: Start/Stop button, xterm terminal showing live output
- **Info section**: repo URL, local path, dev command, bootstrap command

Start button runs `dev_command` via streaming executor. Terminal shows real-time output. Stop sends SIGTERM → SIGKILL after 5s.

---

## 9. Settings Page

Tabbed layout (same sidebar pattern as tools-gui settings):

### Tab: Prerequisites
- Same 3 checks as onboarding, with re-detect and install buttons
- Always accessible after onboarding

### Tab: Workspaces
- List of all workspaces with active indicator
- Switch active workspace
- Add new workspace (same form as onboarding phase 2)
- Delete workspace (with confirmation)

### Tab: Export / Import
- **Export**: button → downloads JSON file with all workspaces + projects (paths stored as relative to home)
- **Import**: file picker → reads JSON, merges into SQLite (upsert by id, resolves paths relative to home)
- Shows last export timestamp

---

## 10. Export / Import Format

```json
{
  "version": 1,
  "exportedAt": "2026-04-08T12:00:00Z",
  "workspaces": [
    {
      "id": "uuid",
      "name": "Signos",
      "org": "signos",
      "pathRelative": "~/Development/signos",
      "projects": [
        {
          "id": "uuid",
          "name": "Backend API",
          "repoUrl": "git@github.com:signos/api.git",
          "pathRelative": "~/Development/signos/api",
          "devCommand": "poetry run uvicorn main:app --reload",
          "ide": "cursor",
          "bootstrapCommand": "poetry install"
        }
      ]
    }
  ]
}
```

Paths use `~` prefix for portability. On import, `~` is expanded to the importing machine's `$HOME`.

---

## 11. Cache & Update Management

### On App Startup

```js
const stored = db.getMeta("app_version");
const current = app.getVersion();
if (stored !== current) {
  session.defaultSession.clearCache();
  db.setMeta("app_version", current);
}
```

### Bun Scripts

```json
{
  "scripts": {
    "dev": "concurrently -k \"vite\" \"wait-on http://localhost:5555 && ELECTRON_RENDERER_URL=http://localhost:5555 electron desktop/main.js\"",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "start": "electron desktop/main.js",
    "reset": "node -e \"const p=require('path'),f=require('fs'),h=require('os').homedir();f.rmSync(p.join(h,'Library/Application Support/WorkOS'),{recursive:true,force:true});console.log('Reset complete.')\"",
    "clear-cache": "node -e \"console.log('Run the app — cache auto-clears on version change.')\""
  }
}
```

`bun run reset` — nukes the entire app data directory (SQLite + Electron cache). Fresh start.

### Vite Content Hashing

Default Vite behavior. Output filenames include content hash (`index-[hash].js`). No stale JS/CSS after rebuilds.

---

## 12. Security

- `contextIsolation: true` — renderer has no Node access
- `nodeIntegration: false` — no `require()` in renderer
- All IPC via typed `electronAPI` bridge (preload)
- No arbitrary command execution from renderer — commands come from SQLite project config or hardcoded prerequisite checks
- `shell:run-sync` and `shell:run-streaming` only accessible via IPC handle (main process validates)
- better-sqlite3 uses parameterized queries (no SQL injection)
- Streaming executor uses `zsh -l -c` with inherited login shell environment only

---

## 13. Implementation Checkpoints

### Checkpoint 1: Electron Shell
- Bare Electron + Vite + React + Tailwind + Bun
- Window opens, React renders, theme toggle works
- CJS main process, preload, shell-env loader
- **Test**: `bun run dev` → window shows "Hello WorkOS" with working theme toggle

### Checkpoint 2: SQLite + IPC
- better-sqlite3 wired, schema created on first run
- All IPC handlers registered
- Typed IPC wrapper in frontend
- **Test**: create/read workspace from React DevTools console via `window.electronAPI`

### Checkpoint 3: Onboarding Wizard
- Prerequisites detection (brew, git, ssh)
- Install flow with xterm streaming output
- Workspace creation form with directory picker
- Setup complete flag → redirect to dashboard
- **Test**: fresh `bun run reset` → launch → complete onboarding → land on dashboard

### Checkpoint 4: Dashboard + Project CRUD
- Project list for active workspace
- Add project dialog
- Edit/delete project
- Workspace switcher in sidebar
- **Test**: add 2 projects, switch workspace, see empty state, switch back

### Checkpoint 5: Process Manager
- Start/stop dev command per project
- xterm terminal with streaming output
- Process cleanup on window close
- Open in IDE / Finder buttons
- **Test**: add project with `echo "hello" && sleep 5 && echo "done"` as dev command, start, see output, stop

### Checkpoint 6: Settings + Export/Import
- Prerequisites re-check panel
- Workspace management (add/delete)
- JSON export/import with relative paths
- **Test**: export, `bun run reset`, re-onboard, import → projects restored

---

## 14. Non-Goals (This Phase)

- No auto-updater / Electron Builder packaging (future)
- No git clone from the app (user clones manually, adds local path)
- No tools.yaml catalog system
- No remote environment support
- No authentication / multi-user
- No knowledge base / repo deep-dive (future)
- No process orchestration (start multiple projects at once — future)
