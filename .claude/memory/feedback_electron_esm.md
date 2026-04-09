---
name: Electron launch requirements
description: ELECTRON_RUN_AS_NODE=1 breaks Electron — must unset in scripts. Also use CJS for main/preload.
type: feedback
---

**Critical: `ELECTRON_RUN_AS_NODE=1`** is set by Claude Code / VS Code terminal. This tells Electron to act as plain Node.js, disabling all Electron APIs (`require("electron")` returns undefined). All scripts that launch Electron must explicitly unset it: `ELECTRON_RUN_AS_NODE= electron ...`

**Why:** Spent hours debugging what appeared to be ESM/CJS/Node 22 incompatibility — was actually this one env var the whole time.

**How to apply:**
- In package.json scripts: `"dev": "... ELECTRON_RUN_AS_NODE= electron desktop/main.js"`
- Use CJS (`require`/`module.exports`) for all `desktop/` files — preload MUST be CJS regardless
- Name the directory `desktop/` not `electron/` to avoid shadowing the built-in module
- Don't add `"type": "module"` to package.json
