---
description: Pull latest develop and verify alignment with the frozen shared-types contract
---

// turbo

1. Run `git fetch origin`
   // turbo
2. Run `git checkout develop && git pull origin develop`
3. Diff `packages/shared-types/src/index.ts` against what your current module imports.
   If any field or interface changed, report exactly what changed and STOP — do not silently adapt code to a new interface without confirmation.
   // turbo
4. Run `pnpm install`
5. Report contract status and return to feature branch if needed.
