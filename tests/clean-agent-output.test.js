import { describe, it, expect } from "vitest";

// We need to test the cleanAgentOutput function from agents.js
// But it's not exported. Let's extract and test the logic directly.
// For now, replicate the function here — if we refactor agents.js to export it, update this.

function cleanAgentOutput(raw) {
  const stripped = raw.replace(/\x1b\[[0-9;]*m/g, "");

  const tokenMarker = /tokens used\s*\n\s*[\d,]+\s*\n/;
  const tokenMatch = stripped.match(tokenMarker);
  if (tokenMatch) {
    const afterTokens = stripped.slice(tokenMatch.index + tokenMatch[0].length).trim();
    if (afterTokens.length > 50) return afterTokens;
  }

  const lines = stripped.split("\n");
  const contentStart = lines.findIndex((l) =>
    l.startsWith("**") || l.startsWith("##") || l.startsWith("This PR") || l.startsWith("Summary")
  );
  if (contentStart > 0) return lines.slice(contentStart).join("\n").trim();

  return stripped.trim();
}

describe("cleanAgentOutput", () => {
  it("strips ANSI escape codes", () => {
    const input = "\x1b[36muser\x1b[0m\nHello world";
    const result = cleanAgentOutput(input);
    expect(result).not.toContain("\x1b[");
  });

  it("extracts content after 'tokens used' marker (codex format)", () => {
    const input = [
      "OpenAI Codex v0.118.0",
      "--------",
      "\x1b[1mworkdir:\x1b[0m /some/path",
      "\x1b[1mmodel:\x1b[0m gpt-5.4",
      "--------",
      "\x1b[36muser\x1b[0m",
      "Some prompt text here",
      "\x1b[35mcodex\x1b[0m",
      "Let me analyze this...",
      "**Summary**",
      "This PR does things.",
      "",
      "**Scoring**",
      "- Code Clarity: 8/10",
      "\x1b[2mtokens used\x1b[0m",
      "34,539",
      "**Summary**",
      "This PR does things.",
      "",
      "**Scoring**",
      "- Code Clarity: 8/10",
    ].join("\n");

    const result = cleanAgentOutput(input);
    expect(result.startsWith("**Summary**")).toBe(true);
    expect(result).toContain("This PR does things.");
    expect(result).not.toContain("OpenAI Codex");
    expect(result).not.toContain("tokens used");
    expect(result).not.toContain("workdir:");
  });

  it("handles clean output (claude/gemini) by finding content start", () => {
    const input = "Some header line\nAnother header\n**Summary**\nThis PR is great.\n\n**Score**: 90/100";
    const result = cleanAgentOutput(input);
    expect(result.startsWith("**Summary**")).toBe(true);
    expect(result).not.toContain("Some header");
  });

  it("returns trimmed input when no markers found", () => {
    const input = "  Just a simple response  ";
    expect(cleanAgentOutput(input)).toBe("Just a simple response");
  });

  it("handles the full codex output with duplicated content after token marker", () => {
    // Simulates real codex output structure
    const boilerplate = "OpenAI Codex v0.118.0 (research preview)\n--------\nworkdir: /path\nmodel: gpt-5.4\n--------\n";
    const thinking = "user\nPrompt here\ncodex\nLet me think...\nmcp: tool started\nmcp: tool completed\ncodex\n";
    const actualContent = "**Summary**\n\nThis PR adds a Makefile.\n\n**Scoring**\n\n| Category | Score |\n| --- | --- |\n| Code Clarity | 8/10 |\n\n**Weighted Overall Score: 67.5/100**\n\n<!-- RUBRIC_JSON {\"overallScore\": 67.5, \"categories\": [{\"name\": \"Code Clarity\", \"score\": 8, \"maxScore\": 10, \"explanation\": \"Clean\"}]} -->";
    const tokenLine = "tokens used\n44,322\n";

    const fullOutput = boilerplate + thinking + actualContent + "\n" + tokenLine + actualContent;
    const result = cleanAgentOutput(fullOutput);

    expect(result).toContain("**Summary**");
    expect(result).toContain("RUBRIC_JSON");
    expect(result).not.toContain("OpenAI Codex");
    expect(result).not.toContain("mcp: tool started");
  });
});

describe("RUBRIC_JSON parsing", () => {
  it("extracts rubric from agent output", () => {
    const output = "**Summary**\nGreat PR.\n\n**Scores**\n- Code: 8/10\n\n<!-- RUBRIC_JSON {\"overallScore\": 85, \"categories\": [{\"name\": \"Code Clarity\", \"score\": 8, \"maxScore\": 10, \"explanation\": \"Clean code\"}]} -->";

    const rubricMatch = output.match(/<!-- RUBRIC_JSON\s+(\{[\s\S]*?\})\s*-->/);
    expect(rubricMatch).not.toBeNull();

    const rubric = JSON.parse(rubricMatch[1]);
    expect(rubric.overallScore).toBe(85);
    expect(rubric.categories).toHaveLength(1);
    expect(rubric.categories[0].name).toBe("Code Clarity");
    expect(rubric.categories[0].score).toBe(8);
  });

  it("summary is clean after stripping RUBRIC_JSON block", () => {
    const output = "**Summary**\nGreat PR.\n\n<!-- RUBRIC_JSON {\"overallScore\": 85, \"categories\": []} -->";
    const summary = output.replace(/<!-- RUBRIC_JSON\s+\{[\s\S]*?\}\s*-->/, "").trim();
    expect(summary).toBe("**Summary**\nGreat PR.");
    expect(summary).not.toContain("RUBRIC_JSON");
  });

  it("handles output without RUBRIC_JSON block gracefully", () => {
    const output = "**Summary**\nThis PR does something.\n\nScore: 80/100";
    const rubricMatch = output.match(/<!-- RUBRIC_JSON\s+(\{[\s\S]*?\})\s*-->/);
    expect(rubricMatch).toBeNull();
  });
});
