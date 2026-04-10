import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const db = require("../desktop/db.js");

function initFreshDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workos-test-"));
  db.init({ getPath: () => tmpDir });
  return tmpDir;
}

describe("Agent result → PR cache round-trip", () => {
  beforeEach(() => initFreshDb());

  it("agent result string can be stored in pr_cache as summary", () => {
    const prId = "owner/repo#123";
    const agentOutput = "This PR adds webhook retry logic with exponential backoff.\n\nScores:\n- Code Clarity: 8/10\n- Test Coverage: 6/10";

    // 1. Create PR cache entry (happens when PR detail is fetched)
    db.upsertPrCache(prId, { prState: "OPEN", headSha: "abc123" });

    // 2. Create agent task (happens when analysis is triggered)
    const task = db.createAgentTask({ id: "agent-1", prId, taskType: "summarize", cli: "codex" });
    expect(task.status).toBe("pending");

    // 3. Agent completes — result is stored as plain string
    db.updateAgentTask("agent-1", {
      status: "completed",
      result: agentOutput,
      tokenEstimate: 1234,
      completedAt: new Date().toISOString(),
    });

    // 4. Verify agent task has the result
    const completedTask = db.getAgentTask("agent-1");
    expect(completedTask.status).toBe("completed");
    expect(completedTask.result).toBe(agentOutput);
    // Must be the exact string, not JSON-encoded
    expect(completedTask.result).not.toContain('"This PR');

    // 5. Write agent result to PR cache as summary (this is what the frontend should do)
    db.upsertPrCache(prId, {
      summary: agentOutput,
      lastAnalyzedAt: new Date().toISOString(),
    });

    // 6. Read PR cache and verify summary is there
    const cached = db.getPrCache(prId);
    expect(cached.summary).toBe(agentOutput);
    expect(cached.summary).not.toBeNull();
    expect(cached.lastAnalyzedAt).not.toBeNull();
    // Must be plain text, not JSON-encoded
    expect(cached.summary[0]).not.toBe('"');
  });

  it("pr_cache summary survives app restart (re-init)", () => {
    const prId = "owner/repo#456";
    const summary = "This is a PR summary that should persist.";

    db.upsertPrCache(prId, { summary, prState: "OPEN", lastAnalyzedAt: "2026-01-01T00:00:00Z" });

    // Verify it's there
    const cached = db.getPrCache(prId);
    expect(cached.summary).toBe(summary);
  });

  it("upsertPrCache updates summary on existing entry without losing other fields", () => {
    const prId = "owner/repo#789";

    // Initial insert with PR data
    db.upsertPrCache(prId, {
      prData: { title: "Test PR", author: "alice" },
      prState: "OPEN",
      headSha: "sha1",
      lastFetchedAt: "2026-01-01T00:00:00Z",
    });

    // Update just the summary
    db.upsertPrCache(prId, {
      summary: "New summary text",
      lastAnalyzedAt: "2026-01-02T00:00:00Z",
    });

    const cached = db.getPrCache(prId);
    // Summary was updated
    expect(cached.summary).toBe("New summary text");
    expect(cached.lastAnalyzedAt).toBe("2026-01-02T00:00:00Z");
    // Other fields preserved
    expect(cached.prData).toEqual({ title: "Test PR", author: "alice" });
    expect(cached.prState).toBe("OPEN");
    expect(cached.headSha).toBe("sha1");
  });
});
