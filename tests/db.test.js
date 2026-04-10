import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Init db with a temp path each time
const dbModule = require("../desktop/db.js");

function initFreshDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workos-test-"));
  const fakeApp = { getPath: () => tmpDir };
  dbModule.init(fakeApp);
  return tmpDir;
}

describe("PR Cache", () => {
  beforeEach(() => initFreshDb());

  it("returns null for non-existent pr_id", () => {
    expect(dbModule.getPrCache("nonexistent")).toBeNull();
  });

  it("inserts and retrieves a PR cache entry", () => {
    dbModule.upsertPrCache("owner/repo#1", {
      prData: { title: "Test PR" },
      summary: "This is a plain text summary",
      prState: "OPEN",
      headSha: "abc123",
      lastFetchedAt: "2026-01-01T00:00:00Z",
    });
    const cached = dbModule.getPrCache("owner/repo#1");
    expect(cached).not.toBeNull();
    expect(cached.prId).toBe("owner/repo#1");
    expect(cached.prData).toEqual({ title: "Test PR" });
    expect(cached.summary).toBe("This is a plain text summary");
    expect(cached.prState).toBe("OPEN");
    expect(cached.headSha).toBe("abc123");
  });

  it("updates an existing PR cache entry", () => {
    dbModule.upsertPrCache("owner/repo#2", { prState: "OPEN" });
    dbModule.upsertPrCache("owner/repo#2", { summary: "Updated summary", lastAnalyzedAt: "2026-01-02T00:00:00Z" });
    const cached = dbModule.getPrCache("owner/repo#2");
    expect(cached.summary).toBe("Updated summary");
    expect(cached.lastAnalyzedAt).toBe("2026-01-02T00:00:00Z");
    expect(cached.prState).toBe("OPEN");
  });

  it("stores rubricResult as JSON and retrieves as object", () => {
    const rubric = { overallScore: 87, categories: [{ name: "Code Clarity", score: 9, maxScore: 10, explanation: "Clean" }] };
    dbModule.upsertPrCache("owner/repo#3", { rubricResult: rubric });
    const cached = dbModule.getPrCache("owner/repo#3");
    expect(cached.rubricResult).toEqual(rubric);
  });

  it("cleanupPrCache removes MERGED/CLOSED entries", () => {
    dbModule.upsertPrCache("owner/repo#10", { prState: "MERGED" });
    dbModule.upsertPrCache("owner/repo#11", { prState: "OPEN" });
    dbModule.upsertPrCache("owner/repo#12", { prState: "CLOSED" });
    dbModule.cleanupPrCache();
    expect(dbModule.getPrCache("owner/repo#10")).toBeNull();
    expect(dbModule.getPrCache("owner/repo#11")).not.toBeNull();
    expect(dbModule.getPrCache("owner/repo#12")).toBeNull();
  });

  it("updatePrState changes the state", () => {
    dbModule.upsertPrCache("owner/repo#20", { prState: "OPEN" });
    dbModule.updatePrState("owner/repo#20", "MERGED");
    const cached = dbModule.getPrCache("owner/repo#20");
    expect(cached.prState).toBe("MERGED");
  });
});

describe("Rubric Categories", () => {
  beforeEach(() => initFreshDb());

  it("seeds 6 default categories", () => {
    const cats = dbModule.getRubricCategories();
    expect(cats).toHaveLength(6);
    expect(cats[0].name).toBe("Code Clarity");
    expect(cats[0].weight).toBe(20);
    expect(cats[5].name).toBe("PR Hygiene");
    expect(cats[5].weight).toBe(10);
  });

  it("weights sum to 100", () => {
    const cats = dbModule.getRubricCategories();
    const total = cats.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });

  it("saveRubricCategories replaces all categories", () => {
    const newCats = [
      { id: "a", name: "Speed", weight: 50, description: "Fast code", sortOrder: 0 },
      { id: "b", name: "Safety", weight: 50, description: "Safe code", sortOrder: 1 },
    ];
    const saved = dbModule.saveRubricCategories(newCats);
    expect(saved).toHaveLength(2);
    expect(saved[0].name).toBe("Speed");
    expect(saved[1].name).toBe("Safety");
    // Old categories gone
    const all = dbModule.getRubricCategories();
    expect(all).toHaveLength(2);
  });
});

describe("Rubric Thresholds", () => {
  beforeEach(() => initFreshDb());

  it("returns null when no thresholds set", () => {
    // Default seeding sets thresholds, so clear them
    dbModule.setMeta("rubric_thresholds", "");
    const thresh = dbModule.getRubricThresholds();
    // Empty string returns null from JSON.parse guard
    expect(thresh).toBeNull();
  });

  it("saves and retrieves thresholds", () => {
    const thresholds = { autoApproveScore: 90, autoApproveMaxFiles: 3, autoApproveMaxLines: 200, autoSummarizeMaxFiles: 10, autoSummarizeMaxLines: 500 };
    dbModule.saveRubricThresholds(thresholds);
    const saved = dbModule.getRubricThresholds();
    expect(saved).toEqual(thresholds);
  });
});

describe("Agent Tasks", () => {
  beforeEach(() => initFreshDb());

  it("creates and retrieves an agent task", () => {
    const task = dbModule.createAgentTask({ id: "task-1", prId: "owner/repo#5", taskType: "summarize", cli: "codex" });
    expect(task.id).toBe("task-1");
    expect(task.prId).toBe("owner/repo#5");
    expect(task.taskType).toBe("summarize");
    expect(task.status).toBe("pending");
  });

  it("updates agent task status and result", () => {
    dbModule.createAgentTask({ id: "task-2", prId: "owner/repo#5", taskType: "rubric", cli: "claude" });
    dbModule.updateAgentTask("task-2", { status: "completed", result: "This is the raw output from the agent" });
    const task = dbModule.getAgentTask("task-2");
    expect(task.status).toBe("completed");
    expect(task.result).toBe("This is the raw output from the agent");
  });

  it("result is stored as plain string, not JSON-encoded", () => {
    dbModule.createAgentTask({ id: "task-str", prId: "pr#1", taskType: "summarize", cli: "codex" });
    dbModule.updateAgentTask("task-str", { result: "Hello world" });
    const task = dbModule.getAgentTask("task-str");
    // Should be the exact string, not '"Hello world"' (double-encoded)
    expect(task.result).toBe("Hello world");
  });

  it("clearAgentTask removes the task", () => {
    dbModule.createAgentTask({ id: "task-3", prId: "owner/repo#5", taskType: "summarize", cli: "codex" });
    dbModule.clearAgentTask("task-3");
    expect(dbModule.getAgentTask("task-3")).toBeNull();
  });

  it("clearCompletedAgentTasks removes completed/failed/cancelled but not running", () => {
    dbModule.createAgentTask({ id: "t1", taskType: "summarize", cli: "codex" });
    dbModule.updateAgentTask("t1", { status: "completed" });
    dbModule.createAgentTask({ id: "t2", taskType: "rubric", cli: "codex" });
    dbModule.updateAgentTask("t2", { status: "failed" });
    dbModule.createAgentTask({ id: "t3", taskType: "draft_review", cli: "codex" });
    dbModule.updateAgentTask("t3", { status: "running" });
    dbModule.createAgentTask({ id: "t4", taskType: "summarize", cli: "codex" });
    dbModule.updateAgentTask("t4", { status: "cancelled" });

    dbModule.clearCompletedAgentTasks();
    expect(dbModule.getAgentTask("t1")).toBeNull();
    expect(dbModule.getAgentTask("t2")).toBeNull();
    expect(dbModule.getAgentTask("t3")).not.toBeNull();
    expect(dbModule.getAgentTask("t4")).toBeNull();
  });

  it("getAgentTasks returns all tasks", () => {
    dbModule.createAgentTask({ id: "a1", taskType: "summarize", cli: "codex" });
    dbModule.createAgentTask({ id: "a2", taskType: "rubric", cli: "claude" });
    const tasks = dbModule.getAgentTasks();
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("a1");
    expect(ids).toContain("a2");
  });
});
