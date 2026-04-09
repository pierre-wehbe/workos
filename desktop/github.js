const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { loadShellEnvironment } = require("./shell-env.js");

const execFileAsync = promisify(execFile);

let cache = { myPRs: [], reviewRequests: [], username: null, lastFetched: null };
let mainWindow = null;
let activePoller = null;
let bgPoller = null;

async function gh(args) {
  const env = { ...loadShellEnvironment(), HOMEBREW_NO_AUTO_UPDATE: "1" };
  try {
    const { stdout } = await execFileAsync("gh", args, { encoding: "utf8", env, timeout: 30000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getUsername() {
  if (cache.username) return cache.username;
  const raw = await gh(["api", "user", "-q", ".login"]);
  cache.username = raw;
  return raw;
}

async function fetchMyPRs() {
  const raw = await gh([
    "search", "prs",
    "--author=@me", "--state=open",
    "--json", "repository,number,title,state,isDraft,url,updatedAt,author,labels",
    "--limit", "50",
  ]);
  if (!raw) return [];
  try {
    const prs = JSON.parse(raw);
    return prs.map(normalizePR);
  } catch { return []; }
}

async function fetchReviewRequests() {
  const raw = await gh([
    "search", "prs",
    "--review-requested=@me", "--state=open",
    "--json", "repository,number,title,state,isDraft,url,updatedAt,author,labels",
    "--limit", "50",
  ]);
  if (!raw) return [];
  try {
    const prs = JSON.parse(raw);
    return prs.map(normalizePR);
  } catch { return []; }
}

function normalizePR(pr) {
  return {
    id: `${pr.repository?.nameWithOwner ?? "unknown"}#${pr.number}`,
    repo: pr.repository?.nameWithOwner ?? "unknown",
    repoName: pr.repository?.name ?? "unknown",
    owner: pr.repository?.owner ?? pr.repository?.nameWithOwner?.split("/")[0] ?? "",
    number: pr.number,
    title: pr.title,
    state: pr.state,
    isDraft: pr.isDraft ?? false,
    reviewDecision: null, // Not available from gh search — could be fetched via GraphQL later
    url: pr.url,
    updatedAt: pr.updatedAt,
    author: pr.author?.login ?? "unknown",
    labels: (pr.labels ?? []).map((l) => l.name),
  };
}

async function fetchAll() {
  const [myPRs, reviewRequests, username] = await Promise.all([
    fetchMyPRs(),
    fetchReviewRequests(),
    getUsername(),
  ]);

  cache = {
    myPRs,
    reviewRequests,
    username,
    lastFetched: new Date().toISOString(),
  };

  if (mainWindow) {
    mainWindow.webContents.send("github:update", getCache());
  }

  return getCache();
}

function getCache() {
  return {
    myPRs: cache.myPRs,
    reviewRequests: cache.reviewRequests,
    username: cache.username,
    lastFetched: cache.lastFetched,
    reviewRequestCount: cache.reviewRequests.length,
  };
}

async function getUserOrgs() {
  const raw = await gh(["api", "user/orgs", "--jq", ".[].login"]);
  if (!raw) return [];
  const username = await getUsername();
  const orgs = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  // Include personal account as an option
  if (username && !orgs.includes(username)) orgs.unshift(username);
  return orgs;
}

function init(window) {
  mainWindow = window;

  // Fetch immediately on launch
  fetchAll();

  // Active workspace poll: every 5 minutes
  activePoller = setInterval(() => fetchAll(), 5 * 60 * 1000);

  // Background full poll: every 12 hours
  bgPoller = setInterval(() => fetchAll(), 12 * 60 * 60 * 1000);
}

function setWindow(window) {
  mainWindow = window;
}

function destroy() {
  if (activePoller) clearInterval(activePoller);
  if (bgPoller) clearInterval(bgPoller);
}

async function checkGhInstalled() {
  const raw = await gh(["--version"]);
  if (!raw) return { installed: false, authenticated: false, username: null };
  const authRaw = await gh(["auth", "status"]);
  const authenticated = authRaw ? authRaw.includes("Logged in") : false;
  const username = authenticated ? await getUsername() : null;
  return { installed: true, authenticated, username };
}

module.exports = { init, setWindow, destroy, fetchAll, getCache, checkGhInstalled, getUserOrgs };
