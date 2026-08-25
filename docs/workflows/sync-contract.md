---
description: Pull the latest shared-types contract before or during work on a module
---

// turbo

1. Run `git fetch origin`
   // turbo
2. Run `git checkout develop && git pull origin develop`
3. Diff `packages/shared-types/src/index.ts` against what my current module imports.
   If anything changed, report exactly what changed and STOP — do not silently adapt
   my code to a new interface without me confirming.
   // turbo
4. Run `pnpm install`
