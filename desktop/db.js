const Database = require("better-sqlite3");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const fs = require("node:fs");

let db = null;

function getDbPath(app) {
  const userDataPath = app
    ? app.getPath("userData")
    : path.join(os.homedir(), "Library", "Application Support", "workos");
  return path.join(userDataPath, "workos.db");
}

function init(app) {
  const dbPath = getDbPath(app);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      org TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      repo_url TEXT,
      local_path TEXT NOT NULL,
      dev_command TEXT,
      ide TEXT NOT NULL DEFAULT 'cursor',
      bootstrap_command TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
    CREATE TABLE IF NOT EXISTS pr_cache (
      pr_id TEXT PRIMARY KEY,
      pr_data TEXT,
      analyses TEXT DEFAULT '[]',
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
  `);

  // Migrations
  const cols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  if (!cols.includes("pinned")) {
    db.exec("ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }
  const wsCols = db.prepare("PRAGMA table_info(workspaces)").all().map((c) => c.name);
  if (!wsCols.includes("github_orgs")) {
    db.exec("ALTER TABLE workspaces ADD COLUMN github_orgs TEXT DEFAULT ''");
  }

  // Migrate pr_cache: old schema had summary + rubric_result columns, new schema uses analyses JSON array
  const prCacheCols = db.prepare("PRAGMA table_info(pr_cache)").all().map((c) => c.name);
  if (prCacheCols.includes("summary") && !prCacheCols.includes("analyses")) {
    db.exec("ALTER TABLE pr_cache ADD COLUMN analyses TEXT DEFAULT '[]'");
    // Migrate existing data: convert summary + rubric_result into analyses array
    const rows = db.prepare("SELECT pr_id, summary, rubric_result, head_sha, last_analyzed_at FROM pr_cache WHERE summary IS NOT NULL").all();
    const update = db.prepare("UPDATE pr_cache SET analyses = ? WHERE pr_id = ?");
    for (const row of rows) {
      let rubric = null;
      try { rubric = row.rubric_result ? JSON.parse(row.rubric_result) : null; } catch {}
      const entry = { headSha: row.head_sha || "unknown", timestamp: row.last_analyzed_at || new Date().toISOString(), summary: row.summary, rubricResult: rubric, cli: "unknown" };
      update.run(JSON.stringify([entry]), row.pr_id);
    }
  }

  // Seed default rubric categories
  const rubricCount = db.prepare("SELECT COUNT(*) as cnt FROM rubric_categories").get().cnt;
  if (rubricCount === 0) {
    const insertRubric = db.prepare(
      "INSERT INTO rubric_categories (id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?)"
    );
    const seedRubrics = db.transaction(() => {
      insertRubric.run(uuid(), "Code Clarity", 20, "Readable naming, consistent style, small focused functions, clear intent without excessive comments.", 0);
      insertRubric.run(uuid(), "Test Coverage", 20, "Tests for happy path, edge cases, error scenarios. Integration tests where appropriate.", 1);
      insertRubric.run(uuid(), "Architecture", 20, "Clean separation of concerns, appropriate abstractions, no unnecessary coupling.", 2);
      insertRubric.run(uuid(), "Error Handling", 15, "Graceful error handling, no silent failures, appropriate logging.", 3);
      insertRubric.run(uuid(), "Security", 15, "No injection vulnerabilities, proper input validation, safe defaults.", 4);
      insertRubric.run(uuid(), "PR Hygiene", 10, "Descriptive title and body, atomic commits, reasonable PR size.", 5);
    });
    seedRubrics();
  }

  // Seed default rubric thresholds
  if (!getMeta("rubric_thresholds")) {
    setMeta("rubric_thresholds", JSON.stringify({
      autoApproveScore: 95,
      autoApproveMaxFiles: 5,
      autoApproveMaxLines: 300,
      autoSummarizeMaxFiles: 5,
      autoSummarizeMaxLines: 300,
      reasoningEffort: "auto",
    }));
  }

  return db;
}

function uuid() {
  return crypto.randomUUID();
}

// Meta
function getMeta(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
}

function getSetupComplete() {
  return getMeta("setup_complete") === "true";
}

function setSetupComplete(value) {
  setMeta("setup_complete", value ? "true" : "false");
}

// Workspaces
function rowToWorkspace(row) {
  return {
    id: row.id,
    name: row.name,
    org: row.org,
    path: row.path,
    githubOrgs: row.github_orgs ? row.github_orgs.split(",").filter(Boolean) : [],
    createdAt: row.created_at,
  };
}

function getWorkspaces() {
  return db.prepare("SELECT * FROM workspaces ORDER BY created_at").all().map(rowToWorkspace);
}

function createWorkspace({ name, org, path: wsPath }) {
  const id = uuid();
  db.prepare("INSERT INTO workspaces (id, name, org, path) VALUES (?, ?, ?, ?)").run(id, name, org, wsPath);
  return rowToWorkspace(db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id));
}

function deleteWorkspace(id) {
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
}

function updateWorkspace(id, fields) {
  if ("githubOrgs" in fields) {
    const orgsStr = Array.isArray(fields.githubOrgs) ? fields.githubOrgs.join(",") : "";
    db.prepare("UPDATE workspaces SET github_orgs = ? WHERE id = ?").run(orgsStr, id);
  }
  if ("name" in fields) db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(fields.name, id);
  if ("org" in fields) db.prepare("UPDATE workspaces SET org = ? WHERE id = ?").run(fields.org, id);
  return rowToWorkspace(db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id));
}

function getActiveWorkspace() {
  const activeId = getMeta("active_workspace_id");
  if (!activeId) return null;
  const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(activeId);
  return row ? rowToWorkspace(row) : null;
}

function setActiveWorkspace(id) {
  setMeta("active_workspace_id", id);
}

// Projects
function rowToProject(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    repoUrl: row.repo_url,
    localPath: row.local_path,
    devCommand: row.dev_command,
    ide: row.ide,
    bootstrapCommand: row.bootstrap_command,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
  };
}

function getProjects(workspaceId) {
  return db.prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY pinned DESC, name").all(workspaceId).map(rowToProject);
}

function createProject({ workspaceId, name, repoUrl, localPath, devCommand, ide, bootstrapCommand }) {
  const id = uuid();
  db.prepare(
    "INSERT INTO projects (id, workspace_id, name, repo_url, local_path, dev_command, ide, bootstrap_command) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, workspaceId, name, repoUrl || null, localPath, devCommand || null, ide || "cursor", bootstrapCommand || null);
  return rowToProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
}

function updateProject(id, fields) {
  const colMap = {
    name: "name", repoUrl: "repo_url", localPath: "local_path",
    devCommand: "dev_command", ide: "ide", bootstrapCommand: "bootstrap_command",
    pinned: "pinned",
  };
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      sets.push(`${col} = ?`);
      values.push(key === "pinned" ? (fields[key] ? 1 : 0) : (fields[key] ?? null));
    }
  }
  if (sets.length === 0) return getProjectById(id);
  values.push(id);
  db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return rowToProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
}

function getProjectById(id) {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? rowToProject(row) : null;
}

function deleteProject(id) {
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

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

// PR Cache
function rowToPrCache(row) {
  let analyses = [];
  try { analyses = row.analyses ? JSON.parse(row.analyses) : []; } catch { analyses = []; }
  return {
    prId: row.pr_id,
    prData: row.pr_data ? JSON.parse(row.pr_data) : null,
    analyses,
    commentThreads: row.comment_threads ? JSON.parse(row.comment_threads) : null,
    lastFetchedAt: row.last_fetched_at,
    lastAnalyzedAt: row.last_analyzed_at,
    prState: row.pr_state,
    headSha: row.head_sha,
  };
}

function getPrCache(prId) {
  const row = db.prepare("SELECT * FROM pr_cache WHERE pr_id = ?").get(prId);
  return row ? rowToPrCache(row) : null;
}

function upsertPrCache(prId, fields) {
  const existing = db.prepare("SELECT * FROM pr_cache WHERE pr_id = ?").get(prId);
  if (!existing) {
    db.prepare(
      "INSERT INTO pr_cache (pr_id, pr_data, analyses, comment_threads, last_fetched_at, last_analyzed_at, pr_state, head_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prId,
      fields.prData ? JSON.stringify(fields.prData) : null,
      fields.analyses ? JSON.stringify(fields.analyses) : "[]",
      fields.commentThreads ? JSON.stringify(fields.commentThreads) : null,
      fields.lastFetchedAt || null,
      fields.lastAnalyzedAt || null,
      fields.prState || "OPEN",
      fields.headSha || null
    );
  } else {
    const colMap = {
      prData: "pr_data", analyses: "analyses",
      commentThreads: "comment_threads", lastFetchedAt: "last_fetched_at",
      lastAnalyzedAt: "last_analyzed_at", prState: "pr_state", headSha: "head_sha",
    };
    const jsonCols = new Set(["prData", "analyses", "commentThreads"]);
    const sets = [];
    const values = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in fields) {
        sets.push(`${col} = ?`);
        values.push(jsonCols.has(key) && fields[key] ? JSON.stringify(fields[key]) : (fields[key] ?? null));
      }
    }
    if (sets.length > 0) {
      values.push(prId);
      db.prepare(`UPDATE pr_cache SET ${sets.join(", ")} WHERE pr_id = ?`).run(...values);
    }
  }
  return getPrCache(prId);
}

function cleanupPrCache() {
  db.prepare("DELETE FROM pr_cache WHERE pr_state IN ('MERGED', 'CLOSED')").run();
}

function updatePrState(prId, state) {
  db.prepare("UPDATE pr_cache SET pr_state = ? WHERE pr_id = ?").run(state, prId);
}

// Rubric Categories
function rowToRubricCategory(row) {
  return {
    id: row.id,
    name: row.name,
    weight: row.weight,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

function getRubricCategories() {
  return db.prepare("SELECT * FROM rubric_categories ORDER BY sort_order").all().map(rowToRubricCategory);
}

function saveRubricCategories(categories) {
  const saveTx = db.transaction((cats) => {
    db.prepare("DELETE FROM rubric_categories").run();
    const insert = db.prepare(
      "INSERT INTO rubric_categories (id, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?)"
    );
    for (const cat of cats) {
      insert.run(cat.id || uuid(), cat.name, cat.weight, cat.description || "", cat.sortOrder ?? 0);
    }
  });
  saveTx(categories);
  return getRubricCategories();
}

function getRubricThresholds() {
  const raw = getMeta("rubric_thresholds");
  return raw ? JSON.parse(raw) : null;
}

function saveRubricThresholds(thresholds) {
  setMeta("rubric_thresholds", JSON.stringify(thresholds));
}

// Agent Tasks
function rowToAgentTask(row) {
  return {
    id: row.id,
    prId: row.pr_id,
    taskType: row.task_type,
    status: row.status,
    cli: row.cli,
    result: row.result ?? null,
    tokenEstimate: row.token_estimate,
    logFile: row.log_file,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function getAgentTasks() {
  return db.prepare("SELECT * FROM agent_tasks ORDER BY started_at DESC").all().map(rowToAgentTask);
}

function getAgentTask(id) {
  const row = db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id);
  return row ? rowToAgentTask(row) : null;
}

function createAgentTask({ id, prId, taskType, cli }) {
  const taskId = id || uuid();
  db.prepare(
    "INSERT INTO agent_tasks (id, pr_id, task_type, status, cli, started_at) VALUES (?, ?, ?, 'pending', ?, datetime('now'))"
  ).run(taskId, prId || null, taskType, cli || null);
  return getAgentTask(taskId);
}

function updateAgentTask(id, fields) {
  const colMap = {
    status: "status", result: "result", tokenEstimate: "token_estimate",
    logFile: "log_file", startedAt: "started_at", completedAt: "completed_at",
  };
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      sets.push(`${col} = ?`);
      values.push(fields[key] ?? null);
    }
  }
  if (sets.length === 0) return getAgentTask(id);
  values.push(id);
  db.prepare(`UPDATE agent_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getAgentTask(id);
}

function clearAgentTask(id) {
  db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(id);
}

function clearCompletedAgentTasks() {
  db.prepare("DELETE FROM agent_tasks WHERE status IN ('completed', 'failed', 'cancelled')").run();
}

// Export / Import
function exportConfig() {
  const home = os.homedir();
  const workspaces = getWorkspaces().map((ws) => ({
    ...ws,
    pathRelative: ws.path.replace(home, "~"),
    projects: getProjects(ws.id).map((p) => ({
      ...p,
      localPathRelative: p.localPath.replace(home, "~"),
    })),
  }));
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), workspaces }, null, 2);
}

function importConfig(json) {
  const home = os.homedir();
  const data = JSON.parse(json);
  if (data.version !== 1) throw new Error("Unsupported config version");

  const upsertWs = db.prepare(
    "INSERT OR REPLACE INTO workspaces (id, name, org, path, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const upsertPj = db.prepare(
    "INSERT OR REPLACE INTO projects (id, workspace_id, name, repo_url, local_path, dev_command, ide, bootstrap_command, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const importTx = db.transaction((workspaces) => {
    for (const ws of workspaces) {
      const absPath = ws.pathRelative ? ws.pathRelative.replace("~", home) : ws.path;
      upsertWs.run(ws.id, ws.name, ws.org, absPath, ws.createdAt);
      for (const p of ws.projects || []) {
        const absLocalPath = p.localPathRelative ? p.localPathRelative.replace("~", home) : p.localPath;
        upsertPj.run(p.id, ws.id, p.name, p.repoUrl || null, absLocalPath, p.devCommand || null, p.ide || "cursor", p.bootstrapCommand || null, p.createdAt);
      }
    }
  });

  importTx(data.workspaces);
}

module.exports = {
  init, getMeta, setMeta, getSetupComplete, setSetupComplete,
  getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, getActiveWorkspace, setActiveWorkspace,
  getProjects, createProject, updateProject, getProjectById, deleteProject,
  exportConfig, importConfig,
  getTools, createTool, deleteTool, updateTool,
  getPrCache, upsertPrCache, cleanupPrCache, updatePrState,
  getRubricCategories, saveRubricCategories, getRubricThresholds, saveRubricThresholds,
  getAgentTasks, getAgentTask, createAgentTask, updateAgentTask, clearAgentTask, clearCompletedAgentTasks,
};
