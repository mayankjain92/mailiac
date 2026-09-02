---
description: Implement one stub module or feature card end-to-end with comprehensive tests
---

1. Ask me for the task card if not already provided in this conversation: package/app
   path, goal, input/output types, acceptance criteria, non-goals.
2. Read the current code / stub at `packages/<path>/src/` or `apps/<path>/src/` and its test file.
3. Read `packages/shared-types/src/index.ts` to confirm the exact types this module
   depends on. Never modify shared-types.
4. Implement the function/service/component to satisfy every acceptance criterion in the task card.
   Follow global rules and track rules exactly — thresholds, formulas, and algorithm steps
   must match what's specified, not be approximated.
5. Write complete unit/integration tests using vitest:
   - Happy path
   - Malicious / high-risk fixture or payload
   - Malformed / edge-case input
   // turbo
6. Run `pnpm --filter <package-or-app-name> typecheck`
   // turbo
7. Run `pnpm --filter <package-or-app-name> test`
8. Summarize what was implemented, any TODOs left, and flag anything ambiguous
   instead of having guessed at it.
