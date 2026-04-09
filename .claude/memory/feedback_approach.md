---
name: User prefers incremental testable work
description: User got frustrated with large untested implementations — wants YAGNI/KISS/DRY with clear checkpoints
type: feedback
---

User explicitly asked for YAGNI, KISS, DRY code that is extremely secure and testable in increments with clear checkpoints. The previous approach of implementing 19 tasks in parallel subagents produced code that didn't work (Electron black screen).

**Why:** User said "I don't like how things are happening right now" after the parallel implementation produced a non-functional app. 

**How to apply:** Build incrementally — get each piece working and verified before moving to the next. Test Electron launch at every checkpoint. Don't implement the full feature set before verifying the foundation works. Prefer fewer, working features over complete but broken ones.
