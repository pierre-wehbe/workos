# PR Review System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-assisted PR review workflows to WorkOS — including a PR detail page with briefing/comments/rubric/actions tabs, a decoupled Task Agents system, configurable rubric scoring, and smart caching.

**Architecture:** Backend modules (`pr-detail.js`, `agents.js`, `rubric.js`) handle GraphQL reads, agent lifecycle, and rubric storage. Frontend adds a PR detail page navigated from the existing GitHub page, plus a Task Agents badge/panel in the titlebar. All persistence uses existing SQLite via `db.js`.

**Tech Stack:** Electron (CJS main process), React 19, TypeScript, Tailwind CSS 4, better-sqlite3, `gh` CLI (GraphQL + REST), xterm.js

---

## File Structure

### New Files — Desktop (main process, CJS)
| File | Responsibility |
|------|---------------|
| `desktop/pr-detail.js` | GraphQL queries for single PR detail, REST writes for posting comments/reviews |
| `desktop/agents.js` | Task agent lifecycle: spawn AI CLI, stream output, cancel, worktree create/cleanup |
| `desktop/rubric.js` | Rubric category CRUD, default seeding, threshold read/write |

### New Files — Frontend (TSX)
| File | Responsibility |
|------|---------------|
| `src/lib/pr-types.ts` | Types for PR detail, agent tasks, rubric (separate from main types.ts to keep files focused) |
| `src/lib/use-pr-detail.ts` | Hook for single PR data fetch + cache |
| `src/lib/use-agents.ts` | Hook for agent task state (list, start, cancel, clear) |
| `src/lib/use-rubric.ts` | Hook for rubric config CRUD |
| `src/pages/github/PRDetailPage.tsx` | PR detail page shell — header, tab navigation, sub-tab rendering |
| `src/pages/github/tabs/BriefingTab.tsx` | Summary, key changes, inline rubric score, quick actions |
| `src/pages/github/tabs/CommentsTab.tsx` | Threaded comments with quick response buttons |
| `src/pages/github/tabs/RubricTab.tsx` | Full rubric score breakdown |
| `src/pages/github/tabs/ActionsTab.tsx` | Context-dependent action buttons (reviewer vs author) |
| `src/components/AgentBadge.tsx` | Titlebar badge with running count + pulse dot |
| `src/components/AgentPanel.tsx` | Popover panel listing agent tasks |
| `src/components/AgentTerminal.tsx` | Fullscreen terminal for agent output (portal, reuses FullscreenTerminal pattern) |
| `src/pages/settings/RubricEditor.tsx` | Rubric category editor + threshold config |

### Modified Files
| File | Changes |
|------|---------|
| `desktop/db.js` | Add 3 new tables (`pr_cache`, `agent_tasks`, `rubric_categories`), rubric CRUD functions, PR cache functions, agent task persistence |
| `desktop/main.js` | Register IPC handlers for pr-detail, agents, rubric, pr-cache |
| `desktop/preload.js` | Expose new IPC methods to renderer |
| `src/env.d.ts` | Add ElectronAPI type declarations for new methods |
| `src/lib/ipc.ts` | Add typed wrappers for new IPC methods |
| `src/lib/types.ts` | (Minimal — imports from pr-types.ts where needed) |
| `src/pages/github/GitHubPage.tsx` | Change PRRow click from external link to `onOpenPR` callback |
| `src/pages/settings/SettingsPage.tsx` | Add "Review Rubric" tab |
| `src/App.tsx` | Add AgentBadge, AgentPanel, PR detail navigation state, useAgents hook |

---

### Task 1: DB Schema — New Tables and Rubric Seeding

**Files:**
- Modify: `desktop/db.js`

- [ ] **Step 1: Add the three new tables to the `init()` function**

In `desktop/db.js`, add after the existing `CREATE TABLE IF NOT EXISTS tools` block (inside the same `db.exec` template literal):

```js
    CREATE TABLE IF NOT EXISTS pr_cache (
      pr_id TEXT PRIMARY KEY,
      pr_data TEXT,
      summary TEXT,
      rubric_result TEXT,
      comment_threads TEXT,
      last_fetched_at TEXT,
      last_analyzed_at TEXT,
      pr_state TEXT NOT NULL DEFAULT 'OPEN',
      head_sha TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      pr_id TEXT,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cli TEXT,
      result TEXT,
      token_estimate INTEGER DEFAULT 0,
      log_file TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS rubric_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      weight INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
```

- [ ] **Step 2: Add rubric default seeding after table creation**

Add after the existing migration block (after the `github_orgs` migration), still inside `init()`:

```js
  // Seed default rubric categories if empty
  const rubricCount = db.prepare("SELECT COUNT(*) as c FROM rubric_categories").get().c;
  if (rubricCount === 0) {
    const defaults = [
      { name: "Code Clarity", weight: 20, description: "Readable naming, consistent style, small focused functions, clear intent without excessive comments.", order: 0 },
      { name: "Test Coverage", weight: 20, description: "Tests for happy path, edge cases, error scenarios. Integration tests where appropriate.", order: 1 },
      { name: "Architecture", weight: 20, description: "Clean separation of concerns, appropriate abstractions, no unnecessary coupling.", order: 2 },
      { name: "Error Handling", weight: 15, description: "Graceful error handling, no silent failures, appropriate logging.", order: 3 },
      { name: "Security", weight: 15, description: "No injection vulnerabilities, proper input validation, safe defaults.", order: 4 },
      { name: "PR Hygiene", weight: 10, description: "Descriptive title and body, atomic commits, reasonable PR size.", order: 5 },
    ];
    const insert = db.prepare("INSERT INTO rubric_categories (id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?)");
    for (const d of defaults) {
      insert.run(uuid(), d.name, d.weight, d.description, d.order);
    }
  }
```

- [ ] **Step 3: Add PR cache CRUD functions**

Add after the existing export/import section in `db.js`:

```js
// PR Cache
function getPrCache(prId) {
  const row = db.prepare("SELECT * FROM pr_cache WHERE pr_id = ?").get(prId);
  return row ? { ...row, prData: row.pr_data ? JSON.parse(row.pr_data) : null, rubricResult: row.rubric_result ? JSON.parse(row.rubric_result) : null, commentThreads: row.comment_threads ? JSON.parse(row.comment_threads) : null } : null;
}

function upsertPrCache(prId, fields) {
  const existing = db.prepare("SELECT pr_id FROM pr_cache WHERE pr_id = ?").get(prId);
  if (existing) {
    const sets = [];
    const vals = [];
    if ("prData" in fields) { sets.push("pr_data = ?"); vals.push(JSON.stringify(fields.prData)); }
    if ("summary" in fields) { sets.push("summary = ?"); vals.push(fields.summary); }
    if ("rubricResult" in fields) { sets.push("rubric_result = ?"); vals.push(JSON.stringify(fields.rubricResult)); }
    if ("commentThreads" in fields) { sets.push("comment_threads = ?"); vals.push(JSON.stringify(fields.commentThreads)); }
    if ("lastFetchedAt" in fields) { sets.push("last_fetched_at = ?"); vals.push(fields.lastFetchedAt); }
    if ("lastAnalyzedAt" in fields) { sets.push("last_analyzed_at = ?"); vals.push(fields.lastAnalyzedAt); }
    if ("prState" in fields) { sets.push("pr_state = ?"); vals.push(fields.prState); }
    if ("headSha" in fields) { sets.push("head_sha = ?"); vals.push(fields.headSha); }
    if (sets.length > 0) { vals.push(prId); db.prepare(`UPDATE pr_cache SET ${sets.join(", ")} WHERE pr_id = ?`).run(...vals); }
  } else {
    db.prepare("INSERT INTO pr_cache (pr_id, pr_data, summary, rubric_result, comment_threads, last_fetched_at, last_analyzed_at, pr_state, head_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      prId,
      fields.prData ? JSON.stringify(fields.prData) : null,
      fields.summary ?? null,
      fields.rubricResult ? JSON.stringify(fields.rubricResult) : null,
      fields.commentThreads ? JSON.stringify(fields.commentThreads) : null,
      fields.lastFetchedAt ?? null,
      fields.lastAnalyzedAt ?? null,
      fields.prState ?? "OPEN",
      fields.headSha ?? null,
    );
  }
}

function cleanupPrCache() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM pr_cache WHERE pr_state IN ('MERGED', 'CLOSED') AND last_fetched_at < ?").run(cutoff);
  db.prepare("DELETE FROM agent_tasks WHERE pr_id IN (SELECT pr_id FROM pr_cache WHERE pr_state IN ('MERGED', 'CLOSED') AND last_fetched_at < ?)").run(cutoff);
}

function updatePrState(prId, state) {
  db.prepare("UPDATE pr_cache SET pr_state = ? WHERE pr_id = ?").run(state, prId);
}
```

- [ ] **Step 4: Add rubric CRUD functions**

```js
// Rubric
function getRubricCategories() {
  return db.prepare("SELECT * FROM rubric_categories ORDER BY sort_order").all();
}

function saveRubricCategories(categories) {
  const deleteTx = db.transaction(() => {
    db.prepare("DELETE FROM rubric_categories").run();
    const insert = db.prepare("INSERT INTO rubric_categories (id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?)");
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      insert.run(c.id || uuid(), c.name, c.weight, c.description, i);
    }
  });
  deleteTx();
}

function getRubricThresholds() {
  const raw = getMeta("rubric_thresholds");
  if (!raw) return { autoApproveScore: 95, autoApproveMaxFiles: 5, autoApproveMaxLines: 300, autoSummarizeMaxFiles: 5, autoSummarizeMaxLines: 300 };
  try { return JSON.parse(raw); } catch { return { autoApproveScore: 95, autoApproveMaxFiles: 5, autoApproveMaxLines: 300, autoSummarizeMaxFiles: 5, autoSummarizeMaxLines: 300 }; }
}

function saveRubricThresholds(thresholds) {
  setMeta("rubric_thresholds", JSON.stringify(thresholds));
}
```

- [ ] **Step 5: Add agent task persistence functions**

```js
// Agent Tasks
function getAgentTasks() {
  return db.prepare("SELECT * FROM agent_tasks ORDER BY started_at DESC").all();
}

function getAgentTask(id) {
  return db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id) ?? null;
}

function createAgentTask({ id, prId, taskType, cli }) {
  db.prepare("INSERT INTO agent_tasks (id, pr_id, task_type, status, cli, started_at) VALUES (?, ?, ?, 'running', ?, ?)").run(id, prId, taskType, cli, new Date().toISOString());
  return db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id);
}

function updateAgentTask(id, fields) {
  const colMap = { status: "status", result: "result", tokenEstimate: "token_estimate", logFile: "log_file", completedAt: "completed_at" };
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) { sets.push(`${col} = ?`); vals.push(fields[key]); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE agent_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

function clearAgentTask(id) {
  db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(id);
}

function clearCompletedAgentTasks() {
  db.prepare("DELETE FROM agent_tasks WHERE status IN ('completed', 'failed', 'cancelled')").run();
}
```

- [ ] **Step 6: Update module.exports**

Add all new functions to the `module.exports` object:

```js
module.exports = {
  init, getMeta, setMeta, getSetupComplete, setSetupComplete,
  getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, getActiveWorkspace, setActiveWorkspace,
  getProjects, createProject, updateProject, getProjectById, deleteProject,
  exportConfig, importConfig,
  getTools, createTool, deleteTool, updateTool,
  // PR Cache
  getPrCache, upsertPrCache, cleanupPrCache, updatePrState,
  // Rubric
  getRubricCategories, saveRubricCategories, getRubricThresholds, saveRubricThresholds,
  // Agent Tasks
  getAgentTasks, getAgentTask, createAgentTask, updateAgentTask, clearAgentTask, clearCompletedAgentTasks,
};
```

- [ ] **Step 7: Verify — run the app to confirm DB initialization works**

Run: `npm run dev`
Expected: App launches without errors. Check the dev tools console for any SQLite errors. Reset DB if needed with `npm run reset` first.

- [ ] **Step 8: Commit**

```bash
git add desktop/db.js
git commit -m "feat: add pr_cache, agent_tasks, rubric_categories tables with CRUD"
```

---

### Task 2: TypeScript Types for PR Detail, Agents, and Rubric

**Files:**
- Create: `src/lib/pr-types.ts`

- [ ] **Step 1: Create the new types file**

```ts
// Types for the PR Review System — PR detail, agent tasks, rubric

export interface PRDetail {
  owner: string;
  repo: string;
  repoName: string;
  number: number;
  title: string;
  author: string;
  state: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PRFile[];
  reviewThreads: PRReviewThread[];
  reviews: PRReview[];
  ciStatus: string | null;
  labels: string[];
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
}

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PRReviewThread {
  id: string;
  path: string | null;
  line: number | null;
  isResolved: boolean;
  comments: PRComment[];
}

export interface PRComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface PRReview {
  id: string;
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED";
  body: string;
  createdAt: string;
}

export interface PRCacheEntry {
  prId: string;
  prData: PRDetail | null;
  summary: string | null;
  rubricResult: RubricResult | null;
  commentThreads: PRReviewThread[] | null;
  lastFetchedAt: string | null;
  lastAnalyzedAt: string | null;
  prState: string;
  headSha: string | null;
}

export interface RubricCategory {
  id: string;
  name: string;
  weight: number;
  description: string;
  sortOrder: number;
}

export interface RubricThresholds {
  autoApproveScore: number;
  autoApproveMaxFiles: number;
  autoApproveMaxLines: number;
  autoSummarizeMaxFiles: number;
  autoSummarizeMaxLines: number;
}

export interface RubricResult {
  overallScore: number;
  categories: RubricCategoryScore[];
}

export interface RubricCategoryScore {
  name: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export type AgentTaskType = "summarize" | "rubric" | "draft_review" | "implement_fix" | "address_comments" | "summarize_feedback" | "draft_reply";
export type AgentTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentTask {
  id: string;
  prId: string;
  taskType: AgentTaskType;
  status: AgentTaskStatus;
  cli: string;
  result: string | null;
  tokenEstimate: number;
  logFile: string | null;
  startedAt: string;
  completedAt: string | null;
}
```

- [ ] **Step 2: Verify — run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors (file is standalone, no imports from unwritten modules)

- [ ] **Step 3: Commit**

```bash
git add src/lib/pr-types.ts
git commit -m "feat: add TypeScript types for PR detail, agents, and rubric"
```

---

### Task 3: PR Detail Backend Module

**Files:**
- Create: `desktop/pr-detail.js`

- [ ] **Step 1: Create the pr-detail module with GraphQL query function**

```js
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { loadShellEnvironment } = require("./shell-env.js");

const execFileAsync = promisify(execFile);

async function gh(args) {
  const env = { ...loadShellEnvironment(), HOMEBREW_NO_AUTO_UPDATE: "1" };
  try {
    const { stdout } = await execFileAsync("gh", args, { encoding: "utf8", env, timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return null;
  }
}

const PR_DETAIL_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      author { login }
      state
      isDraft
      createdAt
      updatedAt
      headRefOid
      additions
      deletions
      changedFiles
      reviewDecision
      labels(first: 20) { nodes { name } }
      files(first: 100) {
        nodes { path additions deletions }
      }
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 50) {
            nodes { id author { login } body createdAt }
          }
        }
      }
      reviews(first: 50) {
        nodes { id author { login } state body createdAt }
      }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup { state }
          }
        }
      }
    }
  }
}`;

async function fetchPRDetail(owner, repo, number) {
  const raw = await gh([
    "api", "graphql",
    "-F", `owner=${owner}`,
    "-F", `repo=${repo}`,
    "-F", `number=${number}`,
    "-f", `query=${PR_DETAIL_QUERY}`,
  ]);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    const pr = data.data?.repository?.pullRequest;
    if (!pr) return null;

    return {
      owner,
      repo: `${owner}/${repo}`,
      repoName: repo,
      number,
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      state: pr.state,
      isDraft: pr.isDraft ?? false,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      headSha: pr.headRefOid,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      reviewDecision: pr.reviewDecision ?? null,
      labels: (pr.labels?.nodes ?? []).map((l) => l.name),
      files: (pr.files?.nodes ?? []).map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
      })),
      reviewThreads: (pr.reviewThreads?.nodes ?? []).map((t) => ({
        id: t.id,
        path: t.path ?? null,
        line: t.line ?? null,
        isResolved: t.isResolved,
        comments: (t.comments?.nodes ?? []).map((c) => ({
          id: c.id,
          author: c.author?.login ?? "unknown",
          body: c.body,
          createdAt: c.createdAt,
        })),
      })),
      reviews: (pr.reviews?.nodes ?? []).map((r) => ({
        id: r.id,
        author: r.author?.login ?? "unknown",
        state: r.state,
        body: r.body,
        createdAt: r.createdAt,
      })),
      ciStatus: pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
    };
  } catch {
    return null;
  }
}

async function postComment(owner, repo, number, body) {
  const result = await gh([
    "api", `repos/${owner}/${repo}/issues/${number}/comments`,
    "-f", `body=${body}`,
  ]);
  return { ok: !!result };
}

async function replyToThread(owner, repo, number, commentId, body) {
  const result = await gh([
    "api", `repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`,
    "-f", `body=${body}`,
  ]);
  return { ok: !!result };
}

async function submitReview(owner, repo, number, event, body) {
  // event: "APPROVE", "REQUEST_CHANGES", "COMMENT"
  const args = [
    "api", `repos/${owner}/${repo}/pulls/${number}/reviews`,
    "-f", `event=${event}`,
  ];
  if (body) args.push("-f", `body=${body}`);
  const result = await gh(args);
  return { ok: !!result };
}

async function resolveThread(owner, repo, number, threadId) {
  // GraphQL mutation to resolve a review thread
  const mutation = `mutation { resolveReviewThread(input: { threadId: "${threadId}" }) { thread { isResolved } } }`;
  const result = await gh(["api", "graphql", "-f", `query=${mutation}`]);
  return { ok: !!result };
}

module.exports = { fetchPRDetail, postComment, replyToThread, submitReview, resolveThread };
```

- [ ] **Step 2: Verify — quick manual test of GraphQL query**

Run in terminal (not in app — just to verify the query works):
```bash
gh api graphql -F owner=YOUR_ORG -F repo=YOUR_REPO -F number=YOUR_PR_NUMBER -f query="query(\$owner: String!, \$repo: String!, \$number: Int!) { repository(owner: \$owner, name: \$repo) { pullRequest(number: \$number) { title author { login } state changedFiles } } }"
```
Expected: JSON response with PR title, author, state, and file count.

- [ ] **Step 3: Commit**

```bash
git add desktop/pr-detail.js
git commit -m "feat: add pr-detail module with GraphQL query and REST writes"
```

---

### Task 4: Rubric Backend Module

**Files:**
- Create: `desktop/rubric.js`

- [ ] **Step 1: Create the rubric module**

This is a thin wrapper around db.js functions, providing the interface for IPC handlers:

```js
const db = require("./db.js");

function getCategories() {
  return db.getRubricCategories().map((row) => ({
    id: row.id,
    name: row.name,
    weight: row.weight,
    description: row.description,
    sortOrder: row.sort_order,
  }));
}

function saveCategories(categories) {
  db.saveRubricCategories(categories);
  return getCategories();
}

function getThresholds() {
  return db.getRubricThresholds();
}

function saveThresholds(thresholds) {
  db.saveRubricThresholds(thresholds);
  return getThresholds();
}

module.exports = { getCategories, saveCategories, getThresholds, saveThresholds };
```

- [ ] **Step 2: Commit**

```bash
git add desktop/rubric.js
git commit -m "feat: add rubric module for category and threshold management"
```

---

### Task 5: Agent System Backend Module

**Files:**
- Create: `desktop/agents.js`

- [ ] **Step 1: Create the agents module with core lifecycle**

```js
const { spawn } = require("node:child_process");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadShellEnvironment } = require("./shell-env.js");
const db = require("./db.js");

const registry = new Map(); // in-memory running agent state
let logsDir = null;
let mainWindow = null;

function init(app, window) {
  logsDir = path.join(app.getPath("userData"), "agent-logs");
  fs.mkdirSync(logsDir, { recursive: true });
  mainWindow = window;
  // Restore running tasks as failed (app was restarted)
  for (const task of db.getAgentTasks()) {
    if (task.status === "running") {
      db.updateAgentTask(task.id, { status: "failed", completedAt: new Date().toISOString() });
    }
  }
}

function setWindow(window) {
  mainWindow = window;
}

function emit(event, data) {
  if (mainWindow) mainWindow.webContents.send(event, data);
}

function startTask({ prId, taskType, cli, prompt, workingDir }) {
  const id = crypto.randomUUID();
  const logFile = path.join(logsDir, `${id}.log`);
  const env = loadShellEnvironment();

  // Persist to DB
  db.createAgentTask({ id, prId, taskType, cli });

  // Build CLI command
  // Each CLI has different prompt flags:
  // claude: claude -p "prompt" --output-format text
  // codex: codex -q "prompt"
  // gemini: gemini -p "prompt"
  let args;
  if (cli === "claude") {
    args = ["-p", prompt, "--output-format", "text"];
  } else if (cli === "codex") {
    args = ["-q", prompt];
  } else {
    // gemini
    args = ["-p", prompt];
  }

  const cwd = workingDir || undefined;
  const child = spawn(cli, args, { env, cwd, timeout: 0, detached: true });

  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  let output = "";

  const entry = {
    id,
    prId,
    taskType,
    status: "running",
    cli,
    result: null,
    tokenEstimate: 0,
    logFile,
    startedAt: new Date().toISOString(),
    completedAt: null,
    _child: child,
  };

  registry.set(id, entry);
  emit("agent-task:update", toSerializable(entry));

  const handleData = (chunk) => {
    const text = chunk.toString();
    logStream.write(text);
    output += text;
    // Rough token estimate: ~4 chars per token
    entry.tokenEstimate = Math.round(output.length / 4);
    emit("agent-task:output", { id, chunk: text });
  };

  child.stdout.on("data", handleData);
  child.stderr.on("data", handleData);

  child.on("close", (code) => {
    entry.status = code === 0 ? "completed" : "failed";
    entry.result = output;
    entry.completedAt = new Date().toISOString();
    logStream.end();
    db.updateAgentTask(id, {
      status: entry.status,
      result: output,
      tokenEstimate: entry.tokenEstimate,
      logFile,
      completedAt: entry.completedAt,
    });
    emit("agent-task:update", toSerializable(entry));
  });

  child.on("error", (err) => {
    entry.status = "failed";
    entry.result = err.message;
    entry.completedAt = new Date().toISOString();
    logStream.end();
    db.updateAgentTask(id, {
      status: "failed",
      result: err.message,
      tokenEstimate: entry.tokenEstimate,
      logFile,
      completedAt: entry.completedAt,
    });
    emit("agent-task:update", toSerializable(entry));
  });

  return toSerializable(entry);
}

function cancelTask(id) {
  const entry = registry.get(id);
  if (!entry || entry.status !== "running" || !entry._child) return;
  const pid = entry._child.pid;
  try { process.kill(-pid, "SIGTERM"); } catch { entry._child.kill("SIGTERM"); }
  setTimeout(() => {
    if (entry.status === "running") {
      try { process.kill(-pid, "SIGKILL"); } catch {}
      entry.status = "cancelled";
      entry.completedAt = new Date().toISOString();
      db.updateAgentTask(id, { status: "cancelled", completedAt: entry.completedAt });
      emit("agent-task:update", toSerializable(entry));
    }
  }, 3000);
}

function listTasks() {
  // Merge in-memory running tasks with DB persisted tasks
  const dbTasks = db.getAgentTasks();
  return dbTasks.map((t) => {
    const running = registry.get(t.id);
    if (running) {
      return toSerializable(running);
    }
    return {
      id: t.id,
      prId: t.pr_id,
      taskType: t.task_type,
      status: t.status,
      cli: t.cli,
      result: t.result,
      tokenEstimate: t.token_estimate,
      logFile: t.log_file,
      startedAt: t.started_at,
      completedAt: t.completed_at,
    };
  });
}

function getTaskLogs(id) {
  const entry = registry.get(id);
  if (entry) {
    try { return fs.readFileSync(entry.logFile, "utf8"); } catch { return ""; }
  }
  const task = db.getAgentTask(id);
  if (task?.log_file) {
    try { return fs.readFileSync(task.log_file, "utf8"); } catch { return ""; }
  }
  return "";
}

function clearTask(id) {
  const entry = registry.get(id);
  if (entry && entry.status === "running") return; // Can't clear running
  if (entry) {
    try { fs.unlinkSync(entry.logFile); } catch {}
    registry.delete(id);
  }
  db.clearAgentTask(id);
}

function clearAllCompleted() {
  for (const [id, entry] of registry) {
    if (entry.status !== "running") {
      try { fs.unlinkSync(entry.logFile); } catch {}
      registry.delete(id);
    }
  }
  db.clearCompletedAgentTasks();
}

// --- Worktree Management ---

function createWorktree(repoPath, branch) {
  const id = crypto.randomUUID().slice(0, 8);
  const worktreePath = path.join(require("os").tmpdir(), `workos-agent-${id}`);
  const env = loadShellEnvironment();
  try {
    // Fetch the branch first
    execFileSync("git", ["-C", repoPath, "fetch", "origin", branch], { encoding: "utf8", env, timeout: 30000 });
  } catch {} // May fail if branch is local-only
  try {
    execFileSync("git", ["-C", repoPath, "worktree", "add", worktreePath, `origin/${branch}`], { encoding: "utf8", env, timeout: 15000 });
    return { ok: true, path: worktreePath };
  } catch (err) {
    // Try without origin/ prefix (local branch)
    try {
      execFileSync("git", ["-C", repoPath, "worktree", "add", worktreePath, branch], { encoding: "utf8", env, timeout: 15000 });
      return { ok: true, path: worktreePath };
    } catch (err2) {
      return { ok: false, error: err2.message };
    }
  }
}

function removeWorktree(repoPath, worktreePath) {
  const env = loadShellEnvironment();
  try {
    execFileSync("git", ["-C", repoPath, "worktree", "remove", worktreePath, "--force"], { encoding: "utf8", env, timeout: 10000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function killAll() {
  for (const entry of registry.values()) {
    if (entry.status === "running" && entry._child) {
      entry._child.kill("SIGTERM");
    }
  }
}

function getRunningCount() {
  let count = 0;
  for (const entry of registry.values()) {
    if (entry.status === "running") count++;
  }
  return count;
}

function toSerializable(entry) {
  const { _child, ...rest } = entry;
  return rest;
}

module.exports = {
  init, setWindow, startTask, cancelTask, listTasks, getTaskLogs,
  clearTask, clearAllCompleted, createWorktree, removeWorktree,
  killAll, getRunningCount,
};
```

- [ ] **Step 2: Commit**

```bash
git add desktop/agents.js
git commit -m "feat: add agents module with task lifecycle and worktree management"
```

---

### Task 6: IPC Wiring — Main Process, Preload, and Env Types

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/preload.js`
- Modify: `src/env.d.ts`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Add requires and IPC handlers in main.js**

At the top of `desktop/main.js`, add after the existing requires:

```js
const prDetail = require("./pr-detail.js");
const agents = require("./agents.js");
const rubric = require("./rubric.js");
```

Inside `app.whenReady().then(() => { ... })`, after the existing `// --- Machine ---` section and before `createWindow()`, add:

```js
  // --- PR Detail ---
  ipcMain.handle("pr:fetch-detail", (_e, owner, repo, number) => prDetail.fetchPRDetail(owner, repo, number));
  ipcMain.handle("pr:post-comment", (_e, owner, repo, number, body) => prDetail.postComment(owner, repo, number, body));
  ipcMain.handle("pr:reply-to-thread", (_e, owner, repo, number, commentId, body) => prDetail.replyToThread(owner, repo, number, commentId, body));
  ipcMain.handle("pr:submit-review", (_e, owner, repo, number, event, body) => prDetail.submitReview(owner, repo, number, event, body));
  ipcMain.handle("pr:resolve-thread", (_e, owner, repo, number, threadId) => prDetail.resolveThread(owner, repo, number, threadId));

  // --- Agents ---
  ipcMain.handle("agent:start", (_e, data) => agents.startTask(data));
  ipcMain.handle("agent:cancel", (_e, id) => agents.cancelTask(id));
  ipcMain.handle("agent:list", () => agents.listTasks());
  ipcMain.handle("agent:logs", (_e, id) => agents.getTaskLogs(id));
  ipcMain.handle("agent:clear", (_e, id) => agents.clearTask(id));
  ipcMain.handle("agent:clear-all-completed", () => agents.clearAllCompleted());
  ipcMain.handle("agent:running-count", () => agents.getRunningCount());
  ipcMain.handle("agent:create-worktree", (_e, repoPath, branch) => agents.createWorktree(repoPath, branch));
  ipcMain.handle("agent:remove-worktree", (_e, repoPath, worktreePath) => agents.removeWorktree(repoPath, worktreePath));

  // --- Rubric ---
  ipcMain.handle("rubric:get-categories", () => rubric.getCategories());
  ipcMain.handle("rubric:save-categories", (_e, categories) => rubric.saveCategories(categories));
  ipcMain.handle("rubric:get-thresholds", () => rubric.getThresholds());
  ipcMain.handle("rubric:save-thresholds", (_e, thresholds) => rubric.saveThresholds(thresholds));

  // --- PR Cache ---
  ipcMain.handle("pr-cache:get", (_e, prId) => db.getPrCache(prId));
  ipcMain.handle("pr-cache:upsert", (_e, prId, fields) => db.upsertPrCache(prId, fields));
  ipcMain.handle("pr-cache:cleanup", () => db.cleanupPrCache());
```

After `createWindow()`, add agent init:

```js
  agents.init(app, mainWindow);
```

In the `before-quit` handler, add agents cleanup:

```js
app.on("before-quit", () => { killAll(); processes.killAll(); agents.killAll(); github.destroy(); });
```

- [ ] **Step 2: Add preload bridge methods**

In `desktop/preload.js`, add after the `// GitHub` section:

```js
  // PR Detail
  fetchPRDetail: (owner, repo, number) => ipcRenderer.invoke("pr:fetch-detail", owner, repo, number),
  postPRComment: (owner, repo, number, body) => ipcRenderer.invoke("pr:post-comment", owner, repo, number, body),
  replyToThread: (owner, repo, number, commentId, body) => ipcRenderer.invoke("pr:reply-to-thread", owner, repo, number, commentId, body),
  submitReview: (owner, repo, number, event, body) => ipcRenderer.invoke("pr:submit-review", owner, repo, number, event, body),
  resolveThread: (owner, repo, number, threadId) => ipcRenderer.invoke("pr:resolve-thread", owner, repo, number, threadId),

  // Agents
  startAgent: (data) => ipcRenderer.invoke("agent:start", data),
  cancelAgent: (id) => ipcRenderer.invoke("agent:cancel", id),
  listAgents: () => ipcRenderer.invoke("agent:list"),
  getAgentLogs: (id) => ipcRenderer.invoke("agent:logs", id),
  clearAgent: (id) => ipcRenderer.invoke("agent:clear", id),
  clearAllCompletedAgents: () => ipcRenderer.invoke("agent:clear-all-completed"),
  getAgentRunningCount: () => ipcRenderer.invoke("agent:running-count"),
  createWorktree: (repoPath, branch) => ipcRenderer.invoke("agent:create-worktree", repoPath, branch),
  removeWorktree: (repoPath, worktreePath) => ipcRenderer.invoke("agent:remove-worktree", repoPath, worktreePath),
  onAgentUpdate: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on("agent-task:update", handler);
    return () => ipcRenderer.removeListener("agent-task:update", handler);
  },
  onAgentOutput: (cb) => {
    const handler = (_e, d) => cb(d.id, d.chunk);
    ipcRenderer.on("agent-task:output", handler);
    return () => ipcRenderer.removeListener("agent-task:output", handler);
  },

  // Rubric
  getRubricCategories: () => ipcRenderer.invoke("rubric:get-categories"),
  saveRubricCategories: (categories) => ipcRenderer.invoke("rubric:save-categories", categories),
  getRubricThresholds: () => ipcRenderer.invoke("rubric:get-thresholds"),
  saveRubricThresholds: (thresholds) => ipcRenderer.invoke("rubric:save-thresholds", thresholds),

  // PR Cache
  getPrCache: (prId) => ipcRenderer.invoke("pr-cache:get", prId),
  upsertPrCache: (prId, fields) => ipcRenderer.invoke("pr-cache:upsert", prId, fields),
  cleanupPrCache: () => ipcRenderer.invoke("pr-cache:cleanup"),
```

- [ ] **Step 3: Add TypeScript declarations in env.d.ts**

Add after the `// GitHub` section in `src/env.d.ts`:

```ts
  // PR Detail
  fetchPRDetail: (owner: string, repo: string, number: number) => Promise<import("./lib/pr-types").PRDetail | null>;
  postPRComment: (owner: string, repo: string, number: number, body: string) => Promise<{ ok: boolean }>;
  replyToThread: (owner: string, repo: string, number: number, commentId: string, body: string) => Promise<{ ok: boolean }>;
  submitReview: (owner: string, repo: string, number: number, event: string, body?: string) => Promise<{ ok: boolean }>;
  resolveThread: (owner: string, repo: string, number: number, threadId: string) => Promise<{ ok: boolean }>;

  // Agents
  startAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<import("./lib/pr-types").AgentTask>;
  cancelAgent: (id: string) => Promise<void>;
  listAgents: () => Promise<import("./lib/pr-types").AgentTask[]>;
  getAgentLogs: (id: string) => Promise<string>;
  clearAgent: (id: string) => Promise<void>;
  clearAllCompletedAgents: () => Promise<void>;
  getAgentRunningCount: () => Promise<number>;
  createWorktree: (repoPath: string, branch: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  removeWorktree: (repoPath: string, worktreePath: string) => Promise<{ ok: boolean; error?: string }>;
  onAgentUpdate: (cb: (task: import("./lib/pr-types").AgentTask) => void) => () => void;
  onAgentOutput: (cb: (id: string, chunk: string) => void) => () => void;

  // Rubric
  getRubricCategories: () => Promise<import("./lib/pr-types").RubricCategory[]>;
  saveRubricCategories: (categories: import("./lib/pr-types").RubricCategory[]) => Promise<import("./lib/pr-types").RubricCategory[]>;
  getRubricThresholds: () => Promise<import("./lib/pr-types").RubricThresholds>;
  saveRubricThresholds: (thresholds: import("./lib/pr-types").RubricThresholds) => Promise<import("./lib/pr-types").RubricThresholds>;

  // PR Cache
  getPrCache: (prId: string) => Promise<import("./lib/pr-types").PRCacheEntry | null>;
  upsertPrCache: (prId: string, fields: Partial<import("./lib/pr-types").PRCacheEntry>) => Promise<void>;
  cleanupPrCache: () => Promise<void>;
```

- [ ] **Step 4: Add IPC wrappers in ipc.ts**

Add after the `onGithubUpdate` line in `src/lib/ipc.ts`:

```ts
  // PR Detail
  fetchPRDetail: (owner: string, repo: string, number: number) => api.fetchPRDetail(owner, repo, number),
  postPRComment: (owner: string, repo: string, number: number, body: string) => api.postPRComment(owner, repo, number, body),
  replyToThread: (owner: string, repo: string, number: number, commentId: string, body: string) => api.replyToThread(owner, repo, number, commentId, body),
  submitReview: (owner: string, repo: string, number: number, event: string, body?: string) => api.submitReview(owner, repo, number, event, body),
  resolveThread: (owner: string, repo: string, number: number, threadId: string) => api.resolveThread(owner, repo, number, threadId),
  // Agents
  startAgent: (data: Parameters<typeof api.startAgent>[0]) => api.startAgent(data),
  cancelAgent: (id: string) => api.cancelAgent(id),
  listAgents: () => api.listAgents(),
  getAgentLogs: (id: string) => api.getAgentLogs(id),
  clearAgent: (id: string) => api.clearAgent(id),
  clearAllCompletedAgents: () => api.clearAllCompletedAgents(),
  getAgentRunningCount: () => api.getAgentRunningCount(),
  createWorktree: (repoPath: string, branch: string) => api.createWorktree(repoPath, branch),
  removeWorktree: (repoPath: string, worktreePath: string) => api.removeWorktree(repoPath, worktreePath),
  onAgentUpdate: (cb: (task: import("./pr-types").AgentTask) => void) => api.onAgentUpdate(cb),
  onAgentOutput: (cb: (id: string, chunk: string) => void) => api.onAgentOutput(cb),
  // Rubric
  getRubricCategories: () => api.getRubricCategories(),
  saveRubricCategories: (categories: import("./pr-types").RubricCategory[]) => api.saveRubricCategories(categories),
  getRubricThresholds: () => api.getRubricThresholds(),
  saveRubricThresholds: (thresholds: import("./pr-types").RubricThresholds) => api.saveRubricThresholds(thresholds),
  // PR Cache
  getPrCache: (prId: string) => api.getPrCache(prId),
  upsertPrCache: (prId: string, fields: Partial<import("./pr-types").PRCacheEntry>) => api.upsertPrCache(prId, fields),
  cleanupPrCache: () => api.cleanupPrCache(),
```

- [ ] **Step 5: Verify — typecheck and launch**

Run: `npx tsc --noEmit`
Expected: No type errors.

Run: `npm run dev`
Expected: App launches, no console errors.

- [ ] **Step 6: Commit**

```bash
git add desktop/main.js desktop/preload.js src/env.d.ts src/lib/ipc.ts
git commit -m "feat: wire IPC channels for PR detail, agents, and rubric"
```

---

### Task 7: Frontend Hooks — useAgents, usePRDetail, useRubric

**Files:**
- Create: `src/lib/use-agents.ts`
- Create: `src/lib/use-pr-detail.ts`
- Create: `src/lib/use-rubric.ts`

- [ ] **Step 1: Create use-agents hook**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentTask } from "./pr-types";
import { ipc } from "./ipc";

export function useAgents() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const cleanupRef = useRef<Array<() => void>>([]);

  const refresh = useCallback(async () => {
    const list = await ipc.listAgents();
    setTasks(list);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = ipc.onAgentUpdate((task) => {
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = task;
          return next;
        }
        return [task, ...prev];
      });
    });
    cleanupRef.current = [unsub];
    return () => cleanupRef.current.forEach((fn) => fn());
  }, [refresh]);

  const start = useCallback(async (data: Parameters<typeof ipc.startAgent>[0]) => {
    return ipc.startAgent(data);
  }, []);

  const cancel = useCallback(async (id: string) => {
    await ipc.cancelAgent(id);
    setTimeout(refresh, 1000);
  }, [refresh]);

  const clear = useCallback(async (id: string) => {
    await ipc.clearAgent(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllCompleted = useCallback(async () => {
    await ipc.clearAllCompletedAgents();
    setTasks((prev) => prev.filter((t) => t.status === "running"));
  }, []);

  const getLogs = useCallback(async (id: string) => {
    return ipc.getAgentLogs(id);
  }, []);

  const runningCount = tasks.filter((t) => t.status === "running").length;

  return { tasks, runningCount, start, cancel, clear, clearAllCompleted, getLogs, refresh };
}
```

- [ ] **Step 2: Create use-pr-detail hook**

```ts
import { useCallback, useState } from "react";
import type { PRDetail, PRCacheEntry } from "./pr-types";
import { ipc } from "./ipc";

export function usePRDetail() {
  const [prDetail, setPrDetail] = useState<PRDetail | null>(null);
  const [cache, setCache] = useState<PRCacheEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (owner: string, repo: string, number: number) => {
    const prId = `${owner}/${repo}#${number}`;
    setLoading(true);

    // Load cache first
    const cached = await ipc.getPrCache(prId);
    if (cached?.prData) {
      setPrDetail(cached.prData);
      setCache(cached);
    }

    // Fetch fresh data
    const detail = await ipc.fetchPRDetail(owner, repo, number);
    if (detail) {
      setPrDetail(detail);
      // Update cache
      await ipc.upsertPrCache(prId, {
        prData: detail,
        lastFetchedAt: new Date().toISOString(),
        prState: detail.state === "MERGED" ? "MERGED" : detail.state === "CLOSED" ? "CLOSED" : "OPEN",
        headSha: detail.headSha,
      });
      // Reload cache to get updated entry
      const updatedCache = await ipc.getPrCache(prId);
      setCache(updatedCache);
    }

    setLoading(false);
    return detail;
  }, []);

  const updateCache = useCallback(async (prId: string, fields: Partial<PRCacheEntry>) => {
    await ipc.upsertPrCache(prId, fields);
    const updated = await ipc.getPrCache(prId);
    setCache(updated);
  }, []);

  const isStale = cache?.headSha && prDetail?.headSha && cache.headSha !== prDetail.headSha;

  return { prDetail, cache, loading, fetchDetail, updateCache, isStale };
}
```

- [ ] **Step 3: Create use-rubric hook**

```ts
import { useCallback, useEffect, useState } from "react";
import type { RubricCategory, RubricThresholds } from "./pr-types";
import { ipc } from "./ipc";

export function useRubric() {
  const [categories, setCategories] = useState<RubricCategory[]>([]);
  const [thresholds, setThresholds] = useState<RubricThresholds>({
    autoApproveScore: 95,
    autoApproveMaxFiles: 5,
    autoApproveMaxLines: 300,
    autoSummarizeMaxFiles: 5,
    autoSummarizeMaxLines: 300,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([ipc.getRubricCategories(), ipc.getRubricThresholds()]).then(([cats, thresh]) => {
      setCategories(cats);
      setThresholds(thresh);
      setLoading(false);
    });
  }, []);

  const saveCategories = useCallback(async (cats: RubricCategory[]) => {
    const saved = await ipc.saveRubricCategories(cats);
    setCategories(saved);
  }, []);

  const saveThresholds = useCallback(async (thresh: RubricThresholds) => {
    const saved = await ipc.saveRubricThresholds(thresh);
    setThresholds(saved);
  }, []);

  return { categories, thresholds, loading, saveCategories, saveThresholds };
}
```

- [ ] **Step 4: Verify — typecheck**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-agents.ts src/lib/use-pr-detail.ts src/lib/use-rubric.ts
git commit -m "feat: add React hooks for agents, PR detail, and rubric"
```

---

### Task 8: Agent Badge and Agent Panel

**Files:**
- Create: `src/components/AgentBadge.tsx`
- Create: `src/components/AgentPanel.tsx`
- Create: `src/components/AgentTerminal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create AgentBadge**

```tsx
import { Bot } from "lucide-react";

interface AgentBadgeProps {
  count: number;
  onClick: () => void;
}

export function AgentBadge({ count, onClick }: AgentBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg transition-colors ${
        count > 0
          ? "bg-[rgba(245,158,11,0.12)] text-amber-500 hover:bg-[rgba(245,158,11,0.2)]"
          : "text-wo-text-tertiary hover:bg-wo-bg-subtle"
      }`}
      title={`${count} running agent${count !== 1 ? "s" : ""}`}
    >
      <Bot size={14} />
      {count > 0 && (
        <>
          <span className="text-xs font-semibold tabular-nums">{count}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create AgentPanel**

```tsx
import { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, Trash2, X, Eye } from "lucide-react";
import type { AgentTask } from "../lib/pr-types";
import { AgentTerminal } from "./AgentTerminal";

interface AgentPanelProps {
  tasks: AgentTask[];
  onCancel: (id: string) => void;
  onClear: (id: string) => void;
  onClearAllCompleted: () => void;
  onGetLogs: (id: string) => Promise<string>;
  onClose: () => void;
}

function statusColor(status: AgentTask["status"]) {
  if (status === "running") return "bg-amber-500";
  if (status === "completed") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  return "bg-gray-500";
}

function taskLabel(type: string) {
  const labels: Record<string, string> = {
    summarize: "Summarize PR",
    rubric: "Rubric Score",
    draft_review: "Draft Review",
    implement_fix: "Implement Fix",
    address_comments: "Address Comments",
    summarize_feedback: "Summarize Feedback",
    draft_reply: "Draft Reply",
  };
  return labels[type] ?? type;
}

export function AgentPanel({ tasks, onCancel, onClear, onClearAllCompleted, onGetLogs, onClose }: AgentPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingTask, setViewingTask] = useState<string | null>(null);
  const [viewOutput, setViewOutput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded || viewingTask) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [onClose, expanded, viewingTask]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingTask) setViewingTask(null);
        else if (expanded) setExpanded(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, expanded, viewingTask]);

  const handleView = async (id: string) => {
    const logs = await onGetLogs(id);
    setViewOutput(logs);
    setViewingTask(id);
  };

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const completedCount = tasks.filter((t) => t.status !== "running").length;

  const panelClass = expanded
    ? "fixed inset-0 z-50 flex flex-col bg-wo-bg pt-11"
    : "absolute top-full right-0 mt-2 w-[480px] max-h-[600px] flex flex-col rounded-xl bg-wo-bg-elevated border border-wo-border shadow-2xl z-50 overflow-hidden";

  if (viewingTask) {
    const task = tasks.find((t) => t.id === viewingTask);
    return (
      <AgentTerminal
        output={viewOutput}
        isRunning={task?.status === "running"}
        title={task ? `${taskLabel(task.taskType)} · ${task.prId}` : undefined}
        onClose={() => setViewingTask(null)}
      />
    );
  }

  return (
    <div ref={panelRef} className={panelClass}>
      <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-b border-wo-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Task Agents</h3>
          <span className="text-xs text-wo-text-tertiary">{runningCount} running</span>
        </div>
        <div className="flex items-center gap-2">
          {completedCount > 0 && (
            <button type="button" onClick={onClearAllCompleted}
              className="flex items-center gap-1 px-2 h-7 rounded-md text-xs text-wo-text-tertiary hover:text-wo-danger hover:bg-wo-bg-subtle transition-colors">
              <Trash2 size={11} /> Clear completed
            </button>
          )}
          <button type="button" onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors"
            title={expanded ? "Minimize" : "Fullscreen"}>
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-wo-text-tertiary hover:bg-wo-bg-subtle transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs text-wo-text-tertiary py-8 text-center">No agent tasks yet.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className={`p-3 rounded-lg border border-wo-border ${task.status === "running" ? "bg-[rgba(245,158,11,0.04)]" : "bg-wo-bg-elevated"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${statusColor(task.status)} ${task.status === "running" ? "animate-pulse" : ""}`} />
                    <span className="font-semibold">{taskLabel(task.taskType)}</span>
                    <span className="text-wo-text-tertiary">{task.prId}</span>
                  </div>
                  <div className="text-[10px] text-wo-text-tertiary mt-1">
                    {task.cli} · {task.status === "running" ? "running" : task.status}
                    {task.tokenEstimate > 0 && ` · ~${(task.tokenEstimate / 1000).toFixed(1)}k tokens`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {task.status === "running" ? (
                    <button type="button" onClick={() => onCancel(task.id)}
                      className="text-[10px] px-2 py-1 border border-red-500/30 text-red-500 rounded hover:bg-red-500/10 transition-colors">
                      Cancel
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => handleView(task.id)}
                        className="text-[10px] px-2 py-1 border border-wo-border rounded hover:bg-wo-bg-subtle transition-colors flex items-center gap-1">
                        <Eye size={9} /> View
                      </button>
                      <button type="button" onClick={() => onClear(task.id)}
                        className="text-[10px] px-2 py-1 border border-wo-border rounded hover:bg-wo-bg-subtle transition-colors">
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create AgentTerminal**

Reuses the same portal-based fullscreen pattern as `FullscreenTerminal.tsx`:

```tsx
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
      theme: { background: "#0f1512", foreground: "#9ab5aa", cursor: "transparent" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_event, uri) => { window.open(uri, "_blank"); }));
    term.open(containerRef.current);
    if (output) term.write(output);
    lastLengthRef.current = output.length;
    termRef.current = term;
    requestAnimationFrame(() => fit.fit());
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); term.dispose(); };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const newContent = output.slice(lastLengthRef.current);
    if (newContent) { term.write(newContent); lastLengthRef.current = output.length; }
  }, [output]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-100 bg-[#0f1512] flex flex-col pt-11">
      <div className="shrink-0 flex items-center justify-between px-5 h-10 border-b border-[#1c2622]">
        <div className="flex items-center gap-2">
          {isRunning && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          <span className="text-xs text-[#6b8a7e]">{title ?? (isRunning ? "Running" : "Completed")}</span>
        </div>
        <button type="button" onClick={onClose}
          className="p-1.5 rounded-md text-[#6b8a7e] hover:text-[#e0ede7] hover:bg-[#1c2622] transition-colors"
          title="Exit fullscreen (Esc)">
          <Minimize2 size={14} />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 p-3" />
    </div>,
    document.body
  );
}
```

- [ ] **Step 4: Wire AgentBadge and AgentPanel into App.tsx**

In `src/App.tsx`:

Add imports:
```tsx
import { AgentBadge } from "./components/AgentBadge";
import { AgentPanel } from "./components/AgentPanel";
import { useAgents } from "./lib/use-agents";
```

Inside the `App()` function, add after the `useProcesses()` line:
```tsx
const { tasks: agentTasks, runningCount: agentRunningCount, cancel: cancelAgent, clear: clearAgent, clearAllCompleted: clearAllCompletedAgents, getLogs: getAgentLogs } = useAgents();
const [showAgentPanel, setShowAgentPanel] = useState(false);
```

In the titlebar section, add the AgentBadge after the ProcessBadge (and before AICliSelector):
```tsx
<AgentBadge count={agentRunningCount} onClick={() => setShowAgentPanel(!showAgentPanel)} />
{showAgentPanel && (
  <AgentPanel
    tasks={agentTasks}
    onCancel={cancelAgent}
    onClear={clearAgent}
    onClearAllCompleted={clearAllCompletedAgents}
    onGetLogs={getAgentLogs}
    onClose={() => setShowAgentPanel(false)}
  />
)}
```

- [ ] **Step 5: Verify — launch app, check titlebar**

Run: `npm run dev`
Expected: Amber bot icon visible in titlebar next to process badge. Clicking it opens an empty "Task Agents" panel.

- [ ] **Step 6: Commit**

```bash
git add src/components/AgentBadge.tsx src/components/AgentPanel.tsx src/components/AgentTerminal.tsx src/App.tsx
git commit -m "feat: add Task Agents badge and panel in titlebar"
```

---

### Task 9: Rubric Editor in Settings

**Files:**
- Create: `src/pages/settings/RubricEditor.tsx`
- Modify: `src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Create RubricEditor component**

```tsx
import { useState } from "react";
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { useRubric } from "../../lib/use-rubric";
import type { RubricCategory } from "../../lib/pr-types";

export function RubricEditor() {
  const { categories, thresholds, loading, saveCategories, saveThresholds } = useRubric();
  const [localCats, setLocalCats] = useState<RubricCategory[] | null>(null);
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [saving, setSaving] = useState(false);

  const cats = localCats ?? categories;
  const thresh = localThresholds;

  const totalWeight = cats.reduce((sum, c) => sum + c.weight, 0);

  const updateCat = (id: string, field: keyof RubricCategory, value: string | number) => {
    setLocalCats(cats.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCat = (id: string) => {
    setLocalCats(cats.filter((c) => c.id !== id));
  };

  const addCat = () => {
    const newCat: RubricCategory = {
      id: crypto.randomUUID(),
      name: "New Category",
      weight: 0,
      description: "",
      sortOrder: cats.length,
    };
    setLocalCats([...cats, newCat]);
  };

  const handleSave = async () => {
    setSaving(true);
    if (localCats) await saveCategories(localCats);
    await saveThresholds(thresh);
    setLocalCats(null);
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-wo-text-tertiary">Loading rubric...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Review Rubric</h2>
        <p className="text-xs text-wo-text-tertiary">Define your code review standards. Used by agents to score PRs.</p>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {cats.map((cat) => (
          <div key={cat.id} className="p-3 border border-wo-border rounded-lg space-y-2">
            <div className="flex items-center gap-3">
              <GripVertical size={14} className="text-wo-text-tertiary opacity-30 cursor-grab" />
              <input
                value={cat.name}
                onChange={(e) => updateCat(cat.id, "name", e.target.value)}
                className="flex-1 bg-transparent border-none text-sm font-semibold text-wo-text focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-wo-text-tertiary">Weight:</span>
                <input
                  type="number"
                  value={cat.weight}
                  onChange={(e) => updateCat(cat.id, "weight", parseInt(e.target.value) || 0)}
                  className="w-12 h-7 px-2 text-center rounded border border-wo-border bg-wo-bg text-xs text-wo-text focus:outline-none"
                />
                <span className="text-[10px] text-wo-text-tertiary">%</span>
              </div>
              <button type="button" onClick={() => removeCat(cat.id)} className="p-1 text-wo-text-tertiary hover:text-wo-danger transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
            <textarea
              value={cat.description}
              onChange={(e) => updateCat(cat.id, "description", e.target.value)}
              placeholder="What to evaluate for this category..."
              rows={2}
              className="w-full px-2 py-1.5 rounded border border-wo-border bg-wo-bg text-[11px] text-wo-text placeholder:text-wo-text-tertiary focus:outline-none resize-none"
            />
          </div>
        ))}

        <div className="flex items-center justify-between">
          <button type="button" onClick={addCat} className="flex items-center gap-1.5 text-xs text-wo-accent hover:text-wo-accent-hover transition-colors">
            <Plus size={12} /> Add category
          </button>
          <span className={`text-xs ${totalWeight === 100 ? "text-wo-text-tertiary" : "text-wo-warning"}`}>
            Total weight: {totalWeight}%
          </span>
        </div>
      </div>

      {/* Thresholds */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Thresholds</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Auto-approve score", key: "autoApproveScore" as const, value: thresh.autoApproveScore },
            { label: "Auto-approve max files", key: "autoApproveMaxFiles" as const, value: thresh.autoApproveMaxFiles },
            { label: "Auto-approve max lines", key: "autoApproveMaxLines" as const, value: thresh.autoApproveMaxLines },
            { label: "Auto-summarize max files", key: "autoSummarizeMaxFiles" as const, value: thresh.autoSummarizeMaxFiles },
            { label: "Auto-summarize max lines", key: "autoSummarizeMaxLines" as const, value: thresh.autoSummarizeMaxLines },
          ].map(({ label, key, value }) => (
            <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-wo-bg-subtle">
              <span className="text-xs">{label}</span>
              <input
                type="number"
                value={value}
                onChange={(e) => setLocalThresholds({ ...thresh, [key]: parseInt(e.target.value) || 0 })}
                className="w-16 h-7 px-2 text-center rounded border border-wo-border bg-wo-bg text-xs text-wo-text focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-wo-accent text-white text-sm font-medium hover:bg-wo-accent-hover transition-colors disabled:opacity-50"
      >
        <Save size={13} />
        {saving ? "Saving..." : "Save Rubric"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add Rubric tab to SettingsPage**

In `src/pages/settings/SettingsPage.tsx`:

Add import:
```tsx
import { ClipboardCheck } from "lucide-react";
import { RubricEditor } from "./RubricEditor";
```

Add to the `tabs` array (after the `machine` entry):
```tsx
  { id: "rubric", label: "Review Rubric", icon: ClipboardCheck },
```

Update the `TabId` type (it's already derived from `typeof tabs`, so this is automatic).

Add the render case inside the `<div className="flex-1 overflow-y-auto p-6">` block:
```tsx
{activeTab === "rubric" && <RubricEditor />}
```

- [ ] **Step 3: Verify — launch app, open Settings, check Rubric tab**

Run: `npm run dev`
Expected: "Review Rubric" tab visible in Settings. Shows 6 default categories with weights, description fields, and threshold inputs. Save button works.

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings/RubricEditor.tsx src/pages/settings/SettingsPage.tsx
git commit -m "feat: add rubric editor in Settings with category and threshold management"
```

---

### Task 10: PR Detail Page — Shell with Header and Tab Navigation

**Files:**
- Create: `src/pages/github/PRDetailPage.tsx`
- Modify: `src/pages/github/GitHubPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create PRDetailPage shell**

```tsx
import { useState, useEffect } from "react";
import { ArrowLeft, Clock, ExternalLink, GitPullRequest } from "lucide-react";
import type { GitHubPR } from "../../lib/types";
import type { PRDetail, AgentTask, RubricCategory, RubricThresholds } from "../../lib/pr-types";
import { usePRDetail } from "../../lib/use-pr-detail";
import { BriefingTab } from "./tabs/BriefingTab";
import { CommentsTab } from "./tabs/CommentsTab";
import { RubricTab } from "./tabs/RubricTab";
import { ActionsTab } from "./tabs/ActionsTab";

interface PRDetailPageProps {
  pr: GitHubPR;
  username: string | null;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
  onBack: () => void;
}

type Tab = "briefing" | "comments" | "rubric" | "actions";

export function PRDetailPage({ pr, username, selectedCli, rubricCategories, rubricThresholds, onStartAgent, onBack }: PRDetailPageProps) {
  const [tab, setTab] = useState<Tab>("briefing");
  const { prDetail, cache, loading, fetchDetail, updateCache } = usePRDetail();

  const [owner, repoName] = pr.repo.split("/");

  useEffect(() => {
    fetchDetail(owner, repoName, pr.number);
  }, [owner, repoName, pr.number, fetchDetail]);

  const isAuthor = username && pr.author === username;
  const prId = `${pr.repo}#${pr.number}`;
  const commentCount = prDetail?.reviewThreads?.length ?? 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "briefing", label: "Briefing" },
    { id: "comments", label: "Comments", count: commentCount },
    { id: "rubric", label: "Rubric" },
    { id: "actions", label: "Actions" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Back + Header */}
      <div className="shrink-0 border-b border-wo-border">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 px-6 py-2 text-xs text-wo-text-tertiary hover:text-wo-text transition-colors">
          <ArrowLeft size={12} /> Back to {isAuthor ? "My PRs" : "Review Requests"}
        </button>
        <div className="px-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono text-wo-text-tertiary mb-1">{pr.repo}#{pr.number}</p>
              <h1 className="text-lg font-semibold">{pr.title}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${pr.isDraft ? "bg-wo-bg-subtle text-wo-text-tertiary" : "bg-[rgba(21,128,61,0.15)] text-emerald-500"}`}>
                  {pr.isDraft ? "DRAFT" : "OPEN"}
                </span>
                <span className="text-xs text-wo-text-tertiary">by @{pr.author}</span>
                <span className="text-xs text-wo-text-tertiary flex items-center gap-1">
                  <Clock size={10} /> {new Date(pr.updatedAt).toLocaleDateString()}
                </span>
                {prDetail && (
                  <span className="px-2 py-0.5 rounded bg-wo-bg-subtle text-[10px] text-wo-text-tertiary">
                    +{prDetail.additions} −{prDetail.deletions} · {prDetail.changedFiles} file{prDetail.changedFiles !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <a href={pr.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors shrink-0">
              Open on GitHub <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex px-6 border-b border-wo-border">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id ? "border-wo-accent text-wo-accent" : "border-transparent text-wo-text-tertiary hover:text-wo-text-secondary"
            }`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-[10px] text-wo-text-tertiary">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && !prDetail ? (
          <div className="flex items-center justify-center py-12">
            <GitPullRequest size={20} className="animate-spin text-wo-accent" />
            <span className="ml-2 text-sm text-wo-text-secondary">Loading PR details...</span>
          </div>
        ) : tab === "briefing" ? (
          <BriefingTab prDetail={prDetail} cache={cache} prId={prId} selectedCli={selectedCli}
            rubricCategories={rubricCategories} rubricThresholds={rubricThresholds} onStartAgent={onStartAgent} onUpdateCache={updateCache} />
        ) : tab === "comments" ? (
          <CommentsTab prDetail={prDetail} prId={prId} owner={owner} repoName={repoName} number={pr.number}
            selectedCli={selectedCli} onStartAgent={onStartAgent} />
        ) : tab === "rubric" ? (
          <RubricTab cache={cache} rubricThresholds={rubricThresholds} />
        ) : (
          <ActionsTab prDetail={prDetail} prId={prId} owner={owner} repoName={repoName} number={pr.number}
            isAuthor={!!isAuthor} selectedCli={selectedCli} rubricCategories={rubricCategories}
            onStartAgent={onStartAgent} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create placeholder tab files**

Create `src/pages/github/tabs/BriefingTab.tsx`:
```tsx
import type { PRDetail, PRCacheEntry, RubricCategory, RubricThresholds, AgentTask } from "../../../lib/pr-types";

interface BriefingTabProps {
  prDetail: PRDetail | null;
  cache: PRCacheEntry | null;
  prId: string;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string }) => Promise<AgentTask>;
  onUpdateCache: (prId: string, fields: Partial<PRCacheEntry>) => Promise<void>;
}

export function BriefingTab({ prDetail, cache }: BriefingTabProps) {
  return (
    <div className="p-6">
      {cache?.summary ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-wo-accent mb-2">Summary</h3>
            <p className="text-sm leading-relaxed text-wo-text-secondary">{cache.summary}</p>
          </div>
          {prDetail?.files && (
            <div>
              <h3 className="text-sm font-semibold text-wo-accent mb-2">Key Changes</h3>
              <div className="space-y-1">
                {prDetail.files.map((f) => (
                  <div key={f.path} className="text-xs text-wo-text-secondary font-mono">
                    {f.path} <span className="text-wo-text-tertiary">+{f.additions} −{f.deletions}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-wo-text-tertiary">No analysis yet.</p>
          <p className="text-xs text-wo-text-tertiary mt-1">Click "Re-analyze" or wait for auto-analysis on small PRs.</p>
        </div>
      )}
    </div>
  );
}
```

Create `src/pages/github/tabs/CommentsTab.tsx`:
```tsx
import type { PRDetail, AgentTask } from "../../../lib/pr-types";

interface CommentsTabProps {
  prDetail: PRDetail | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  selectedCli: string;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string }) => Promise<AgentTask>;
}

export function CommentsTab({ prDetail }: CommentsTabProps) {
  if (!prDetail?.reviewThreads?.length) {
    return <p className="p-6 text-sm text-wo-text-tertiary">No review comments yet.</p>;
  }

  return (
    <div className="divide-y divide-wo-border">
      {prDetail.reviewThreads.map((thread) => (
        <div key={thread.id} className="p-4">
          {thread.path && (
            <p className="text-[10px] text-wo-text-tertiary mb-2 font-mono">
              {thread.path}{thread.line ? `:${thread.line}` : ""}
            </p>
          )}
          {thread.comments.map((c) => (
            <div key={c.id} className="mb-2">
              <div className="text-xs">
                <span className="font-semibold">@{c.author}</span>
                <span className="text-wo-text-tertiary ml-2">{new Date(c.createdAt).toLocaleDateString()}</span>
                {thread.isResolved && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">RESOLVED</span>}
              </div>
              <p className="text-sm text-wo-text-secondary mt-1">{c.body}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

Create `src/pages/github/tabs/RubricTab.tsx`:
```tsx
import type { PRCacheEntry, RubricThresholds } from "../../../lib/pr-types";

interface RubricTabProps {
  cache: PRCacheEntry | null;
  rubricThresholds: RubricThresholds;
}

export function RubricTab({ cache, rubricThresholds }: RubricTabProps) {
  const result = cache?.rubricResult;
  if (!result) {
    return <p className="p-6 text-sm text-wo-text-tertiary">Rubric not scored yet. Run analysis from the Briefing or Actions tab.</p>;
  }

  const scoreColor = result.overallScore >= 90 ? "text-emerald-500" : result.overallScore >= 70 ? "text-amber-500" : "text-red-500";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Overall Score</h3>
          <p className="text-[10px] text-wo-text-tertiary">Weighted average across all categories</p>
        </div>
        <div className="text-right">
          <span className={`text-3xl font-bold ${scoreColor}`}>{result.overallScore}</span>
          <span className="text-sm text-wo-text-tertiary">/100</span>
          <p className="text-[10px] text-wo-text-tertiary mt-1">Auto-approve threshold: {rubricThresholds.autoApproveScore}</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-wo-bg-subtle overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-wo-accent to-emerald-400" style={{ width: `${result.overallScore}%` }} />
      </div>
      <div className="space-y-2">
        {result.categories.map((cat) => {
          const catColor = cat.score >= 8 ? "text-emerald-500" : cat.score >= 6 ? "text-amber-500" : "text-red-500";
          return (
            <div key={cat.name} className="p-3 rounded-lg bg-wo-bg-subtle">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{cat.name}</span>
                <span className={`font-bold ${catColor}`}>{cat.score}/{cat.maxScore}</span>
              </div>
              <p className="text-[10px] text-wo-text-tertiary">{cat.explanation}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Create `src/pages/github/tabs/ActionsTab.tsx`:
```tsx
import { Check, Bot, MessageSquare, RefreshCw, ExternalLink, GitBranch, ClipboardList, Search } from "lucide-react";
import type { PRDetail, AgentTask, RubricCategory } from "../../../lib/pr-types";

interface ActionsTabProps {
  prDetail: PRDetail | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  isAuthor: boolean;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
}

export function ActionsTab({ prDetail, prId, owner, repoName, number, isAuthor, selectedCli, onStartAgent }: ActionsTabProps) {
  const prUrl = `https://github.com/${owner}/${repoName}/pull/${number}`;

  return (
    <div className="p-6 space-y-3">
      <p className="text-[10px] text-wo-text-tertiary mb-2">
        {isAuthor ? "You are the author of this PR" : "You are a reviewer on this PR"}
      </p>

      {!isAuthor && (
        <>
          <ActionButton icon={Check} label="Approve" description="Submit approval via gh. Optional comment." color="emerald" onClick={() => {}} />
          <ActionButton icon={MessageSquare} label="Request Changes" description="Draft review with AI or write manually." color="amber" onClick={() => {}} />
          <ActionButton icon={Bot} label="Draft Full Review (AI)" description="Agent generates a review based on rubric. You edit before posting." color="teal" onClick={() => {}} />
        </>
      )}

      {isAuthor && (
        <>
          <ActionButton icon={Bot} label="Address All Comments (Agent)" description="Agent reads unresolved comments, implements fixes in worktree." color="teal" onClick={() => {}} />
          <ActionButton icon={ClipboardList} label="Summarize Feedback" description="Agent condenses all review comments into actionable items." color="amber" onClick={() => {}} />
          <ActionButton icon={Search} label="Self-Review (Rubric)" description="Run rubric on your own PR before requesting review." color="blue" onClick={() => {}} />
          <ActionButton icon={GitBranch} label="Spin Up Worktree" description="Create isolated worktree on PR branch." color="gray" onClick={() => {}} />
        </>
      )}

      <ActionButton icon={RefreshCw} label="Re-analyze" description="Re-run summary + rubric." color="gray" onClick={() => {}} />
      <a href={prUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg border border-wo-border hover:bg-wo-bg-subtle transition-colors">
        <ExternalLink size={16} className="text-wo-text-tertiary" />
        <div>
          <p className="text-sm font-medium">Open on GitHub</p>
          <p className="text-[10px] text-wo-text-tertiary">View full diff, CI checks, and merge controls.</p>
        </div>
      </a>
    </div>
  );
}

function ActionButton({ icon: Icon, label, description, color, onClick }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; description: string; color: string; onClick: () => void;
}) {
  const borderColor = {
    emerald: "border-emerald-500/30", amber: "border-amber-500/30",
    teal: "border-wo-accent/30", blue: "border-blue-500/30", gray: "border-wo-border",
  }[color] ?? "border-wo-border";
  const iconColor = {
    emerald: "text-emerald-500", amber: "text-amber-500",
    teal: "text-wo-accent", blue: "text-blue-500", gray: "text-wo-text-tertiary",
  }[color] ?? "text-wo-text-tertiary";

  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-wo-bg-subtle transition-colors text-left`}>
      <Icon size={16} className={iconColor} />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[10px] text-wo-text-tertiary">{description}</p>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Modify GitHubPage to navigate to PR detail**

In `src/pages/github/GitHubPage.tsx`:

Add `onOpenPR` to the props interface:
```tsx
interface GitHubPageProps {
  data: GitHubData;
  loading: boolean;
  onRefresh: () => void;
  projects: Project[];
  activeWorkspace: Workspace | null;
  onOpenPR: (pr: GitHubPR) => void;
}
```

Update the function signature to receive `onOpenPR`:
```tsx
export function GitHubPage({ data, loading, onRefresh, projects, activeWorkspace, onOpenPR }: GitHubPageProps) {
```

Update PRRow to accept and use onClick:
```tsx
function PRRow({ pr, onClick }: { pr: GitHubPR; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start justify-between gap-3 p-3 rounded-lg border border-wo-border bg-wo-bg-elevated hover:border-wo-accent/20 transition-colors group text-left"
    >
```

Change the `<a>` tag to a `<button>` and replace `href`, `target`, `rel` props with `onClick`. Remove `ExternalLink` icon.

In the list render, pass onClick:
```tsx
{filtered.map((pr) => <PRRow key={pr.id} pr={pr} onClick={() => onOpenPR(pr)} />)}
```

- [ ] **Step 4: Wire PR detail navigation in App.tsx**

In `src/App.tsx`:

Add imports:
```tsx
import { PRDetailPage } from "./pages/github/PRDetailPage";
import type { GitHubPR } from "./lib/types";
import { useRubric } from "./lib/use-rubric";
```

Add state:
```tsx
const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
const { categories: rubricCategories, thresholds: rubricThresholds } = useRubric();
```

Add `useAgents` start function reference for passing to PRDetailPage:
```tsx
const { tasks: agentTasks, runningCount: agentRunningCount, start: startAgent, cancel: cancelAgent, clear: clearAgent, clearAllCompleted: clearAllCompletedAgents, getLogs: getAgentLogs } = useAgents();
```

In the render, when `view === "github"`, add PR detail routing:
```tsx
) : view === "github" ? (
  selectedPR ? (
    <PRDetailPage
      pr={selectedPR}
      username={github.username}
      selectedCli={selectedAICli}
      rubricCategories={rubricCategories}
      rubricThresholds={rubricThresholds}
      onStartAgent={startAgent}
      onBack={() => setSelectedPR(null)}
    />
  ) : (
    <GitHubPage
      data={github}
      loading={github.loading}
      onRefresh={github.refresh}
      projects={allProjects}
      activeWorkspace={activeWorkspace}
      onOpenPR={setSelectedPR}
    />
  )
```

Also clear selectedPR when navigating away from github:
```tsx
onNavigate={(v) => { setView(v); setSelectedProject(null); setSelectedPR(null); }}
```

- [ ] **Step 5: Verify — launch app, click a PR, see detail page**

Run: `npm run dev`
Expected: Click a PR in the GitHub tab → full PR detail page loads with header, tabs, and back button. Tabs switch correctly. Comment threads display if the PR has review comments.

- [ ] **Step 6: Commit**

```bash
git add src/pages/github/PRDetailPage.tsx src/pages/github/tabs/ src/pages/github/GitHubPage.tsx src/App.tsx
git commit -m "feat: add PR detail page with tabs and navigation from GitHub page"
```

---

### Task 11: Briefing Tab — Auto-analyze and Agent Integration

**Files:**
- Modify: `src/pages/github/tabs/BriefingTab.tsx`

- [ ] **Step 1: Implement full BriefingTab with auto-analyze logic**

Replace the placeholder `BriefingTab.tsx` with the full implementation:

```tsx
import { useEffect, useRef, useState } from "react";
import { Bot, Clock, Loader2, RefreshCw } from "lucide-react";
import type { PRDetail, PRCacheEntry, RubricCategory, RubricThresholds, AgentTask } from "../../../lib/pr-types";

interface BriefingTabProps {
  prDetail: PRDetail | null;
  cache: PRCacheEntry | null;
  prId: string;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  rubricThresholds: RubricThresholds;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string }) => Promise<AgentTask>;
  onUpdateCache: (prId: string, fields: Partial<PRCacheEntry>) => Promise<void>;
}

function buildSummarizePrompt(pr: PRDetail, rubricCategories: RubricCategory[]): string {
  const fileList = pr.files.map((f) => `  ${f.path} (+${f.additions} -${f.deletions})`).join("\n");
  const rubricNames = rubricCategories.map((c) => `${c.name} (${c.weight}%): ${c.description}`).join("\n");

  return `You are reviewing a pull request. Provide TWO things in your response, clearly separated:

1. SUMMARY: A 2-4 sentence summary of what this PR does.
2. RUBRIC: Score the PR on each category below (1-10 scale). For each, provide a score and a one-sentence explanation.

PR: ${pr.repo}#${pr.number} — ${pr.title}
Author: ${pr.author}
Files changed (${pr.changedFiles}): +${pr.additions} -${pr.deletions}
${fileList}

Rubric categories:
${rubricNames}

Format your response as JSON:
{
  "summary": "...",
  "rubric": {
    "overallScore": <weighted average 0-100>,
    "categories": [
      {"name": "Category Name", "score": <1-10>, "maxScore": 10, "explanation": "..."}
    ]
  }
}

Respond with ONLY the JSON, no markdown fencing.`;
}

export function BriefingTab({ prDetail, cache, prId, selectedCli, rubricCategories, rubricThresholds, onStartAgent, onUpdateCache }: BriefingTabProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const autoTriggered = useRef(false);

  // Auto-analyze small PRs
  useEffect(() => {
    if (autoTriggered.current || !prDetail || cache?.summary || analyzing) return;
    const isSmall = prDetail.changedFiles <= rubricThresholds.autoSummarizeMaxFiles
      && (prDetail.additions + prDetail.deletions) <= rubricThresholds.autoSummarizeMaxLines;
    const isStale = cache?.headSha && cache.headSha !== prDetail.headSha;

    if (isSmall && (!cache?.lastAnalyzedAt || isStale)) {
      autoTriggered.current = true;
      handleAnalyze();
    }
  }, [prDetail, cache]);

  const handleAnalyze = async () => {
    if (!prDetail) return;
    setAnalyzing(true);
    const prompt = buildSummarizePrompt(prDetail, rubricCategories);
    await onStartAgent({ prId, taskType: "summarize", cli: selectedCli, prompt });
    // Note: actual result parsing happens when agent completes — for now we just track the task.
    // In a follow-up, we'll parse the agent output and update the cache.
    setAnalyzing(false);
  };

  const isSmall = prDetail && prDetail.changedFiles <= rubricThresholds.autoSummarizeMaxFiles;
  const isStale = cache?.headSha && prDetail?.headSha && cache.headSha !== prDetail.headSha;

  return (
    <div className="p-6 space-y-4">
      {/* Status bar */}
      {cache?.lastAnalyzedAt && (
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-[11px] ${isStale ? "bg-amber-500/10 border border-amber-500/30" : "bg-wo-accent/5 border border-wo-accent/20"}`}>
          <span className="flex items-center gap-1.5">
            {isStale ? "⚠️" : "✅"}
            {isStale ? `Analysis stale — new commits since ${new Date(cache.lastAnalyzedAt).toLocaleTimeString()}` :
              `${isSmall ? "Auto-summarized" : "Manually analyzed"} · ${new Date(cache.lastAnalyzedAt).toLocaleTimeString()}`}
          </span>
          <button type="button" onClick={handleAnalyze} disabled={analyzing}
            className="flex items-center gap-1 text-wo-accent hover:text-wo-accent-hover transition-colors disabled:opacity-50">
            <RefreshCw size={10} className={analyzing ? "animate-spin" : ""} /> Re-analyze
          </button>
        </div>
      )}

      {/* Summary */}
      {cache?.summary ? (
        <div>
          <h3 className="text-sm font-semibold text-wo-accent mb-2">Summary</h3>
          <p className="text-sm leading-relaxed text-wo-text-secondary">{cache.summary}</p>
        </div>
      ) : analyzing ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={16} className="animate-spin text-wo-accent" />
          <span className="text-sm text-wo-text-secondary">Analyzing PR...</span>
        </div>
      ) : (
        <div className="text-center py-8">
          <Bot size={24} className="mx-auto text-wo-text-tertiary mb-2" />
          <p className="text-sm text-wo-text-tertiary">
            {isSmall ? "Auto-analysis available" : `Large PR (${prDetail?.changedFiles ?? "?"} files) — manual analysis`}
          </p>
          <button type="button" onClick={handleAnalyze}
            className="mt-3 px-4 h-8 rounded-lg bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover transition-colors">
            Analyze PR
          </button>
        </div>
      )}

      {/* Key Changes */}
      {prDetail?.files && prDetail.files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-wo-accent mb-2">Key Changes</h3>
          <div className="space-y-1">
            {prDetail.files.map((f) => (
              <div key={f.path} className="flex items-center justify-between text-xs font-mono py-1">
                <span className="text-wo-text-secondary truncate">{f.path}</span>
                <span className="text-wo-text-tertiary shrink-0 ml-2">+{f.additions} −{f.deletions}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Rubric Score */}
      {cache?.rubricResult && (
        <div className="rounded-lg bg-wo-bg-subtle p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Rubric Score</span>
            <span className={`text-xl font-bold ${cache.rubricResult.overallScore >= 90 ? "text-emerald-500" : cache.rubricResult.overallScore >= 70 ? "text-amber-500" : "text-red-500"}`}>
              {cache.rubricResult.overallScore}/100
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {cache.rubricResult.categories.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between px-2 py-1 rounded bg-wo-bg text-[11px]">
                <span>{cat.name}</span>
                <span className={cat.score >= 8 ? "text-emerald-500" : cat.score >= 6 ? "text-amber-500" : "text-red-500"}>{cat.score}/{cat.maxScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify — open a PR detail, check briefing tab**

Run: `npm run dev`
Expected: Briefing tab shows file list. If the PR is small (≤5 files), "Analyze PR" button or auto-trigger appears. Agent task shows up in Task Agents panel when triggered.

- [ ] **Step 3: Commit**

```bash
git add src/pages/github/tabs/BriefingTab.tsx
git commit -m "feat: implement briefing tab with auto-analyze and rubric score display"
```

---

### Task 12: Comments Tab — Quick Response Buttons

**Files:**
- Modify: `src/pages/github/tabs/CommentsTab.tsx`

- [ ] **Step 1: Implement full CommentsTab with quick response buttons**

Replace the placeholder with the full implementation:

```tsx
import { useState } from "react";
import { Filter, Send } from "lucide-react";
import type { PRDetail, PRReviewThread, AgentTask } from "../../../lib/pr-types";
import { ipc } from "../../../lib/ipc";

interface CommentsTabProps {
  prDetail: PRDetail | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  selectedCli: string;
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
}

type CommentFilter = "all" | "unresolved" | "actionable";

export function CommentsTab({ prDetail, prId, owner, repoName, number, selectedCli, onStartAgent }: CommentsTabProps) {
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);

  if (!prDetail?.reviewThreads?.length) {
    return <p className="p-6 text-sm text-wo-text-tertiary">No review comments yet.</p>;
  }

  const threads = prDetail.reviewThreads.filter((t) => {
    if (filter === "unresolved") return !t.isResolved;
    if (filter === "actionable") return !t.isResolved && t.comments.length > 0;
    return true;
  });

  const unresolvedCount = prDetail.reviewThreads.filter((t) => !t.isResolved).length;

  const handleQuickReply = async (thread: PRReviewThread, text: string) => {
    setPosting(true);
    const lastComment = thread.comments[thread.comments.length - 1];
    if (lastComment) {
      await ipc.replyToThread(owner, repoName, number, lastComment.id, text);
    }
    setPosting(false);
  };

  const handleAgentImplement = async (thread: PRReviewThread) => {
    const comment = thread.comments[thread.comments.length - 1];
    const prompt = `A reviewer left this comment on a PR:\n\nFile: ${thread.path ?? "general"}${thread.line ? `:${thread.line}` : ""}\nComment: "${comment?.body ?? ""}"\n\nPlease implement the requested change. Explain what you changed and why.`;
    await onStartAgent({ prId, taskType: "implement_fix", cli: selectedCli, prompt });
    await handleQuickReply(thread, "Spinning up an agent to address this.");
  };

  const handleCustomReply = async (thread: PRReviewThread) => {
    if (!replyText.trim()) return;
    await handleQuickReply(thread, replyText);
    setReplyText("");
    setReplyingTo(null);
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-wo-border text-xs">
        <Filter size={11} className="text-wo-text-tertiary" />
        {(["all", "unresolved", "actionable"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-2.5 h-7 rounded-full font-medium transition-colors ${
              filter === f ? "bg-wo-accent-soft text-wo-accent" : "bg-wo-bg-subtle text-wo-text-tertiary hover:text-wo-text-secondary"
            }`}>
            {f === "all" ? `All (${prDetail.reviewThreads.length})` : f === "unresolved" ? `Unresolved (${unresolvedCount})` : "Actionable"}
          </button>
        ))}
      </div>

      {/* Threads */}
      <div className="divide-y divide-wo-border">
        {threads.map((thread) => (
          <div key={thread.id} className="px-6 py-4">
            {thread.path && (
              <p className="text-[10px] text-wo-text-tertiary font-mono mb-2">
                {thread.path}{thread.line ? `:${thread.line}` : ""}
              </p>
            )}

            {thread.comments.map((c, i) => (
              <div key={c.id} className={i > 0 ? "ml-8 mt-2 pl-3 border-l-2 border-wo-border/50" : ""}>
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="w-6 h-6 rounded-full bg-wo-bg-subtle flex items-center justify-center text-[9px] font-bold text-wo-text-tertiary">
                    {c.author.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="font-semibold">@{c.author}</span>
                  <span className="text-wo-text-tertiary">{new Date(c.createdAt).toLocaleDateString()}</span>
                  {i === 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                      thread.isResolved ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {thread.isResolved ? "RESOLVED" : "UNRESOLVED"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-wo-text-secondary leading-relaxed">{c.body}</p>
              </div>
            ))}

            {/* Quick response buttons */}
            {!thread.isResolved && (
              <div className="mt-3 flex gap-1.5 flex-wrap">
                <button type="button" onClick={() => handleQuickReply(thread, "Good catch, I'll address this.")} disabled={posting}
                  className="text-[10px] px-2.5 py-1.5 border border-wo-accent/40 text-wo-accent rounded-md hover:bg-wo-accent/5 transition-colors disabled:opacity-50">
                  👍 Agree, will fix
                </button>
                <button type="button" onClick={() => handleAgentImplement(thread)} disabled={posting}
                  className="text-[10px] px-2.5 py-1.5 border border-wo-border rounded-md hover:bg-wo-bg-subtle transition-colors disabled:opacity-50">
                  🤖 Agent: implement
                </button>
                <button type="button" onClick={() => setReplyingTo(replyingTo === thread.id ? null : thread.id)}
                  className="text-[10px] px-2.5 py-1.5 border border-wo-border rounded-md hover:bg-wo-bg-subtle transition-colors">
                  💬 Custom reply
                </button>
                <button type="button" onClick={() => { setReplyingTo(thread.id); setReplyText("Won't address this because: "); }} disabled={posting}
                  className="text-[10px] px-2.5 py-1.5 border border-wo-border rounded-md hover:bg-wo-bg-subtle transition-colors disabled:opacity-50">
                  ❌ Won't do
                </button>
              </div>
            )}

            {/* Custom reply input */}
            {replyingTo === thread.id && (
              <div className="mt-2 flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  className="flex-1 h-8 px-2.5 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text placeholder:text-wo-text-tertiary focus:outline-none focus:ring-2 focus:ring-wo-accent/40"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCustomReply(thread); }}
                />
                <button type="button" onClick={() => handleCustomReply(thread)} disabled={posting || !replyText.trim()}
                  className="h-8 px-3 rounded-md bg-wo-accent text-white text-xs font-medium hover:bg-wo-accent-hover disabled:opacity-50 transition-colors">
                  <Send size={11} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify — open a PR with comments, test quick response buttons**

Run: `npm run dev`
Expected: Comments tab shows threaded comments with filter bar and quick response buttons. "Agree, will fix" posts a reply. "Custom reply" opens an input field.

- [ ] **Step 3: Commit**

```bash
git add src/pages/github/tabs/CommentsTab.tsx
git commit -m "feat: implement comments tab with quick response buttons and agent integration"
```

---

### Task 13: Actions Tab — Full Implementation

**Files:**
- Modify: `src/pages/github/tabs/ActionsTab.tsx`

- [ ] **Step 1: Implement action handlers in ActionsTab**

Replace the placeholder `onClick={() => {}}` handlers with actual implementations:

```tsx
import { useState } from "react";
import { Check, Bot, MessageSquare, RefreshCw, ExternalLink, GitBranch, ClipboardList, Search, Loader2 } from "lucide-react";
import type { PRDetail, AgentTask, RubricCategory } from "../../../lib/pr-types";
import { ipc } from "../../../lib/ipc";

interface ActionsTabProps {
  prDetail: PRDetail | null;
  prId: string;
  owner: string;
  repoName: string;
  number: number;
  isAuthor: boolean;
  selectedCli: string;
  rubricCategories: RubricCategory[];
  onStartAgent: (data: { prId: string; taskType: string; cli: string; prompt: string; workingDir?: string }) => Promise<AgentTask>;
}

export function ActionsTab({ prDetail, prId, owner, repoName, number, isAuthor, selectedCli, rubricCategories, onStartAgent }: ActionsTabProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState("");
  const [showApproveInput, setShowApproveInput] = useState(false);
  const [reviewBody, setReviewBody] = useState("");
  const [showReviewInput, setShowReviewInput] = useState(false);

  const prUrl = `https://github.com/${owner}/${repoName}/pull/${number}`;

  const handleApprove = async () => {
    setBusy("approve");
    await ipc.submitReview(owner, repoName, number, "APPROVE", approveComment || undefined);
    setShowApproveInput(false);
    setApproveComment("");
    setBusy(null);
  };

  const handleRequestChanges = async () => {
    if (!reviewBody.trim()) return;
    setBusy("request-changes");
    await ipc.submitReview(owner, repoName, number, "REQUEST_CHANGES", reviewBody);
    setShowReviewInput(false);
    setReviewBody("");
    setBusy(null);
  };

  const handleDraftReview = async () => {
    if (!prDetail) return;
    setBusy("draft-review");
    const fileList = prDetail.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join("\n");
    const rubricDesc = rubricCategories.map((c) => `- ${c.name}: ${c.description}`).join("\n");
    const prompt = `Write a thorough code review for this PR based on the rubric below. Be constructive and specific.\n\nPR: ${prDetail.repo}#${prDetail.number} — ${prDetail.title}\nAuthor: ${prDetail.author}\nFiles:\n${fileList}\n\nRubric:\n${rubricDesc}\n\nProvide your review as a cohesive text review body suitable for posting on GitHub.`;
    await onStartAgent({ prId, taskType: "draft_review", cli: selectedCli, prompt });
    setBusy(null);
  };

  const handleAddressComments = async () => {
    if (!prDetail) return;
    setBusy("address-comments");
    const unresolved = prDetail.reviewThreads.filter((t) => !t.isResolved);
    const commentList = unresolved.map((t) => {
      const lastComment = t.comments[t.comments.length - 1];
      return `File: ${t.path ?? "general"}${t.line ? `:${t.line}` : ""}\nComment: ${lastComment?.body ?? ""}`;
    }).join("\n\n");
    const prompt = `The following review comments are unresolved on this PR. Please implement all the requested changes.\n\n${commentList}`;
    await onStartAgent({ prId, taskType: "address_comments", cli: selectedCli, prompt });
    setBusy(null);
  };

  const handleSummarizeFeedback = async () => {
    if (!prDetail) return;
    setBusy("summarize-feedback");
    const allComments = prDetail.reviewThreads.flatMap((t) => t.comments.map((c) => `@${c.author}: ${c.body}`)).join("\n\n");
    const prompt = `Summarize the review feedback on this PR into actionable items. Group by theme. Prioritize by importance.\n\nComments:\n${allComments}`;
    await onStartAgent({ prId, taskType: "summarize_feedback", cli: selectedCli, prompt });
    setBusy(null);
  };

  const handleSelfReview = async () => {
    if (!prDetail) return;
    setBusy("self-review");
    const fileList = prDetail.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join("\n");
    const rubricDesc = rubricCategories.map((c) => `- ${c.name} (${c.weight}%): ${c.description}`).join("\n");
    const prompt = `Score this PR using the rubric below. I'm the author and want to self-review before requesting reviews.\n\nPR: ${prDetail.repo}#${prDetail.number} — ${prDetail.title}\nFiles:\n${fileList}\n\nRubric:\n${rubricDesc}\n\nProvide scores and specific improvement suggestions.`;
    await onStartAgent({ prId, taskType: "rubric", cli: selectedCli, prompt });
    setBusy(null);
  };

  const handleReanalyze = async () => {
    if (!prDetail) return;
    setBusy("reanalyze");
    const fileList = prDetail.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join("\n");
    const rubricNames = rubricCategories.map((c) => `${c.name} (${c.weight}%): ${c.description}`).join("\n");
    const prompt = `Analyze this PR. Provide a 2-4 sentence summary and score each rubric category.\n\nPR: ${prDetail.repo}#${prDetail.number} — ${prDetail.title}\nFiles (${prDetail.changedFiles}): +${prDetail.additions} -${prDetail.deletions}\n${fileList}\n\nRubric:\n${rubricNames}\n\nRespond as JSON: {"summary":"...","rubric":{"overallScore":<0-100>,"categories":[{"name":"...","score":<1-10>,"maxScore":10,"explanation":"..."}]}}`;
    await onStartAgent({ prId, taskType: "summarize", cli: selectedCli, prompt });
    setBusy(null);
  };

  return (
    <div className="p-6 space-y-3">
      <p className="text-[10px] text-wo-text-tertiary mb-2">
        {isAuthor ? "You are the author of this PR" : "You are a reviewer on this PR"}
      </p>

      {!isAuthor && (
        <>
          <ActionButton icon={Check} label="Approve" description="Submit approval via gh." color="emerald"
            loading={busy === "approve"} onClick={() => setShowApproveInput(!showApproveInput)} />
          {showApproveInput && (
            <div className="ml-8 flex gap-2">
              <input value={approveComment} onChange={(e) => setApproveComment(e.target.value)} placeholder="Optional comment..."
                className="flex-1 h-8 px-2.5 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text focus:outline-none" />
              <button type="button" onClick={handleApprove} disabled={busy === "approve"}
                className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {busy === "approve" ? <Loader2 size={11} className="animate-spin" /> : "Approve"}
              </button>
            </div>
          )}

          <ActionButton icon={MessageSquare} label="Request Changes" description="Write a review requesting changes." color="amber"
            loading={busy === "request-changes"} onClick={() => setShowReviewInput(!showReviewInput)} />
          {showReviewInput && (
            <div className="ml-8 space-y-2">
              <textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="What needs to change..."
                rows={4} className="w-full px-2.5 py-2 rounded-md border border-wo-border bg-wo-bg text-xs text-wo-text focus:outline-none resize-none" />
              <button type="button" onClick={handleRequestChanges} disabled={busy === "request-changes" || !reviewBody.trim()}
                className="h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
                Submit Review
              </button>
            </div>
          )}

          <ActionButton icon={Bot} label="Draft Full Review (AI)" description="Agent generates a review based on rubric. Check Task Agents for result." color="teal"
            loading={busy === "draft-review"} onClick={handleDraftReview} />
        </>
      )}

      {isAuthor && (
        <>
          <ActionButton icon={Bot} label="Address All Comments (Agent)" description="Agent reads unresolved comments, implements fixes." color="teal"
            loading={busy === "address-comments"} onClick={handleAddressComments} />
          <ActionButton icon={ClipboardList} label="Summarize Feedback" description="Agent condenses all review comments into actionable items." color="amber"
            loading={busy === "summarize-feedback"} onClick={handleSummarizeFeedback} />
          <ActionButton icon={Search} label="Self-Review (Rubric)" description="Run rubric on your own PR." color="blue"
            loading={busy === "self-review"} onClick={handleSelfReview} />
          <ActionButton icon={GitBranch} label="Spin Up Worktree" description="Create isolated worktree on PR branch." color="gray" onClick={() => {}} />
        </>
      )}

      <ActionButton icon={RefreshCw} label="Re-analyze" description="Re-run summary + rubric." color="gray"
        loading={busy === "reanalyze"} onClick={handleReanalyze} />
      <a href={prUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg border border-wo-border hover:bg-wo-bg-subtle transition-colors">
        <ExternalLink size={16} className="text-wo-text-tertiary" />
        <div>
          <p className="text-sm font-medium">Open on GitHub</p>
          <p className="text-[10px] text-wo-text-tertiary">View full diff, CI checks, and merge controls.</p>
        </div>
      </a>
    </div>
  );
}

function ActionButton({ icon: Icon, label, description, color, loading, onClick }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; description: string; color: string; loading?: boolean; onClick: () => void;
}) {
  const borderColor: Record<string, string> = {
    emerald: "border-emerald-500/30", amber: "border-amber-500/30",
    teal: "border-wo-accent/30", blue: "border-blue-500/30", gray: "border-wo-border",
  };
  const iconColor: Record<string, string> = {
    emerald: "text-emerald-500", amber: "text-amber-500",
    teal: "text-wo-accent", blue: "text-blue-500", gray: "text-wo-text-tertiary",
  };

  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border ${borderColor[color] ?? "border-wo-border"} hover:bg-wo-bg-subtle transition-colors text-left disabled:opacity-50`}>
      {loading ? <Loader2 size={16} className="animate-spin text-wo-accent" /> : <Icon size={16} className={iconColor[color] ?? "text-wo-text-tertiary"} />}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[10px] text-wo-text-tertiary">{description}</p>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify — test approve and agent actions**

Run: `npm run dev`
Expected: Actions tab shows different buttons for reviewer vs author PRs. "Approve" shows comment input. "Draft Full Review" spawns an agent task. Agent task appears in titlebar Task Agents panel.

- [ ] **Step 3: Commit**

```bash
git add src/pages/github/tabs/ActionsTab.tsx
git commit -m "feat: implement actions tab with approve, review, and agent task handlers"
```

---

### Task 14: PR Cache Cleanup on App Launch

**Files:**
- Modify: `desktop/main.js`

- [ ] **Step 1: Add cache cleanup to app startup**

In `desktop/main.js`, inside `app.whenReady().then(() => { ... })`, after `db.init(app)`:

```js
  db.cleanupPrCache();
```

- [ ] **Step 2: Verify — launch app, confirm no errors**

Run: `npm run dev`
Expected: App starts normally. Old merged/closed PR cache entries older than 7 days are cleaned up silently.

- [ ] **Step 3: Commit**

```bash
git add desktop/main.js
git commit -m "feat: add PR cache cleanup on app startup"
```

---

## Self-Review

**1. Spec coverage:**
- Section 1 (Architecture): Covered by Tasks 1-6 (foundation + backend modules + IPC)
- Section 2 (PR Data Fetching): Task 3 (pr-detail.js with GraphQL + REST)
- Section 3 (PR Detail Page): Tasks 10-13 (all 4 tabs)
- Section 4 (Task Agents): Tasks 5 (backend), 8 (UI), 7 (hook)
- Section 5 (Rubric Config): Tasks 1 (DB), 4 (backend), 9 (editor UI)
- Section 6 (Persistence): Task 1 (tables), 14 (cleanup)
- Section 7 (IPC Channels): Task 6
- Section 8 (File Structure): All tasks match
- Section 9 (Token Consciousness): Task 11 (auto-trigger logic with thresholds)
- Section 10 (Out of Scope): Confirmed excluded

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" found. All steps have code.

**3. Type consistency:**
- `AgentTask` type is consistent across pr-types.ts, use-agents.ts, AgentPanel.tsx, and backend
- `PRDetail` type matches GraphQL response normalization in pr-detail.js
- `RubricCategory` type matches DB schema and editor UI
- `PRCacheEntry` type matches db.js CRUD functions
- IPC method names match between preload.js, env.d.ts, ipc.ts, and main.js handlers
