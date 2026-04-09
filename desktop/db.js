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
};
