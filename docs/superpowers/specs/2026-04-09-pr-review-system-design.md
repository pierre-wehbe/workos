# PR Review System — Design Spec

**Goal:** Streamline the full PR lifecycle (briefing, reviewing, responding, fixing) with AI agent assistance, configurable rubric scoring, and a decoupled Task Agents system — all within WorkOS.

**Scope:** Covers PRs you're asked to review AND PRs you've opened. Does NOT include velocity metrics, auto-merge, or team-wide analytics.

---

## 1. Architecture Overview

Three layers, each with clear boundaries:

### Layer 1: PR Data (GraphQL reads via `gh api graphql`)
- Fetches full PR context in a single query: diff stats, changed files, review threads, inline comments, CI status, labels, review decision
- REST writes via `gh api` for posting comments, approvals, review submissions
- All operations use existing `gh` CLI auth — no new tokens

### Layer 2: Intelligence (AI CLI agents)
- Summarization, rubric scoring, review drafting, comment response generation
- Uses whichever AI CLI is selected in WorkOS (claude/codex/gemini)
- Pre-fetched PR data is assembled into structured prompts — the CLI is a completion engine, WorkOS owns orchestration
- For deep tasks (implement fix), a git worktree is created for full codebase access

### Layer 3: Actions (gated)
- Conservative by default: agents produce drafts, user approves before posting
- Auto-approve gate: score ≥ 95 AND ≤ configured max files AND ≤ configured max lines
- Worktree tasks are always manually triggered
- Agent commits are never auto-pushed

---

## 2. PR Data Fetching

### GraphQL Query
A single `gh api graphql` call per PR that returns:
- PR metadata: title, author, state, isDraft, createdAt, updatedAt, headRefOid (SHA)
- Diff stats: additions, deletions, changedFiles
- Changed file list with path + additions/deletions per file
- Review threads: each thread has file path, line number, comments (author, body, createdAt), isResolved
- Reviews: author, state (APPROVED, CHANGES_REQUESTED, COMMENTED, PENDING), body
- CI status: combined status of latest commit checks
- Labels

### REST Writes
- `gh api repos/{owner}/{repo}/pulls/{number}/reviews` — POST to submit a review (approve, request changes, comment)
- `gh api repos/{owner}/{repo}/pulls/{number}/comments` — POST to reply to a review thread
- `gh api repos/{owner}/{repo}/pulls/{number}/reviews/{id}/events` — POST to submit pending review

### Integration with Existing GitHub Module
- `desktop/github.js` continues to handle PR list polling (5 min active, 12h background)
- New module `desktop/pr-detail.js` handles single-PR deep fetches and writes
- PR list uses existing `gh search` (fast, lightweight); PR detail uses GraphQL (rich, heavier)

---

## 3. PR Detail Page

Accessed by clicking any PR in the existing GitHub page. Full page view (like Project Detail), with back navigation to the PR list.

### Header
- Repo and PR number (e.g., `acme/backend#247`)
- PR title
- Author, updated timestamp
- Diff stats badge: `+142 −38 · 4 files`
- State badge: OPEN / DRAFT
- "Open on GitHub" button (external link)

### Tabs

#### 3.1 Briefing Tab (default)
- **Status bar**: shows whether summary was auto-triggered or manual, when it ran, approximate token usage, stale indicator if `head_sha` has changed since last analysis
- **Summary**: 2-4 sentence description of what the PR does
- **Key Changes**: list of changed files with one-line description of each
- **Inline Rubric Score**: overall score with per-category mini breakdown (scores only, no explanations — those are in the Rubric tab)
- **Quick Actions**: Approve, Draft Review, Spin Up Worktree, Re-analyze buttons

#### 3.2 Comments Tab
- **Filter bar**: All / Unresolved / Actionable
- **Threaded view**: each comment thread shows:
  - File context (path:line) for inline comments
  - Author avatar/initials, name, timestamp
  - Resolved/unresolved badge
  - Comment body
  - Nested replies
- **Quick response buttons per comment**:
  - **"Agree, will fix"** — posts a reply directly ("Good catch, I'll address this."), keeps thread unresolved
  - **"Agent: implement this"** — spawns a Task Agent with worktree to implement the change, posts a reply ("Spinning up an agent to address this."), agent result held for review before pushing
  - **"Custom reply"** — opens text input with optional "Draft with AI" button
  - **"Won't do (explain)"** — opens text input with AI-suggested explanation, posts reply and resolves thread

#### 3.3 Rubric Tab
- **Overall score**: large number with progress bar, auto-approve threshold indicator
- **Category breakdown**: each category shows score (N/10), weight percentage, and 1-2 sentence AI explanation of why that score was given
- **Default categories** (configurable in settings):
  - Code Clarity (20%)
  - Test Coverage (20%)
  - Architecture (20%)
  - Error Handling (15%)
  - Security (15%)
  - PR Hygiene (10%)

#### 3.4 Actions Tab
Context-dependent — different actions for reviewer vs author.

**When reviewing someone else's PR:**
- Approve (with optional comment)
- Request Changes (AI-drafted or manual review body)
- Draft Full Review (AI) — agent generates a rubric-based review, you edit before posting
- Re-analyze
- Open on GitHub

**When viewing your own PR:**
- Address All Comments (Agent) — agent reads unresolved comments, implements fixes in worktree, you review before push
- Summarize Feedback — agent condenses all review comments into actionable items
- Self-Review (Rubric) — run rubric on your own PR before requesting review
- Spin Up Worktree — manual, for you or the agent
- Re-analyze
- Open on GitHub

---

## 4. Task Agents System

Decoupled from the existing Process Manager. Separate titlebar badge, separate panel, separate lifecycle.

### Titlebar Badge
- Amber 🤖 icon with count, placed next to the existing green ⚡ Processes badge
- Pulsing dot when any agent is actively running
- Click opens the Task Agents popover panel

### Task Agents Panel (popover)
- Lists all active and recently completed agent tasks
- Each entry shows: task name, PR reference, CLI used, duration, approximate token count
- Running agents: Cancel button
- Completed agents: View (opens fullscreen terminal with raw output), Clear button
- Footer: "Clear all completed" action

### Agent Output View
- Fullscreen terminal (portal-based, same pattern as Process fullscreen terminal)
- Raw CLI output — what the agent actually produced
- Consistent with existing UX pattern

### Agent Task Types
| Task | Trigger | Context Source | Worktree? |
|------|---------|---------------|-----------|
| Summarize PR | Auto (small PR) or manual | Pre-fetched GraphQL data | No |
| Rubric Score | Auto (small PR) or manual | Pre-fetched GraphQL data | No |
| Draft Review | Manual | Pre-fetched GraphQL data | No |
| Draft Comment Reply | Manual | Pre-fetched comment thread | No |
| Implement Fix | Manual | Worktree + PR data | Yes |
| Address All Comments | Manual | Worktree + PR data | Yes |
| Summarize Feedback | Manual | Pre-fetched comment threads | No |

### Auto-trigger Rules
- **Auto-summarize + auto-rubric** when a PR enters the detail view AND:
  - Changed files ≤ `auto_summarize_max_files` (default: 5)
  - Changed lines ≤ `auto_summarize_max_lines` (default: 300, stored but not checked separately from files initially)
  - No cached result exists OR `head_sha` has changed
- Large PRs show a manual "Analyze" button instead

### Worktree Management
- Created via `git worktree add /tmp/workos-agent-{task_id} {pr_branch}`
- Agent runs inside the worktree directory with full repo access
- Agent commits are held locally in the worktree — never auto-pushed
- User reviews the diff, then manually triggers push or discards
- Cleanup: `git worktree remove` after user reviews/discards

### Agent Invocation
- WorkOS assembles a structured prompt with PR context (summary, diff, comments, rubric categories + weights)
- Spawns the selected AI CLI as a child process: `{cli} -p "prompt"` or equivalent
- Captures stdout/stderr, streams to log file
- On completion: stores result in `agent_tasks` table, updates Task Agents panel

---

## 5. Rubric Configuration

Stored in SQLite, editable from Settings page.

### Settings UI: Rubric Editor
- List of categories, each with:
  - Name (editable text)
  - Weight (percentage, editable)
  - Description (textarea — tells the agent what to evaluate for this category)
  - Drag handle for reorder
  - Delete button
- "+ Add category" button
- Total weight display (should sum to 100%)
- **Thresholds section**:
  - Auto-approve minimum score (default: 95)
  - Auto-approve max files (default: 5)
  - Auto-approve max lines (default: 300)
  - Auto-summarize max files (default: 5)
  - Auto-summarize max lines (default: 300)

### Default Rubric
Ships with 6 categories pre-configured (as listed in section 3.3). User can modify, add, or remove.

### Storage
- `rubric_categories` table: `id`, `name`, `weight`, `description`, `sort_order`
- `rubric_thresholds` in `meta` table as JSON: `{ autoApproveScore: 95, autoApproveMaxFiles: 5, autoApproveMaxLines: 300, autoSummarizeMaxFiles: 5, autoSummarizeMaxLines: 300 }`

---

## 6. Persistence & Caching

### New SQLite Tables

**`pr_cache`**
| Column | Type | Description |
|--------|------|-------------|
| `pr_id` | TEXT PK | e.g., `acme/backend#247` |
| `pr_data` | TEXT (JSON) | Full PR metadata from GraphQL |
| `summary` | TEXT | Agent-generated summary (null if not run) |
| `rubric_result` | TEXT (JSON) | Scores per category (null if not run) |
| `comment_threads` | TEXT (JSON) | Fetched comment threads |
| `last_fetched_at` | TEXT | ISO timestamp of last GitHub fetch |
| `last_analyzed_at` | TEXT | ISO timestamp of last agent analysis |
| `pr_state` | TEXT | OPEN / MERGED / CLOSED |
| `head_sha` | TEXT | Latest commit SHA for staleness detection |

**`agent_tasks`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `pr_id` | TEXT | FK to pr_cache |
| `task_type` | TEXT | summarize / rubric / draft_review / implement_fix / address_comments / summarize_feedback / draft_reply |
| `status` | TEXT | running / completed / failed / cancelled |
| `cli` | TEXT | claude / codex / gemini |
| `result` | TEXT | Agent output |
| `token_estimate` | INTEGER | Approximate tokens used |
| `log_file` | TEXT | Path to raw log file |
| `started_at` | TEXT | ISO timestamp |
| `completed_at` | TEXT | ISO timestamp |

**`rubric_categories`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `name` | TEXT | Category name |
| `weight` | INTEGER | Percentage weight |
| `description` | TEXT | What to evaluate |
| `sort_order` | INTEGER | Display order |

### Smart Continuation
- On app open: load `pr_cache` for all OPEN PRs
- On PR detail open: compare cached `head_sha` against GitHub response — if same, reuse summary/rubric. If different, show stale indicator with "Re-analyze?" prompt
- Comment threads are always re-fetched (change frequently) but merged with local draft responses
- Agent task history persists across restarts

### Cleanup
- When GitHub poll detects PR moved to MERGED or CLOSED: update `pr_state`
- On app launch: delete `pr_cache` and `agent_tasks` rows where `pr_state` is MERGED/CLOSED AND older than 7 days
- Worktree directories in `/tmp/` are cleaned up when agent task is cleared by user

---

## 7. IPC Channels (New)

### Main → Renderer (events)
- `agent-task:update` — agent status change (started, completed, failed)
- `agent-task:output` — streaming output chunk from running agent

### Renderer → Main (handlers)
| Channel | Args | Returns |
|---------|------|---------|
| `pr:fetch-detail` | `(owner, repo, number)` | Full PR data (GraphQL) |
| `pr:post-comment` | `(owner, repo, number, threadId, body)` | `{ ok, error? }` |
| `pr:submit-review` | `(owner, repo, number, event, body)` | `{ ok, error? }` |
| `pr:resolve-thread` | `(owner, repo, number, threadId)` | `{ ok, error? }` |
| `agent:start` | `(taskType, prId, context)` | `{ taskId }` |
| `agent:cancel` | `(taskId)` | `{ ok }` |
| `agent:list` | `()` | `AgentTask[]` |
| `agent:logs` | `(taskId)` | `string` (raw log content) |
| `agent:clear` | `(taskId)` | `{ ok }` |
| `agent:clear-all-completed` | `()` | `{ ok }` |
| `rubric:get` | `()` | `{ categories, thresholds }` |
| `rubric:save` | `(categories, thresholds)` | `{ ok }` |
| `pr-cache:get` | `(prId)` | Cached PR data + analysis |
| `pr-cache:cleanup` | `()` | Deletes stale merged/closed entries |

---

## 8. File Structure (New Files)

### Desktop (main process)
- `desktop/pr-detail.js` — GraphQL queries, REST writes, PR data normalization
- `desktop/agents.js` — Task agent lifecycle (spawn, stream, cancel, cleanup), worktree management, prompt assembly
- `desktop/rubric.js` — Rubric CRUD, default seeding, threshold management

### Frontend
- `src/pages/github/PRDetailPage.tsx` — PR detail page with tabs (Briefing, Comments, Rubric, Actions)
- `src/pages/github/tabs/BriefingTab.tsx` — Summary, key changes, inline rubric score
- `src/pages/github/tabs/CommentsTab.tsx` — Threaded comments with quick response buttons
- `src/pages/github/tabs/RubricTab.tsx` — Full rubric breakdown
- `src/pages/github/tabs/ActionsTab.tsx` — Context-dependent action buttons
- `src/components/AgentBadge.tsx` — Titlebar badge (amber, with count + pulse)
- `src/components/AgentPanel.tsx` — Task Agents popover panel
- `src/components/AgentTerminal.tsx` — Fullscreen terminal for agent output (reuses FullscreenTerminal pattern)
- `src/pages/settings/RubricEditor.tsx` — Rubric category editor + threshold config
- `src/lib/use-agents.ts` — Hook for agent task state management
- `src/lib/use-pr-detail.ts` — Hook for single PR data + cache

### DB Schema Changes
- New tables in `desktop/db.js`: `pr_cache`, `agent_tasks`, `rubric_categories`
- New meta keys: `rubric_thresholds`
- Migration logic via existing `PRAGMA table_info` pattern

---

## 9. Token Consciousness

- Auto-analysis only on small PRs (configurable thresholds)
- Large PRs show manual "Analyze" button — user decides if it's worth the tokens
- Token estimate displayed on every agent task (in panel and status bar)
- Worktree tasks (expensive) are always manual
- Pre-fetched GraphQL data avoids redundant agent context gathering
- Cached results prevent re-analysis of unchanged PRs

---

## 10. Out of Scope

- Velocity metrics / time-to-merge tracking
- Auto-merge capability
- Team-wide analytics or dashboards
- Webhook-based real-time PR updates (polling is sufficient)
- Multi-rubric support (one rubric for now, applies to all PRs)
- PR diff rendering in-app (link to GitHub for full diff view)
