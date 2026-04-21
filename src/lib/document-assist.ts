import type { AICli, SkillScope, SkillStudioFile } from "./types";

function stripFencedBlock(output: string) {
  const trimmed = output.trim();
  const match = trimmed.match(/^```(?:md|markdown)?\s*([\s\S]*?)```$/i);
  return match ? match[1].trim() : trimmed;
}

export function normalizeDocumentAssistOutput(output: string) {
  return `${stripFencedBlock(output).trim()}\n`;
}

function parseJsonBlock<T>(output: string): T {
  const normalized = stripFencedBlock(output).trim();
  return JSON.parse(normalized) as T;
}

export function buildAgentsAssistPrompt({
  cli,
  filePath,
  content,
}: {
  cli: AICli;
  filePath: string;
  content: string;
}) {
  return `You are improving an AGENTS.md file for the ${cli.toUpperCase()} CLI.

If the superpowers plugin or related workflow skills are available, use them to improve the workflow quality, but keep the result as a plain AGENTS.md file.

Goals:
- Make the file concise, operational, and repo-specific.
- Preserve real commands, constraints, and architecture notes.
- Remove generic filler and repeated guidance.
- Keep markdown structure clean and readable.

Return only the full revised markdown file. Do not wrap it in code fences.

File path: ${filePath}

Current content:
${content || "(empty file)"}
`;
}

export interface InstructionStudioOutput {
  assistantMessage: string;
  documentContent: string;
}

export function parseInstructionStudioOutput(output: string): InstructionStudioOutput {
  const parsed = parseJsonBlock<InstructionStudioOutput>(output);
  return {
    assistantMessage: parsed.assistantMessage?.trim() || "Draft updated.",
    documentContent: `${(parsed.documentContent || "").trim()}\n`,
  };
}

export function buildInstructionStudioPrompt({
  cli,
  filePath,
  currentContent,
  messages,
}: {
  cli: AICli;
  filePath: string;
  currentContent: string;
  messages: SkillStudioMessage[];
}) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
  const basename = filePath.split(/[/\\]/).pop() || filePath;
  const documentGuidance = basename === "AGENTS.md"
    ? `This is an AGENTS.md file. If the superpowers plugin or related workflow skills are available, use them to improve workflow quality. Keep the result concise, operational, repo-specific, and full of real commands and constraints instead of filler.`
    : `This is a markdown instruction file. Keep it concise, operational, and specific to the selected CLI. Preserve real commands, constraints, and architecture notes.`;

  return `Use the best available instruction-authoring workflow for the ${cli.toUpperCase()} CLI.

You are operating an Instruction Studio flow for ${basename}.

${documentGuidance}

Requirements:
- Return a full replacement for the file, not a diff.
- Keep the markdown readable and intentional.
- Remove generic filler and repeated guidance.
- Preserve material constraints, commands, ownership, and architectural notes.
- Prefer short sections and direct instructions over long prose.

File path: ${filePath}

Current content:
${currentContent || "(empty file)"}

Conversation:
${transcript || "(no prior messages)"}

Return JSON only with this exact shape:
{
  "assistantMessage": "short explanation of what changed and any open tradeoff",
  "documentContent": "full markdown file content"
}

Rules for the JSON:
- documentContent must contain the full file.
- Do not wrap the JSON in markdown fences.
- Do not add commentary outside the JSON object.
`;
}

export function buildSkillAssistPrompt({
  cli,
  filePath,
  content,
}: {
  cli: AICli;
  filePath: string;
  content: string;
}) {
  return `Use the skill-creator skill.

You are drafting or improving a SKILL.md file for the ${cli.toUpperCase()} CLI.

Goals:
- Keep the frontmatter valid.
- Make the description precise enough to trigger correctly.
- Keep the body procedural and concise.
- Prefer progressive disclosure over long inline reference material.
- Preserve repo-specific workflows and examples that matter.

Return only the full revised markdown file. Do not wrap it in code fences.

File path: ${filePath}

Current content:
${content || "(empty file)"}
`;
}

export function buildSkillStarterTemplate(skillName: string) {
  const normalizedName = skillName.trim() || "new-skill";
  return `---
name: ${normalizedName}
description: Use when [describe exactly when this skill should trigger].
---

# ${normalizedName}

## Goal
- Explain the workflow or domain this skill supports.

## When To Use
- Describe the concrete triggers.

## Workflow
1. Add the procedure the CLI should follow.
2. Keep it concise and operational.

## References
- Link to repo-local files or scripts only when they are actually needed.
`;
}

export interface SkillStudioMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SkillStudioOutput {
  assistantMessage: string;
  skillMd: string;
  scripts: SkillStudioFile[];
  suggestedName?: string | null;
}

export function parseSkillStudioOutput(output: string): SkillStudioOutput {
  const parsed = parseJsonBlock<SkillStudioOutput>(output);
  return {
    assistantMessage: parsed.assistantMessage?.trim() || "Draft updated.",
    skillMd: `${(parsed.skillMd || "").trim()}\n`,
    scripts: Array.isArray(parsed.scripts)
      ? parsed.scripts
        .filter((script) => script && typeof script.path === "string")
        .map((script) => ({
          path: script.path.replace(/\\/g, "/"),
          content: `${script.content || ""}`.replace(/\s+$/, ""),
        }))
      : [],
    suggestedName: parsed.suggestedName?.trim() || null,
  };
}

export function buildSkillStudioPrompt({
  cli,
  scope,
  targetRoot,
  skillName,
  allowScripts,
  currentSkillMd,
  currentScripts,
  messages,
}: {
  cli: AICli;
  scope: SkillScope;
  targetRoot: string;
  skillName: string;
  allowScripts: boolean;
  currentSkillMd: string;
  currentScripts: SkillStudioFile[];
  messages: SkillStudioMessage[];
}) {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
  const currentScriptsBlock = currentScripts.length > 0
    ? currentScripts.map((script) => `File: ${script.path}\n${script.content}`).join("\n\n---\n\n")
    : "(none)";

  return `Use the skill-creator skill if it is available for the ${cli.toUpperCase()} CLI. If it is not available, follow the same best-practice behavior yourself.

You are operating a Skill Studio flow. Produce a high-quality skill package for the ${cli.toUpperCase()} CLI.

Requirements:
- The package must always contain a strong SKILL.md.
- Keep the skill narrow, triggerable, and procedural.
- Use valid frontmatter with a precise description.
- Prefer progressive disclosure over long reference dumps.
- If scripts are useful and allowed, place them under scripts/.
- Keep file names ASCII and deterministic.
- Do not include placeholder filler if you can produce a concrete workflow.

Scope: ${scope}
Target root: ${targetRoot}
Requested skill name: ${skillName || "(not chosen yet)"}
Scripts allowed: ${allowScripts ? "yes" : "no"}

Current SKILL.md draft:
${currentSkillMd || "(empty)"}

Current scripts:
${currentScriptsBlock}

Conversation:
${transcript || "(no prior messages)"}

Return JSON only with this exact shape:
{
  "assistantMessage": "short explanation of what changed and any open tradeoff",
  "suggestedName": "skill-name-if-you-want-to-adjust-it-or-null",
  "skillMd": "full SKILL.md content",
  "scripts": [
    { "path": "scripts/example.sh", "content": "file content" }
  ]
}

Rules for the JSON:
- skillMd must be the full SKILL.md file.
- scripts must be an array. Use [] when no scripts are needed.
- Every script path must start with "scripts/".
- Do not wrap the JSON in commentary outside the JSON object.
`;
}
