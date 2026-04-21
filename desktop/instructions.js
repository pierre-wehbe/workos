const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./db.js");

const SUPPORTED_CLIS = ["codex", "claude", "gemini"];
const REPO_ARTIFACTS = [
  {
    id: "repo-agents",
    name: "AGENTS.md",
    relativePath: "AGENTS.md",
    kind: "instruction",
    description: "Repo-local instructions for Codex.",
    supportedClis: ["codex"],
    activationMode: "always",
    recommended: true,
  },
  {
    id: "repo-claude",
    name: "CLAUDE.md",
    relativePath: "CLAUDE.md",
    kind: "instruction",
    description: "Repo-local instructions for Claude.",
    supportedClis: ["claude"],
    activationMode: "always",
    recommended: false,
  },
  {
    id: "repo-gemini",
    name: "GEMINI.md",
    relativePath: "GEMINI.md",
    kind: "instruction",
    description: "Repo-local instructions for Gemini.",
    supportedClis: ["gemini"],
    activationMode: "always",
    recommended: false,
  },
];

const RECOMMENDED_CODEX_PLUGINS = [
  {
    id: "slack@openai-curated",
    name: "Slack",
    description: "Read and manage Slack conversations, drafts, and channel recaps.",
  },
  {
    id: "gmail@openai-curated",
    name: "Gmail",
    description: "Summarize inbox activity, draft replies, and triage email threads.",
  },
  {
    id: "superpowers@openai-curated",
    name: "Superpowers",
    description: "Add planning, debugging, review, and delivery workflows for coding agents.",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Work across Drive, Docs, Sheets, and Slides from one plugin surface.",
  },
];

const CLI_LOCAL_LAYOUTS = [
  {
    cli: "codex",
    label: "Codex",
    dotDir: ".codex",
    skillsDir: "skills",
    rulesDir: "rules",
    ruleLane: "permission",
    ruleDescription: "Codex rule files that can shape command approvals for this scope.",
  },
  {
    cli: "claude",
    label: "Claude",
    dotDir: ".claude",
    skillsDir: "skills",
    rulesDir: "rules",
    ruleLane: "behavior",
    ruleDescription: "Claude rule documents stored alongside this codebase.",
  },
  {
    cli: "gemini",
    label: "Gemini",
    dotDir: ".gemini",
    skillsDir: "skills",
    rulesDir: "rules",
    ruleLane: "behavior",
    ruleDescription: "Gemini rule documents stored alongside this codebase.",
  },
];

const PACKAGE_MARKERS = [
  { file: "package.json", ecosystem: "Node" },
  { file: "pyproject.toml", ecosystem: "Python" },
  { file: "Cargo.toml", ecosystem: "Rust" },
  { file: "go.mod", ecosystem: "Go" },
  { file: "Package.swift", ecosystem: "Swift" },
  { file: "Gemfile", ecosystem: "Ruby" },
];

const MAJOR_SCOPE_PREFIXES = new Set(["apps", "packages", "services", "libs", "sdk", "crates"]);

function sha(content) {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 12);
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function safeReadJson(filePath) {
  const content = safeRead(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fileStats(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size,
    };
  } catch {
    return { modifiedAt: null, size: null };
  }
}

function countLines(content) {
  if (!content) return 0;
  return content.split("\n").length;
}

function normalizePath(input) {
  if (!input) return null;
  return path.resolve(input);
}

function isWithin(basePath, targetPath) {
  if (!basePath || !targetPath) return false;
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function firstUsefulLine(content) {
  if (!content) return "";
  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "---" || line.startsWith("```")) continue;
    if (line.startsWith("#")) return line.replace(/^#+\s*/, "");
    return line;
  }
  return "";
}

function firstUsefulLines(content, limit = 4) {
  if (!content) return [];
  const lines = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "---" || line.startsWith("```")) continue;
    lines.push(line.startsWith("#") ? line.replace(/^#+\s*/, "") : line);
    if (lines.length >= limit) break;
  }
  return lines;
}

function summarizeContent(kind, content, fallback) {
  if (!content || !content.trim()) return fallback;
  if (kind === "rules") {
    const ruleCount = content.split("\n").filter((line) => line.trim().startsWith("prefix_rule(")).length;
    return ruleCount > 0 ? `${ruleCount} approved command prefix${ruleCount === 1 ? "" : "es"}` : fallback;
  }
  return firstUsefulLine(content).slice(0, 140) || fallback;
}

function titleCase(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function splitPluginId(pluginId) {
  const [name, source] = pluginId.split("@");
  return { name, source: source || null };
}

function findLocalPluginManifest(pluginId) {
  if (!pluginId) return null;
  const { name, source } = splitPluginId(pluginId);
  const home = os.homedir();
  const candidates = [];

  if (source) {
    const cacheRoot = path.join(home, ".codex", "plugins", "cache", source, name);
    if (fs.existsSync(cacheRoot)) {
      try {
        const entries = fs.readdirSync(cacheRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(cacheRoot, entry.name, ".codex-plugin", "plugin.json"))
          .filter((candidate) => fs.existsSync(candidate))
          .sort()
          .reverse();
        candidates.push(...entries);
      } catch {
        // Ignore and fall through to other locations.
      }
    }
  }

  candidates.push(
    path.join(home, ".codex", ".tmp", "plugins", "plugins", name, ".codex-plugin", "plugin.json"),
    path.join(home, ".codex", "plugins", name, ".codex-plugin", "plugin.json"),
    path.join(home, ".codex", "vendor_imports", name, ".codex-plugin", "plugin.json")
  );

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function readPluginMetadata(pluginId) {
  const manifestPath = findLocalPluginManifest(pluginId);
  if (!manifestPath) return null;
  const manifest = safeReadJson(manifestPath);
  if (!manifest || typeof manifest !== "object") return null;

  const manifestInterface = manifest.interface && typeof manifest.interface === "object" ? manifest.interface : {};
  return {
    manifestPath,
    displayName: manifestInterface.displayName || titleCase(manifest.name || splitPluginId(pluginId).name),
    shortDescription: manifestInterface.shortDescription || manifest.description || null,
    category: manifestInterface.category || null,
    capabilities: Array.isArray(manifestInterface.capabilities) ? manifestInterface.capabilities : [],
  };
}

function providerFromName(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("gh-") || lower.includes("github")) return { key: "github", label: "GitHub" };
  if (lower.startsWith("slack-")) return { key: "slack", label: "Slack" };
  if (lower.startsWith("gmail-")) return { key: "gmail", label: "Gmail" };
  if (lower.startsWith("imagegen")) return { key: "imagegen", label: "Images" };
  if (lower.startsWith("openai")) return { key: "openai", label: "OpenAI" };
  return null;
}

function capabilityGroupForSkill(skillPath, skillName) {
  const normalized = skillPath.toLowerCase();
  if (normalized.includes("/plugins/cache/openai-curated/github/")) return { key: "github", label: "GitHub" };
  if (normalized.includes("/plugins/cache/openai-curated/slack/")) return { key: "slack", label: "Slack" };
  if (normalized.includes("/plugins/cache/openai-curated/gmail/")) return { key: "gmail", label: "Gmail" };
  if (normalized.includes("/skills/.system/")) return { key: "system", label: "System" };
  return providerFromName(skillName) ?? { key: "general", label: "General" };
}

function capabilityGroupForPlugin(pluginId) {
  const [base] = pluginId.split("@");
  const known = providerFromName(base);
  return known ?? { key: base, label: titleCase(base) };
}

function localCapabilityGroup(scope, cli) {
  const scopeLabel = scope === "workspace" ? "Workspace Local" : "Repo Local";
  return { key: `${scope}-${cli}-local`, label: scopeLabel };
}

function layoutForCli(cli) {
  return CLI_LOCAL_LAYOUTS.find((layout) => layout.cli === cli) || CLI_LOCAL_LAYOUTS[0];
}

function skillRootPathFor(cli, scope, workspacePath = null, projectPath = null) {
  const layout = layoutForCli(cli);
  if (scope === "global") return path.join(os.homedir(), layout.dotDir, layout.skillsDir);
  if (scope === "workspace") return workspacePath ? path.join(workspacePath, layout.dotDir, layout.skillsDir) : null;
  return projectPath ? path.join(projectPath, layout.dotDir, layout.skillsDir) : null;
}

function scopeFromSkillPath(cli, filePath, workspacePath = null, projectPath = null) {
  const normalized = normalizePath(filePath);
  if (!normalized) return "global";
  const repoRoot = normalizePath(projectPath);
  const workspaceRoot = normalizePath(workspacePath);
  if (repoRoot && isWithin(repoRoot, normalized)) return "repo";
  if (workspaceRoot && isWithin(workspaceRoot, normalized)) return "workspace";
  return "global";
}

function instructionStarterTemplate({ cli, scope, name }) {
  const cliLabel = cli === "codex" ? "Codex" : cli === "claude" ? "Claude" : "Gemini";
  const scopeLabel = scope === "global"
    ? "Global"
    : scope === "workspace"
      ? "Workspace"
      : "Repo";
  const fileLabel = name.toUpperCase();

  return `# ${scopeLabel} ${cliLabel} Instructions

## Goals
- Describe what the agent should optimize for.

## Constraints
- Add boundaries the agent must respect.

## Preferred Workflow
- Note how you want changes, tests, and reviews handled.

## Repo Notes
- Include any important project context or conventions.

<!-- ${fileLabel} starter template generated by WorkOS -->
`;
}

function scopedInstructionStarterTemplate({ cli, relativePath }) {
  const cliLabel = cli === "codex" ? "Codex" : cli === "claude" ? "Claude" : "Gemini";
  return `# ${cliLabel} Instructions For ${relativePath}

## Scope
- Applies to files under \`${relativePath}/\`.

## Commands
- Document the build, test, and local run commands that differ here.

## Constraints
- Note the architecture, boundaries, and failure modes that matter in this subtree.

## Review Checklist
- Capture the checks that should happen before changes are considered done.

<!-- Directory-scoped starter template generated by WorkOS -->
`;
}

function extractRulesPreview(content, limit = 6) {
  if (!content) return [];
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("prefix_rule("));

  return lines.slice(0, limit).map((line) => {
    const patternMatch = line.match(/pattern=\[(.*?)\]/);
    if (!patternMatch) return line;
    const tokens = [...patternMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return tokens.join(" ");
  });
}

function configPreviewLines(configMeta, trustLevel) {
  const lines = [];
  if (configMeta.model) lines.push(`model = ${configMeta.model}`);
  if (configMeta.reasoningEffort) lines.push(`reasoning = ${configMeta.reasoningEffort}`);
  if (configMeta.personality) lines.push(`personality = ${configMeta.personality}`);
  lines.push(`plugins enabled = ${configMeta.plugins.filter((plugin) => plugin.enabled).length}`);
  if (trustLevel) lines.push(`matched trust = ${trustLevel}`);
  return lines;
}

function pluginPreviewLines({ configured, enabled, recommended, metadata }) {
  const lines = [];
  lines.push(configured ? `enabled = ${enabled ? "true" : "false"}` : "not configured in config.toml");
  if (recommended) lines.push("recommended by WorkOS");
  if (metadata?.category) lines.push(`category = ${metadata.category}`);
  if (metadata?.capabilities?.length) lines.push(`capabilities = ${metadata.capabilities.join(", ")}`);
  return lines;
}

function scanTreeForFiles(rootPath, { matcher, maxDepth = 5, skipDirectory = null }) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const found = [];
  const visited = new Set();

  const walk = (dirPath, depth) => {
    if (depth > maxDepth || visited.has(dirPath) || !fs.existsSync(dirPath)) return;
    visited.add(dirPath);
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (skipDirectory && skipDirectory(entry.name, fullPath, depth + 1)) continue;
        if (entry.name === "node_modules") continue;
        walk(fullPath, depth + 1);
        continue;
      }
      if (entry.isFile() && matcher(fullPath, entry.name)) found.push(fullPath);
    }
  };

  walk(rootPath, 0);
  return found.sort();
}

function scanTreeForDirectories(rootPath, { matcher, maxDepth = 5, skipDirectory = null }) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const found = [];
  const visited = new Set();

  const walk = (dirPath, depth) => {
    if (depth > maxDepth || visited.has(dirPath) || !fs.existsSync(dirPath)) return;
    visited.add(dirPath);
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (skipDirectory && skipDirectory(entry.name, fullPath, depth + 1)) continue;
      if (matcher(fullPath, entry.name)) found.push(fullPath);
      walk(fullPath, depth + 1);
    }
  };

  walk(rootPath, 0);
  return found.sort();
}

function skipProjectDiscoveryDirectory(name) {
  return (
    name === "node_modules"
    || name === ".git"
    || name === "dist"
    || name === "build"
    || name === "coverage"
    || name === "target"
    || name === "Pods"
    || name === "__pycache__"
    || name === ".next"
    || name === ".turbo"
    || name === ".venv"
    || (name.startsWith(".") && name !== ".codex" && name !== ".claude" && name !== ".gemini")
  );
}

function relativeLabel(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative && relative !== "" ? relative : "/";
}

function majorScopePath(rootPath, targetDir) {
  const relative = path.relative(rootPath, targetDir);
  if (!relative || relative === "") return "/";
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length >= 2 && MAJOR_SCOPE_PREFIXES.has(parts[0])) return path.join(parts[0], parts[1]);
  return parts[0];
}

function collectRepoPackageScopes(projectPath) {
  const manifests = scanTreeForFiles(projectPath, {
    matcher: (_fullPath, name) => PACKAGE_MARKERS.some((marker) => marker.file === name),
    maxDepth: 5,
    skipDirectory: (name) => skipProjectDiscoveryDirectory(name),
  });
  const scopes = new Map();

  for (const manifestPath of manifests) {
    const marker = PACKAGE_MARKERS.find((entry) => entry.file === path.basename(manifestPath));
    if (!marker) continue;
    const manifestDir = path.dirname(manifestPath);
    const scopePath = majorScopePath(projectPath, manifestDir);
    if (scopePath === "/") continue;
    const existing = scopes.get(scopePath) || {
      path: scopePath,
      ecosystems: new Set(),
      manifests: new Set(),
      manifestDirs: new Set(),
    };
    existing.ecosystems.add(marker.ecosystem);
    existing.manifests.add(marker.file);
    existing.manifestDirs.add(manifestDir);
    scopes.set(scopePath, existing);
  }

  return [...scopes.values()]
    .map((scope) => ({
      path: scope.path,
      ecosystem: [...scope.ecosystems].sort().join(", "),
      manifest: [...scope.manifests].sort()[0] || null,
      manifestDirs: [...scope.manifestDirs].sort(),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function nestedInstructionArtifacts(rootPath, scope) {
  const specs = [
    { fileName: "AGENTS.md", cli: "codex", description: "Directory-scoped Codex instructions for this subtree." },
    { fileName: "CLAUDE.md", cli: "claude", description: "Directory-scoped Claude instructions for this subtree." },
    { fileName: "GEMINI.md", cli: "gemini", description: "Directory-scoped Gemini instructions for this subtree." },
  ];
  const files = scanTreeForFiles(rootPath, {
    matcher: (_fullPath, name) => specs.some((spec) => spec.fileName === name),
    maxDepth: 5,
    skipDirectory: (name) => skipProjectDiscoveryDirectory(name),
  });

  return files
    .filter((filePath) => path.dirname(filePath) !== rootPath)
    .map((filePath) => {
      const spec = specs.find((entry) => entry.fileName === path.basename(filePath));
      const directoryPath = path.dirname(filePath);
      const relativePath = relativeLabel(rootPath, directoryPath);
      const depth = relativePath === "/" ? 0 : relativePath.split(path.sep).length;
      return {
        id: `nested-instruction-${scope}-${spec.cli}-${filePath}`,
        name: `${spec.fileName} · ${relativePath}`,
        kind: "instruction",
        lane: scope,
        scope,
        filePath,
        description: spec.description,
        supportedClis: [spec.cli],
        activationMode: "always",
        precedence: 45 + depth,
        metadata: {
          starterTemplate: scopedInstructionStarterTemplate({ cli: spec.cli, relativePath }),
        },
      };
    });
}

function upsertSectionBoolean(content, sectionName, key, enabled) {
  const lines = (content || "").split("\n");
  const sectionHeader = `[${sectionName}]`;
  const sectionStart = lines.findIndex((line) => line.trim() === sectionHeader);

  if (sectionStart === -1) {
    const suffix = lines.length > 0 && lines[lines.length - 1] !== "" ? "\n" : "";
    return `${content || ""}${suffix}\n${sectionHeader}\n${key} = ${enabled ? "true" : "false"}\n`.replace(/^\n/, "");
  }

  let sectionEnd = lines.length;
  for (let idx = sectionStart + 1; idx < lines.length; idx += 1) {
    if (lines[idx].trim().startsWith("[") && lines[idx].trim().endsWith("]")) {
      sectionEnd = idx;
      break;
    }
  }

  const keyIndex = lines.slice(sectionStart + 1, sectionEnd).findIndex((line) => line.trim().startsWith(`${key} =`));
  if (keyIndex >= 0) {
    lines[sectionStart + 1 + keyIndex] = `${key} = ${enabled ? "true" : "false"}`;
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
  }

  lines.splice(sectionEnd, 0, `${key} = ${enabled ? "true" : "false"}`);
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function parseCodexConfig(content) {
  const result = {
    personality: null,
    model: null,
    reasoningEffort: null,
    projectTrust: [],
    plugins: [],
  };
  if (!content) return result;

  let section = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1);
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*"?(.*?)"?$/);
    if (!kv) continue;
    const [, key, value] = kv;

    if (!section) {
      if (key === "personality") result.personality = value;
      if (key === "model") result.model = value;
      if (key === "model_reasoning_effort") result.reasoningEffort = value;
      continue;
    }

    const projectSection = section.match(/^projects\."(.+)"$/);
    if (projectSection && key === "trust_level") {
      result.projectTrust.push({ path: projectSection[1], trustLevel: value });
      continue;
    }

    const pluginSection = section.match(/^plugins\."(.+)"$/);
    if (pluginSection && key === "enabled") {
      result.plugins.push({ id: pluginSection[1], enabled: value === "true" });
    }
  }

  return result;
}

function resolveTrustLevel(configMeta, targetPath) {
  if (!targetPath) return null;
  let match = null;
  for (const entry of configMeta.projectTrust) {
    if (!isWithin(entry.path, targetPath)) continue;
    if (!match || entry.path.length > match.path.length) match = entry;
  }
  return match ? match.trustLevel : null;
}

function discoverGlobalSkillFiles() {
  const home = os.homedir();
  const roots = [
    path.join(home, ".codex", "skills"),
    path.join(home, ".codex", "plugins"),
    path.join(home, ".codex", "vendor_imports"),
  ];
  const found = [];
  const visited = new Set();

  const walk = (dirPath, depth) => {
    if (depth > 7 || visited.has(dirPath) || !fs.existsSync(dirPath)) return;
    visited.add(dirPath);
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(fullPath, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") found.push(fullPath);
    }
  };

  for (const root of roots) walk(root, 0);
  return [...new Set(found)].sort();
}

function discoverLocalArtifacts(rootPath, scope) {
  if (!rootPath) return [];
  const artifacts = [];

  for (const layout of CLI_LOCAL_LAYOUTS) {
    const skillsRoot = path.join(rootPath, layout.dotDir, layout.skillsDir);
    for (const skillPath of scanTreeForFiles(skillsRoot, { matcher: (_fullPath, name) => name === "SKILL.md" })) {
      artifacts.push({
        id: `local-skill-${scope}-${layout.cli}-${skillPath}`,
        name: path.basename(path.dirname(skillPath)),
        kind: "skill",
        lane: "capability",
        scope,
        filePath: skillPath,
        description: `${layout.label} skill defined in this ${scope}.`,
        supportedClis: [layout.cli],
        activationMode: "on_demand",
        metadata: localCapabilityGroup(scope, layout.cli),
      });
    }

    const rulesRoot = path.join(rootPath, layout.dotDir, layout.rulesDir);
    for (const rulePath of scanTreeForFiles(rulesRoot, { matcher: (_fullPath, name) => !name.startsWith(".") })) {
      artifacts.push({
        id: `local-rule-${scope}-${layout.cli}-${rulePath}`,
        name: path.relative(rulesRoot, rulePath),
        kind: "rules",
        lane: layout.ruleLane === "permission" ? "permission" : scope,
        scope,
        filePath: rulePath,
        description: layout.ruleDescription,
        supportedClis: [layout.cli],
        activationMode: "always",
        metadata: {
          previewLines: firstUsefulLines(safeRead(rulePath) || ""),
        },
      });
    }
  }

  return artifacts;
}

function getWritableRoots() {
  let workspaceRoots = [];
  let projectRoots = [];
  try {
    workspaceRoots = db.getWorkspaces().map((ws) => ws.path);
    projectRoots = (db.getAllProjects ? db.getAllProjects() : []).map((project) => project.localPath);
  } catch {
    workspaceRoots = [];
    projectRoots = [];
  }
  return [path.join(os.homedir(), ".codex"), ...workspaceRoots, ...projectRoots]
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function isWritableManagedPath(targetPath) {
  if (!targetPath) return false;
  const normalized = path.resolve(targetPath);
  const home = os.homedir();
  const codexRoot = path.join(home, ".codex");
  if (isWithin(path.join(codexRoot, "plugins"), normalized)) return false;
  if (isWithin(path.join(codexRoot, "vendor_imports"), normalized)) return false;
  return getWritableRoots().some((root) => isWithin(root, normalized));
}

function isEditablePath(filePath) {
  if (!filePath) return false;
  const normalized = path.resolve(filePath);
  const allowedNames = new Set(["AGENTS.md", "CLAUDE.md", "GEMINI.md", "config.toml", "SKILL.md"]);
  const baseName = path.basename(normalized);
  const localRulesDirMatch = CLI_LOCAL_LAYOUTS.some((layout) =>
    getWritableRoots().some((root) => isWithin(path.join(root, layout.dotDir, layout.rulesDir), normalized))
  );

  if (baseName.endsWith(".rules")) return isWritableManagedPath(normalized);
  if (localRulesDirMatch) return true;
  if (!allowedNames.has(baseName)) return false;
  return isWritableManagedPath(normalized);
}

function isManagedSkillFile(filePath) {
  if (!filePath) return false;
  const normalized = path.resolve(filePath);
  if (path.basename(normalized) !== "SKILL.md") return false;
  if (normalized.includes(`${path.sep}.system${path.sep}`)) return false;
  if (!isWritableManagedPath(path.dirname(normalized))) return false;

  const localSkillRoots = getWritableRoots().flatMap((root) =>
    CLI_LOCAL_LAYOUTS.map((layout) => path.join(root, layout.dotDir, layout.skillsDir))
  );
  localSkillRoots.push(path.join(os.homedir(), ".codex", "skills"));

  return localSkillRoots.some((root) => isWithin(root, normalized));
}

function artifactStatus({ exists, supportedClis, cli, activationMode, recommended }) {
  if (!supportedClis.includes(cli)) return "unsupported";
  if (!exists) return recommended ? "missing" : "inactive";
  if (activationMode === "on_demand") return "available";
  return "active";
}

function buildArtifact({
  id,
  name,
  kind,
  lane,
  scope,
  filePath = null,
  description,
  supportedClis,
  cli,
  activationMode,
  recommended = false,
  precedence = null,
  contentOverride = null,
  existsOverride = null,
  statusOverride = null,
  editableOverride = null,
  summaryOverride = null,
  diagnostics = [],
  metadata = {},
}) {
  const exists = existsOverride ?? (!!filePath && fs.existsSync(filePath));
  const content = contentOverride != null ? contentOverride : (exists ? safeRead(filePath) : null);
  const stats = exists ? fileStats(filePath) : { modifiedAt: null, size: null };
  const computedDiagnostics = [...diagnostics];

  if (exists && content != null && !content.trim()) {
    computedDiagnostics.push({ level: "warning", message: "File exists but is empty." });
  }
  if (!exists && recommended && supportedClis.includes(cli)) {
    computedDiagnostics.push({ level: "info", message: "Recommended artifact is not present yet." });
  }

  return {
    id,
    name,
    kind,
    lane,
    scope,
    path: filePath,
    exists,
    editable: editableOverride ?? isEditablePath(filePath),
    activationMode,
    status: statusOverride ?? artifactStatus({ exists, supportedClis, cli, activationMode, recommended }),
    supportedClis,
    description,
    summary: summaryOverride ?? summarizeContent(kind, content, description),
    precedence,
    recommended,
    lineCount: content != null ? countLines(content) : null,
    size: stats.size,
    modifiedAt: stats.modifiedAt,
    fingerprint: content != null ? sha(content) : null,
    diagnostics: computedDiagnostics,
    ...metadata,
  };
}

function buildRuntimeArtifacts(cli) {
  return [
    buildArtifact({
      id: "runtime-system",
      name: "System Runtime",
      kind: "runtime",
      lane: "runtime",
      scope: "runtime",
      description: "OpenAI-managed system instructions and model behavior.",
      supportedClis: [cli],
      cli,
      activationMode: "runtime",
      contentOverride: "Managed by WorkOS and the CLI runtime.",
      existsOverride: true,
      statusOverride: "active",
      editableOverride: false,
      summaryOverride: "Platform-managed runtime instructions",
    }),
    buildArtifact({
      id: "runtime-developer",
      name: "WorkOS Runtime",
      kind: "runtime",
      lane: "runtime",
      scope: "runtime",
      description: "App-level developer instructions, tool schemas, and environment constraints.",
      supportedClis: [cli],
      cli,
      activationMode: "runtime",
      contentOverride: "Managed by WorkOS at runtime.",
      existsOverride: true,
      statusOverride: "active",
      editableOverride: false,
      summaryOverride: "App-managed developer and tool instructions",
    }),
    buildArtifact({
      id: "runtime-task",
      name: "Current Task",
      kind: "runtime",
      lane: "runtime",
      scope: "runtime",
      description: "The current user prompt and live repo context provided at run time.",
      supportedClis: [cli],
      cli,
      activationMode: "runtime",
      contentOverride: "Changes every run.",
      existsOverride: true,
      statusOverride: "active",
      editableOverride: false,
      summaryOverride: "User prompt and live session context",
    }),
  ];
}

function buildConfigArtifacts(cli, projectPath) {
  const home = os.homedir();
  const configPath = path.join(home, ".codex", "config.toml");
  const configContent = safeRead(configPath) || "";
  const configMeta = parseCodexConfig(configContent);
  const trustLevel = resolveTrustLevel(configMeta, projectPath);
  const configuredPlugins = new Map(configMeta.plugins.map((plugin) => [plugin.id, plugin]));
  const recommendedPlugins = cli === "codex" ? RECOMMENDED_CODEX_PLUGINS : [];
  const recommendedPluginIds = new Set(recommendedPlugins.map((plugin) => plugin.id));
  const pluginIds = [
    ...recommendedPlugins.map((plugin) => plugin.id),
    ...[...configuredPlugins.keys()].filter((pluginId) => !recommendedPluginIds.has(pluginId)).sort(),
  ];

  const pluginArtifacts = pluginIds.map((pluginId) => {
    const configured = configuredPlugins.get(pluginId) || null;
    const recommendedPlugin = recommendedPlugins.find((plugin) => plugin.id === pluginId) || null;
    const pluginMetadata = readPluginMetadata(pluginId);
    const enabled = configured?.enabled ?? false;
    const group = capabilityGroupForPlugin(pluginId);
    const diagnostics = [];

    if (recommendedPlugin && !configured) {
      diagnostics.push({ level: "info", message: "Recommended plugin is not configured yet." });
    }
    if (!pluginMetadata) {
      diagnostics.push({ level: "warning", message: "No local plugin manifest was detected for this plugin id." });
    }

    return buildArtifact({
      id: `plugin-${pluginId}`,
      name: pluginMetadata?.displayName || recommendedPlugin?.name || pluginId,
      kind: "plugin",
      lane: "capability",
      scope: "global",
      filePath: configPath,
      description: recommendedPlugin?.description
        || pluginMetadata?.shortDescription
        || (enabled ? "Enabled plugin capability." : configured ? "Plugin configured but disabled." : "Plugin available to Codex."),
      supportedClis: ["codex"],
      cli,
      activationMode: "on_demand",
      recommended: Boolean(recommendedPlugin),
      statusOverride: configured ? (enabled ? "available" : "inactive") : recommendedPlugin ? "missing" : "inactive",
      contentOverride: configContent,
      summaryOverride: configured
        ? (enabled ? "Configured and enabled" : "Configured but disabled")
        : recommendedPlugin
          ? "Recommended, not configured"
          : "Detected locally",
      diagnostics,
      metadata: {
        pluginId,
        pluginEnabled: enabled,
        pluginConfigured: Boolean(configured),
        pluginDetected: Boolean(pluginMetadata),
        groupKey: group.key,
        groupLabel: group.label,
        previewLines: pluginPreviewLines({
          configured: Boolean(configured),
          enabled,
          recommended: Boolean(recommendedPlugin),
          metadata: pluginMetadata,
        }),
      },
    });
  });

  const configSummaryBits = [configMeta.model, configMeta.reasoningEffort, configMeta.personality].filter(Boolean);
  const configArtifact = buildArtifact({
    id: "global-codex-config",
    name: "config.toml",
    kind: "config",
    lane: "global",
    scope: "global",
    filePath: configPath,
    description: "Codex defaults for model, reasoning effort, trust, and plugins.",
    supportedClis: ["codex"],
    cli,
    activationMode: "always",
    recommended: true,
    precedence: 10,
    summaryOverride: configSummaryBits.length > 0 ? configSummaryBits.join(" · ") : "Codex defaults",
    metadata: { previewLines: configPreviewLines(configMeta, trustLevel) },
  });

  const trustArtifact = buildArtifact({
    id: "global-trust",
    name: "Trust Level",
    kind: "trust",
    lane: "permission",
    scope: "global",
    description: "Most specific trust entry resolved from config.toml for the selected repo.",
    supportedClis: ["codex"],
    cli,
    activationMode: "always",
    existsOverride: true,
    statusOverride: trustLevel ? "active" : "inactive",
    contentOverride: trustLevel ? `trust_level = "${trustLevel}"` : "No trust entry matched.",
    editableOverride: false,
    summaryOverride: trustLevel ? `Resolved trust: ${trustLevel}` : "No trust override found",
    metadata: { previewLines: trustLevel ? [`trust_level = "${trustLevel}"`] : ["No matching trust override"] },
  });

  return { configMeta, artifacts: [configArtifact, trustArtifact, ...pluginArtifacts] };
}

function buildGlobalArtifacts(cli) {
  const home = os.homedir();
  const artifacts = [];

  artifacts.push(buildArtifact({
    id: "global-agents",
    name: "AGENTS.md",
    kind: "instruction",
    lane: "global",
    scope: "global",
    filePath: path.join(home, ".codex", "AGENTS.md"),
    description: "Global Codex instructions shared across repos.",
    supportedClis: ["codex"],
    cli,
    activationMode: "always",
    recommended: true,
    precedence: 20,
    metadata: { starterTemplate: instructionStarterTemplate({ cli, scope: "global", name: "AGENTS.md" }) },
  }));

  const rulesDir = path.join(home, ".codex", "rules");
  if (fs.existsSync(rulesDir)) {
    let entries = [];
    try {
      entries = fs.readdirSync(rulesDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".rules")) continue;
      const filePath = path.join(rulesDir, entry.name);
      artifacts.push(buildArtifact({
        id: `rule-${entry.name}`,
        name: entry.name,
        kind: "rules",
        lane: "permission",
        scope: "global",
        filePath,
        description: "Approved command prefixes and other permission policy.",
        supportedClis: ["codex"],
        cli,
        activationMode: "always",
        precedence: 15,
        metadata: { previewLines: extractRulesPreview(safeRead(filePath) || "") },
      }));
    }
  }

  for (const skillPath of discoverGlobalSkillFiles()) {
    const skillName = path.basename(path.dirname(skillPath));
    artifacts.push(buildArtifact({
      id: `skill-${skillPath}`,
      name: skillName,
      kind: "skill",
      lane: "capability",
      scope: "global",
      filePath: skillPath,
      description: "On-demand skill available to Codex when the task calls for it.",
      supportedClis: ["codex"],
      cli,
      activationMode: "on_demand",
      metadata: {
        groupKey: capabilityGroupForSkill(skillPath, skillName).key,
        groupLabel: capabilityGroupForSkill(skillPath, skillName).label,
      },
    }));
  }

  return artifacts;
}

function buildWorkspaceArtifacts(cli, workspacePath) {
  if (!workspacePath) return [];
  const artifacts = [
    buildArtifact({
      id: "workspace-agents",
      name: "AGENTS.md",
      kind: "instruction",
      lane: "workspace",
      scope: "workspace",
      filePath: path.join(workspacePath, "AGENTS.md"),
      description: "Workspace-wide Codex instructions shared by repos under this workspace root.",
      supportedClis: ["codex"],
      cli,
      activationMode: "always",
      recommended: true,
      precedence: 30,
      metadata: { starterTemplate: instructionStarterTemplate({ cli, scope: "workspace", name: "AGENTS.md" }) },
    }),
  ];

  for (const artifact of discoverLocalArtifacts(workspacePath, "workspace")) {
    artifacts.push(buildArtifact({
      ...artifact,
      cli,
    }));
  }

  return artifacts;
}

function buildRepoArtifacts(cli, projectPath) {
  if (!projectPath) return [];
  const artifacts = REPO_ARTIFACTS.map((artifact, index) => buildArtifact({
    id: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    lane: "repo",
    scope: "repo",
    filePath: path.join(projectPath, artifact.relativePath),
    description: artifact.description,
    supportedClis: artifact.supportedClis,
    cli,
    activationMode: artifact.activationMode,
    recommended: artifact.recommended,
    precedence: 40 + index,
    metadata: artifact.kind === "instruction"
      ? { starterTemplate: instructionStarterTemplate({ cli: artifact.supportedClis[0], scope: "repo", name: artifact.name }) }
      : {},
  }));

  for (const artifact of nestedInstructionArtifacts(projectPath, "repo")) {
    artifacts.push(buildArtifact({
      ...artifact,
      cli,
    }));
  }

  for (const artifact of discoverLocalArtifacts(projectPath, "repo")) {
    artifacts.push(buildArtifact({
      ...artifact,
      cli,
    }));
  }

  return artifacts;
}

function laneInfo(id) {
  if (id === "runtime") return { label: "Runtime", description: "Managed at run time by the CLI and WorkOS." };
  if (id === "global") return { label: "Global", description: "Machine-wide defaults and behavior shared across repos." };
  if (id === "workspace") return { label: "Workspace", description: "Org or workspace policy rooted at the active workspace." };
  if (id === "repo") return { label: "Repo", description: "Repo-local instructions and overrides." };
  if (id === "capability") return { label: "Capabilities", description: "Skills and plugins available to the selected CLI." };
  return { label: "Permissions", description: "Trust and command approval policy." };
}

function groupLanes(artifacts) {
  const laneOrder = ["runtime", "global", "workspace", "repo", "capability", "permission"];
  const scopeOrder = { repo: 0, workspace: 1, global: 2, runtime: 3 };
  return laneOrder.map((laneId) => {
    const items = artifacts
      .filter((artifact) => artifact.lane === laneId)
      .sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        if (laneId === "capability" || laneId === "permission") {
          const scopeDelta = scopeOrder[a.scope] - scopeOrder[b.scope];
          if (scopeDelta !== 0) return scopeDelta;
        }
        return (a.precedence ?? 999) - (b.precedence ?? 999);
      });
    return { id: laneId, ...laneInfo(laneId), items };
  });
}

function buildWarnings(artifacts, cli) {
  const warnings = [];
  const activeInstructions = artifacts.filter((artifact) =>
    artifact.kind === "instruction" && artifact.status === "active" && artifact.supportedClis.includes(cli)
  );
  if (activeInstructions.length === 0) warnings.push("No active instruction file found for the selected CLI.");
  if (artifacts.some((artifact) => artifact.status === "missing" && artifact.scope === "repo")) {
    warnings.push("Repo-local instruction file is missing for the selected CLI.");
  }
  return warnings;
}

function getAgentContext({ cli = "codex", workspacePath = null, projectPath = null }) {
  const normalizedCli = SUPPORTED_CLIS.includes(cli) ? cli : "codex";
  const workspaceRoot = normalizePath(workspacePath);
  const repoRoot = normalizePath(projectPath);

  const runtimeArtifacts = buildRuntimeArtifacts(normalizedCli);
  const { artifacts: configArtifacts } = buildConfigArtifacts(normalizedCli, repoRoot || workspaceRoot);
  const globalArtifacts = buildGlobalArtifacts(normalizedCli);
  const workspaceArtifacts = buildWorkspaceArtifacts(normalizedCli, workspaceRoot);
  const repoArtifacts = buildRepoArtifacts(normalizedCli, repoRoot);

  const artifacts = [
    ...runtimeArtifacts,
    ...configArtifacts,
    ...globalArtifacts,
    ...workspaceArtifacts,
    ...repoArtifacts,
  ];

  return {
    cli: normalizedCli,
    workspacePath: workspaceRoot,
    projectPath: repoRoot,
    artifacts,
    lanes: groupLanes(artifacts),
    warnings: buildWarnings(artifacts, normalizedCli),
  };
}

function getRepoCodexSetup({ workspacePath = null, projectPath = null }) {
  const repoRoot = normalizePath(projectPath);
  const workspaceRoot = normalizePath(workspacePath);
  if (!repoRoot) throw new Error("Missing project path");

  const snapshot = getAgentContext({ cli: "codex", workspacePath: workspaceRoot, projectPath: repoRoot });
  const rootAgentsPath = path.join(repoRoot, "AGENTS.md");
  const sharedSkillsPath = path.join(repoRoot, ".codex", "skills");
  const sharedRulesPath = path.join(repoRoot, ".codex", "rules");
  const rootAgentsExists = fs.existsSync(rootAgentsPath);
  const sharedSkillsExists = fs.existsSync(sharedSkillsPath);
  const sharedRulesExists = fs.existsSync(sharedRulesPath);
  const nestedCodexDirCount = scanTreeForDirectories(repoRoot, {
    matcher: (_fullPath, name) => name === ".codex",
    maxDepth: 5,
    skipDirectory: (name) => skipProjectDiscoveryDirectory(name),
  }).length;
  const pluginRecommendations = snapshot.artifacts
    .filter((artifact) => artifact.kind === "plugin" && artifact.recommended)
    .map((artifact) => ({
      pluginId: artifact.pluginId,
      name: artifact.name,
      enabled: artifact.pluginEnabled === true,
      configured: artifact.pluginConfigured === true,
      recommended: artifact.recommended,
    }))
    .filter((plugin) => plugin.pluginId);

  const packageScopes = collectRepoPackageScopes(repoRoot);
  const isMonorepo = packageScopes.length > 1;
  const nestedInstructions = snapshot.artifacts.filter((artifact) =>
    artifact.kind === "instruction"
    && artifact.scope === "repo"
    && artifact.path
    && path.basename(artifact.path) === "AGENTS.md"
    && path.dirname(artifact.path) !== repoRoot
  );
  const codexOnlyExternalArtifacts = snapshot.artifacts.filter((artifact) =>
    artifact.scope === "repo"
    && artifact.supportedClis.length === 1
    && artifact.supportedClis[0] !== "codex"
    && artifact.path
    && (artifact.path.includes(`${path.sep}.claude${path.sep}`) || artifact.path.includes(`${path.sep}.gemini${path.sep}`))
  );

  const structure = [
    {
      path: "/",
      ecosystem: isMonorepo ? "Monorepo root" : (packageScopes[0]?.ecosystem || "Repo root"),
      manifest: packageScopes.find((scope) => scope.path === "/")?.manifest || null,
      hasLocalAgents: rootAgentsExists,
      inheritsRootAgents: false,
      localSkillCount: scanTreeForFiles(sharedSkillsPath, { matcher: (_fullPath, name) => name === "SKILL.md", maxDepth: 3 }).length,
      localRuleCount: scanTreeForFiles(sharedRulesPath, { matcher: (_fullPath, name) => !name.startsWith("."), maxDepth: 3 }).length,
      recommendation: "root",
      note: rootAgentsExists
        ? "Shared repo-wide instructions are in place."
        : "Create a root AGENTS.md first so Codex has one clear shared policy layer.",
    },
    ...packageScopes.map((scope) => {
      const scopeRoot = path.join(repoRoot, scope.path);
      const localAgentsPath = path.join(scopeRoot, "AGENTS.md");
      const hasLocalAgents = fs.existsSync(localAgentsPath);
      const localSkillRoot = path.join(scopeRoot, ".codex", "skills");
      const localRuleRoot = path.join(scopeRoot, ".codex", "rules");
      const localSkillCount = scanTreeForFiles(localSkillRoot, { matcher: (_fullPath, name) => name === "SKILL.md", maxDepth: 3 }).length;
      const localRuleCount = scanTreeForFiles(localRuleRoot, { matcher: (_fullPath, name) => !name.startsWith("."), maxDepth: 3 }).length;
      const recommendation = hasLocalAgents
        ? "covered"
        : rootAgentsExists && isMonorepo
          ? "recommended"
          : "optional";
      const note = hasLocalAgents
        ? "Directory-scoped instructions already exist here."
        : rootAgentsExists && isMonorepo
          ? "Add a local AGENTS.md if commands, runtime, or constraints differ from the repo root."
          : "Root guidance may be enough unless this area diverges from the rest of the repo.";

      return {
        path: scope.path,
        ecosystem: scope.ecosystem,
        manifest: scope.manifest,
        hasLocalAgents,
        inheritsRootAgents: rootAgentsExists,
        localSkillCount,
        localRuleCount,
        recommendation,
        note,
      };
    }),
  ];

  const actions = [];
  if (!rootAgentsExists) {
    actions.push({
      id: "create-root-agents",
      kind: "create_file",
      severity: "required",
      title: "Create root AGENTS.md",
      description: "Start with one shared Codex policy file for the whole repo.",
      path: rootAgentsPath,
      content: instructionStarterTemplate({ cli: "codex", scope: "repo", name: "AGENTS.md" }),
      pluginId: null,
      done: false,
    });
  }

  if (isMonorepo && !sharedSkillsExists) {
    actions.push({
      id: "create-shared-skill-library",
      kind: "create_directory",
      severity: "recommended",
      title: "Create shared .codex/skills library",
      description: "Keep reusable monorepo workflows in one repo-shared Codex skill library.",
      path: sharedSkillsPath,
      content: null,
      pluginId: null,
      done: false,
    });
  }

  for (const plugin of pluginRecommendations.filter((entry) => !entry.enabled)) {
    actions.push({
      id: `enable-plugin-${plugin.pluginId}`,
      kind: "enable_plugin",
      severity: "recommended",
      title: `Enable ${plugin.name}`,
      description: "Recommended for Codex setups in WorkOS.",
      path: null,
      content: null,
      pluginId: plugin.pluginId,
      done: false,
    });
  }

  if (rootAgentsExists) {
    for (const scope of structure.filter((entry) => entry.path !== "/" && entry.recommendation === "recommended").slice(0, 8)) {
      actions.push({
        id: `create-local-agents-${scope.path}`,
        kind: "create_file",
        severity: "recommended",
        title: `Create ${scope.path}/AGENTS.md`,
        description: "Use directory-scoped AGENTS.md when this part of the repo has different commands or constraints.",
        path: path.join(repoRoot, scope.path, "AGENTS.md"),
        content: scopedInstructionStarterTemplate({ cli: "codex", relativePath: scope.path }),
        pluginId: null,
        done: false,
      });
    }
  }

  const validations = [];
  if (!rootAgentsExists) validations.push("Root AGENTS.md is missing, so Codex lacks one shared repo policy layer.");
  if (isMonorepo && !sharedSkillsExists) validations.push("This repo looks like a monorepo. Prefer one shared `/.codex/skills` library before adding package-local skills.");
  if (pluginRecommendations.some((plugin) => !plugin.enabled)) {
    validations.push(`Recommended plugins still need setup: ${pluginRecommendations.filter((plugin) => !plugin.enabled).map((plugin) => plugin.name).join(", ")}.`);
  }
  if (nestedCodexDirCount > 1) {
    validations.push("Multiple `.codex` directories were detected. Prefer one shared root `.codex` and use nested `AGENTS.md` files for local variance.");
  }
  if (codexOnlyExternalArtifacts.length > 0) {
    validations.push("Claude or Gemini local artifacts were detected in this repo. Codex will not automatically consume `.claude/*` or `.gemini/*` without an explicit bridge.");
  }
  if (rootAgentsExists && isMonorepo && nestedInstructions.length === 0 && packageScopes.length > 1) {
    validations.push("No directory-scoped AGENTS.md files were found yet. Add them only where package-specific commands or constraints truly diverge.");
  }

  const requiredActions = actions.filter((action) => action.severity === "required" && !action.done).length;
  const recommendedActions = actions.filter((action) => action.severity === "recommended" && !action.done).length;
  const optionalActions = actions.filter((action) => action.severity === "optional" && !action.done).length;
  const readinessScore = Math.max(0, 100 - (requiredActions * 35) - (recommendedActions * 10) - (optionalActions * 4) - (nestedCodexDirCount > 1 ? 6 : 0));
  const status = requiredActions > 0 || recommendedActions > 0
    ? "needs_setup"
    : nestedCodexDirCount > 1 || codexOnlyExternalArtifacts.length > 0
      ? "advanced"
      : "ready";

  return {
    cli: "codex",
    rootPath: repoRoot,
    workspacePath: workspaceRoot,
    status,
    readinessScore,
    isMonorepo,
    rootAgentsPath,
    rootAgentsExists,
    sharedSkillsPath,
    sharedSkillsExists,
    sharedRulesPath,
    sharedRulesExists,
    nestedCodexDirCount,
    structure,
    pluginRecommendations,
    actions,
    validations,
    summary: {
      requiredActions,
      recommendedActions,
      optionalActions,
      localScopeCount: structure.filter((entry) => entry.path !== "/").length,
      pluginReadyCount: pluginRecommendations.filter((plugin) => plugin.enabled).length,
      pluginRecommendedCount: pluginRecommendations.length,
    },
  };
}

function getSkillStudioTargets({ cli = "codex", workspacePath = null, projectPath = null }) {
  const normalizedCli = SUPPORTED_CLIS.includes(cli) ? cli : "codex";
  const workspaceRoot = normalizePath(workspacePath);
  const repoRoot = normalizePath(projectPath);
  const targets = [
    {
      scope: "global",
      label: "Global",
      description: "Personal reusable skills shared across repos.",
      rootPath: skillRootPathFor(normalizedCli, "global", workspaceRoot, repoRoot),
      available: true,
      recommended: !repoRoot && !workspaceRoot,
    },
    {
      scope: "workspace",
      label: "Workspace",
      description: "Org or workspace skills shared by repos under the current workspace.",
      rootPath: skillRootPathFor(normalizedCli, "workspace", workspaceRoot, repoRoot),
      available: Boolean(workspaceRoot),
      recommended: Boolean(workspaceRoot) && !repoRoot,
    },
    {
      scope: "repo",
      label: "Repo",
      description: "Repo-local skills for workflows that belong with this codebase.",
      rootPath: skillRootPathFor(normalizedCli, "repo", workspaceRoot, repoRoot),
      available: Boolean(repoRoot),
      recommended: Boolean(repoRoot),
    },
  ];

  return { cli: normalizedCli, targets };
}

function sanitizeScriptPath(scriptPath) {
  const normalized = (scriptPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith("scripts/")) throw new Error("Scripts must live under scripts/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error("Invalid script path");
  return parts.join("/");
}

function readSkillPackage(filePath, { cli = "codex", workspacePath = null, projectPath = null } = {}) {
  const normalized = normalizePath(filePath);
  if (!normalized) throw new Error("Missing skill path");
  if (!isManagedSkillFile(normalized)) throw new Error("Skill is not editable from WorkOS");

  const skillDir = path.dirname(normalized);
  const scriptsDir = path.join(skillDir, "scripts");
  const scripts = scanTreeForFiles(scriptsDir, {
    matcher: (_fullPath, name) => !name.startsWith("."),
    maxDepth: 5,
  }).map((scriptFilePath) => ({
    path: path.relative(skillDir, scriptFilePath).replace(/\\/g, "/"),
    content: safeRead(scriptFilePath) || "",
  }));

  return {
    cli,
    scope: scopeFromSkillPath(cli, normalized, workspacePath, projectPath),
    rootPath: skillRootPathFor(cli, scopeFromSkillPath(cli, normalized, workspacePath, projectPath), workspacePath, projectPath) || path.dirname(skillDir),
    skillDir,
    skillFilePath: normalized,
    skillName: path.basename(skillDir),
    skillMd: safeRead(normalized) || "",
    scripts,
  };
}

function saveSkillPackage({
  cli = "codex",
  scope = "repo",
  workspacePath = null,
  projectPath = null,
  skillName,
  skillMd,
  scripts = [],
  skillFilePath = null,
}) {
  const normalizedCli = SUPPORTED_CLIS.includes(cli) ? cli : "codex";
  const repoRoot = normalizePath(projectPath);
  const workspaceRoot = normalizePath(workspacePath);
  const normalizedName = (skillName || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalizedName) throw new Error("Skill name is required");

  let skillDir = null;
  let finalScope = scope;

  if (skillFilePath) {
    const normalizedFilePath = normalizePath(skillFilePath);
    if (!normalizedFilePath || path.basename(normalizedFilePath) !== "SKILL.md") throw new Error("Invalid skill file path");
    const existingDir = path.dirname(normalizedFilePath);
    if (!isManagedSkillFile(path.join(existingDir, "SKILL.md")) && fs.existsSync(normalizedFilePath)) {
      throw new Error("Skill is not editable from WorkOS");
    }
    skillDir = existingDir;
    finalScope = scopeFromSkillPath(normalizedCli, normalizedFilePath, workspaceRoot, repoRoot);
  } else {
    const rootPath = skillRootPathFor(normalizedCli, scope, workspaceRoot, repoRoot);
    if (!rootPath) throw new Error("Selected skill scope is not available");
    skillDir = path.join(rootPath, normalizedName);
    finalScope = scope;
  }

  if (!isWritableManagedPath(skillDir)) throw new Error("Skill location is not editable from WorkOS");

  const normalizedScripts = scripts.map((script) => ({
    path: sanitizeScriptPath(script.path),
    content: script.content || "",
  }));

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd || "", "utf8");

  const scriptsDir = path.join(skillDir, "scripts");
  fs.rmSync(scriptsDir, { recursive: true, force: true });
  if (normalizedScripts.length > 0) {
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const script of normalizedScripts) {
      const targetPath = path.join(skillDir, script.path);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, script.content, "utf8");
    }
  }

  return readSkillPackage(path.join(skillDir, "SKILL.md"), {
    cli: normalizedCli,
    workspacePath: workspaceRoot,
    projectPath: repoRoot,
    scope: finalScope,
  });
}

function readArtifactFile(filePath) {
  if (!filePath) return { path: null, exists: false, editable: false, content: "" };
  const normalized = path.resolve(filePath);
  return {
    path: normalized,
    exists: fs.existsSync(normalized),
    editable: isEditablePath(normalized),
    content: safeRead(normalized) || "",
  };
}

function saveArtifactFile(filePath, content) {
  if (!filePath) throw new Error("Missing file path");
  const normalized = path.resolve(filePath);
  if (!isEditablePath(normalized)) throw new Error("File is not editable from WorkOS");
  fs.mkdirSync(path.dirname(normalized), { recursive: true });
  fs.writeFileSync(normalized, content, "utf8");
  return readArtifactFile(normalized);
}

function createArtifactDirectory(dirPath) {
  if (!dirPath) throw new Error("Missing directory path");
  const normalized = path.resolve(dirPath);
  if (!isWritableManagedPath(normalized)) throw new Error("Directory is not editable from WorkOS");
  fs.mkdirSync(normalized, { recursive: true });
  return { path: normalized, exists: fs.existsSync(normalized) };
}

function deleteSkillArtifact(filePath) {
  if (!filePath) throw new Error("Missing skill path");
  const normalized = path.resolve(filePath);
  if (!isManagedSkillFile(normalized)) throw new Error("Skill is not deletable from WorkOS");
  const skillDir = path.dirname(normalized);
  fs.rmSync(skillDir, { recursive: true, force: true });
  return { path: skillDir, deleted: !fs.existsSync(skillDir) };
}

function setPluginEnabled(pluginId, enabled) {
  if (!pluginId) throw new Error("Missing plugin id");
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  const current = safeRead(configPath) || "";
  const next = upsertSectionBoolean(current, `plugins."${pluginId}"`, "enabled", enabled);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, next, "utf8");
  return readArtifactFile(configPath);
}

module.exports = {
  getAgentContext,
  getRepoCodexSetup,
  getSkillStudioTargets,
  readSkillPackage,
  saveSkillPackage,
  readArtifactFile,
  saveArtifactFile,
  createArtifactDirectory,
  deleteSkillArtifact,
  setPluginEnabled,
};
