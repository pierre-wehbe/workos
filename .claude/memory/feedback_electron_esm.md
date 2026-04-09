---
name: Electron ESM incompatibility
description: Node 22 breaks require("electron") in ESM projects — use CJS for all Electron main/preload files
type: feedback
---

Never use ESM (`import`) in Electron main process or preload files. Node 22 + Electron has a known issue where `require("electron")` resolves to the npm package (binary path string) instead of the built-in Electron module. Also, naming the electron files directory `electron/` shadows the built-in module.

**Why:** Spent significant time debugging black screen caused by ESM imports in Electron files. The `"type": "module"` in package.json combined with `import { app } from "electron"` causes a crash.

**How to apply:** Always use CommonJS (`require`) for Electron main process and preload files. Use `.cjs` extension or remove `"type": "module"` from package.json. Never name the Electron files directory `electron/` — use `desktop/` or similar. Vite/React source files can still use ESM since they're bundled by Vite.
