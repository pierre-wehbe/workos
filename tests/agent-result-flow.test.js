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

describe("Agent result → PR cache round-trip (analyses array)", () => {
  beforeEach(() => initFreshDb());

  it("stores analysis entries as an array in pr_cache", () => {
    const prId = "owner/repo#123";
    const agentOutput = "**Summary**\nThis PR adds webhook retry.\n\n**Scores**\n- Code: 8/10";

    // 1. Create PR cache entry
    db.upsertPrCache(prId, { prState: "OPEN", headSha: "abc123" });

    // 2. Append first analysis
    const entry1 = { headSha: "abc123", timestamp: "2026-01-01T12:00:00Z", summary: agentOutput, rubricResult: { overallScore: 75, categories: [] }, cli: "codex" };
    db.upsertPrCache(prId, { analyses: [entry1], lastAnalyzedAt: entry1.timestamp });

    const cached1 = db.getPrCache(prId);
    expect(cached1.analyses).toHaveLength(1);
    expect(cached1.analyses[0].summary).toBe(agentOutput);
    expect(cached1.analyses[0].rubricResult.overallScore).toBe(75);
    expect(cached1.analyses[0].cli).toBe("codex");

    // 3. Append second analysis (re-analyze after new commits)
    const entry2 = { headSha: "def456", timestamp: "2026-01-02T12:00:00Z", summary: "Improved PR after feedback.", rubricResult: { overallScore: 87, categories: [] }, cli: "claude" };
    db.upsertPrCache(prId, { analyses: [entry1, entry2], lastAnalyzedAt: entry2.timestamp });

    const cached2 = db.getPrCache(prId);
    expect(cached2.analyses).toHaveLength(2);
    expect(cached2.analyses[0].rubricResult.overallScore).toBe(75);
    expect(cached2.analyses[1].rubricResult.overallScore).toBe(87);
  });

  it("analyses array survives app restart", () => {
    const prId = "owner/repo#456";
    const analyses = [
      { headSha: "sha1", timestamp: "2026-01-01T00:00:00Z", summary: "First review", rubricResult: null, cli: "codex" },
      { headSha: "sha2", timestamp: "2026-01-02T00:00:00Z", summary: "Second review", rubricResult: { overallScore: 80, categories: [] }, cli: "claude" },
    ];

    db.upsertPrCache(prId, { analyses, prState: "OPEN", lastAnalyzedAt: analyses[1].timestamp });

    const cached = db.getPrCache(prId);
    expect(cached.analyses).toHaveLength(2);
    expect(cached.analyses[1].summary).toBe("Second review");
  });

  it("updating analyses preserves other fields", () => {
    const prId = "owner/repo#789";

    db.upsertPrCache(prId, {
      prData: { title: "Test PR", author: "alice" },
      prState: "OPEN",
      headSha: "sha1",
      lastFetchedAt: "2026-01-01T00:00:00Z",
    });

    const analyses = [{ headSha: "sha1", timestamp: "2026-01-02T00:00:00Z", summary: "Analysis text", rubricResult: null, cli: "codex" }];
    db.upsertPrCache(prId, { analyses, lastAnalyzedAt: analyses[0].timestamp });

    const cached = db.getPrCache(prId);
    expect(cached.analyses).toHaveLength(1);
    expect(cached.prData).toEqual({ title: "Test PR", author: "alice" });
    expect(cached.prState).toBe("OPEN");
    expect(cached.headSha).toBe("sha1");
  });

  it("new entries default to empty analyses array", () => {
    db.upsertPrCache("owner/repo#999", { prState: "OPEN" });
    const cached = db.getPrCache("owner/repo#999");
    expect(cached.analyses).toEqual([]);
  });
});
