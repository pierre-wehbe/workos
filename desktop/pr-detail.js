const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { loadShellEnvironment } = require("./shell-env.js");

const execFileAsync = promisify(execFile);

async function gh(args) {
  const env = { ...loadShellEnvironment(), HOMEBREW_NO_AUTO_UPDATE: "1" };
  try {
    const { stdout } = await execFileAsync("gh", args, {
      encoding: "utf8",
      env,
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });
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
      files(first: 100) { nodes { path additions deletions } }
      reviewThreads(first: 100) {
        nodes {
          id isResolved path line
          comments(first: 50) { nodes { id author { login } body createdAt } }
        }
      }
      reviews(first: 50) { nodes { id author { login } state body createdAt } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
}
`.trim();

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
    const pr = data?.data?.repository?.pullRequest;
    if (!pr) return null;

    const ciNode = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;

    return {
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      state: pr.state,
      isDraft: pr.isDraft ?? false,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      headRefOid: pr.headRefOid,
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
        isResolved: t.isResolved,
        path: t.path,
        line: t.line,
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
      ciStatus: ciNode?.state ?? null,
    };
  } catch {
    return null;
  }
}

async function postComment(owner, repo, number, body) {
  const raw = await gh([
    "api",
    `repos/${owner}/${repo}/issues/${number}/comments`,
    "-X", "POST",
    "-f", `body=${body}`,
  ]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function replyToThread(owner, repo, number, commentId, body) {
  const raw = await gh([
    "api",
    `repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`,
    "-X", "POST",
    "-f", `body=${body}`,
  ]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function submitReview(owner, repo, number, event, body) {
  const raw = await gh([
    "api",
    `repos/${owner}/${repo}/pulls/${number}/reviews`,
    "-X", "POST",
    "-f", `event=${event}`,
    "-f", `body=${body}`,
  ]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const RESOLVE_THREAD_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`.trim();

async function resolveThread(owner, repo, number, threadId) {
  // owner/repo/number are unused for the mutation itself but kept for API consistency
  void owner; void repo; void number;
  const raw = await gh([
    "api", "graphql",
    "-F", `threadId=${threadId}`,
    "-f", `query=${RESOLVE_THREAD_MUTATION}`,
  ]);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.data?.resolveReviewThread?.thread ?? null;
  } catch {
    return null;
  }
}

// Lightweight: fetch just the head SHA for a PR (fast, minimal data)
async function fetchPRHeadSha(owner, repo, number) {
  const raw = await gh([
    "api", "graphql",
    "-F", `owner=${owner}`,
    "-F", `repo=${repo}`,
    "-F", `number=${number}`,
    "-f", `query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){headRefOid}}}`,
  ]);
  if (!raw) return null;
  try {
    return JSON.parse(raw)?.data?.repository?.pullRequest?.headRefOid ?? null;
  } catch { return null; }
}

module.exports = { fetchPRDetail, fetchPRHeadSha, postComment, replyToThread, submitReview, resolveThread };
