---
name: WorkOS Command Center project context
description: Standalone Electron app for machine setup, workspace management, and project bootstrapping
type: project
---

WorkOS Command Center is a standalone desktop app (not tied to any specific company) for:
1. Machine setup — ensure Homebrew + Git are installed and authenticated (onboarding wizard, same UX as Signos tools-gui first-run)
2. Multi-workspace management — one workspace per org, switch between them
3. Project management — SQLite DB tracking repos/projects per workspace, committable to GitHub for sharing across machines/teammates
4. Project bootstrapping — per-project config for local dev setup, open in IDE (VSCode/Cursor)
5. Process management — run and manage local dev processes

**Architecture decision (2026-04-08):** Node-only (no Python backend). Electron main process handles IPC, command execution, SQLite. React frontend with Tailwind 4. Use Bun as runtime/package manager. Strongly typed TypeScript throughout.

**Data model:** SQLite in `~/Library/Application Support/WorkOS/`. Export/import as JSON to a git repo for sharing across machines/teammates. Future: knowledge base per workspace/repo for ramping up and tooling.

**Design reference:** Signos tools-gui at `/Users/pierro/Documents/Development/signos/signos_cloud/tools-gui`
