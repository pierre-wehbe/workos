const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { loadShellEnvironment } = require("./shell-env.js");

const execFileAsync = promisify(execFile);

async function git(repoPath, args) {
  const env = loadShellEnvironment();
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
      encoding: "utf8", env, timeout: 15000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Parse `git worktree list --porcelain` output into structured objects
function parseWorktreeList(raw) {
  if (!raw) return [];
  const entries = raw.split("\n\n").filter(Boolean);
  return entries.map((block) => {
    const lines = block.split("\n");
    const obj = {};
    for (const line of lines) {
      if (line.startsWith("worktree ")) obj.path = line.slice(9);
      else if (line.startsWith("HEAD ")) obj.headSha = line.slice(5);
      else if (line.startsWith("branch ")) obj.branch = line.slice(7).replace("refs/heads/", "");
      else if (line === "bare") obj.bare = true;
      else if (line === "detached") obj.detached = true;
    }
    return obj;
  }).filter((w) => w.path && !w.bare); // skip the bare repo entry
}

// List all worktrees for a repo
async function listWorktrees(repoPath) {
  const raw = await git(repoPath, ["worktree", "list", "--porcelain"]);
  const worktrees = parseWorktreeList(raw);

  // The first entry is the main working tree — mark it
  return worktrees.map((w, i) => ({
    path: w.path,
    branch: w.branch ?? null,
    headSha: w.headSha ?? null,
    detached: !!w.detached,
    isMain: i === 0,
    syncStatus: null, // filled lazily by checkSyncStatus
  }));
}

// Check if a worktree's branch is up-to-date with its remote tracking branch
// Returns: "up-to-date" | "behind" | "ahead" | "diverged" | "no-remote" | null
async function checkSyncStatus(repoPath, worktreePath) {
  const env = loadShellEnvironment();
  // Fetch latest from remote (fast, just updates refs)
  try {
    await execFileAsync("git", ["-C", worktreePath, "fetch", "--quiet"], {
      encoding: "utf8", env, timeout: 15000,
    });
  } catch {} // Fetch may fail if offline — that's ok

  // Get the tracking branch
  const tracking = await git(worktreePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!tracking) return "no-remote";

  // Count ahead/behind
  const raw = await git(worktreePath, ["rev-list", "--left-right", "--count", `HEAD...${tracking}`]);
  if (!raw) return null;
  const [ahead, behind] = raw.split("\t").map(Number);
  if (ahead === 0 && behind === 0) return "up-to-date";
  if (ahead > 0 && behind > 0) return "diverged";
  if (behind > 0) return `behind ${behind}`;
  return `ahead ${ahead}`;
}

// Create a worktree for a branch
async function createWorktree(repoPath, branch, targetPath) {
  const env = loadShellEnvironment();

  // Determine target path if not provided
  if (!targetPath) {
    const repoName = require("node:path").basename(repoPath);
    const safeBranch = branch.replace(/[^a-zA-Z0-9_-]/g, "-");
    targetPath = require("node:path").join(require("os").tmpdir(), `workos-wt-${repoName}-${safeBranch}`);
  }

  // Fetch the branch first
  try {
    await execFileAsync("git", ["-C", repoPath, "fetch", "origin", branch], {
      encoding: "utf8", env, timeout: 30000,
    });
  } catch {} // May fail if local-only branch

  // Try origin/branch first, then local branch
  try {
    await execFileAsync("git", ["-C", repoPath, "worktree", "add", targetPath, `origin/${branch}`], {
      encoding: "utf8", env, timeout: 15000,
    });
    return { ok: true, path: targetPath };
  } catch {
    try {
      await execFileAsync("git", ["-C", repoPath, "worktree", "add", targetPath, branch], {
        encoding: "utf8", env, timeout: 15000,
      });
      return { ok: true, path: targetPath };
    } catch {
      // Try creating a new branch from origin/branch
      try {
        await execFileAsync("git", ["-C", repoPath, "worktree", "add", "-b", branch, targetPath, `origin/${branch}`], {
          encoding: "utf8", env, timeout: 15000,
        });
        return { ok: true, path: targetPath };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }
  }
}

// Remove a worktree
async function removeWorktree(repoPath, worktreePath) {
  const env = loadShellEnvironment();
  try {
    await execFileAsync("git", ["-C", repoPath, "worktree", "remove", worktreePath, "--force"], {
      encoding: "utf8", env, timeout: 10000,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Prune stale worktree references (e.g., if /tmp paths were cleaned up by OS)
async function pruneWorktrees(repoPath) {
  await git(repoPath, ["worktree", "prune"]);
}

module.exports = { listWorktrees, checkSyncStatus, createWorktree, removeWorktree, pruneWorktrees };
