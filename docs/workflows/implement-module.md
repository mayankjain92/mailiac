---
description: Implement one stub module end-to-end from its task card, with tests
---

1. Ask me for the task card if not already provided in this conversation: package
   path, goal, input/output types, acceptance criteria, non-goals.
2. Read the current stub at `packages/<path>/src/index.ts` and its test file.
3. Read `packages/shared-types/src/index.ts` to confirm the exact types this module
   depends on. Never modify shared-types.
4. Implement the function to satisfy every acceptance criterion in the task card.
   Follow global rules and my individual track rules exactly — thresholds,
   formulas, and algorithm steps must match what's specified, not be approximated.
5. Replace the `describe.todo` placeholder with real tests: happy path, one
   malicious/edge-case fixture, one malformed input.
   // turbo
6. Run `pnpm --filter <package-name> typecheck`
   // turbo
7. Run `pnpm --filter <package-name> test`
8. Summarize what was implemented, any TODOs left, and flag anything ambiguous
   instead of having guessed at it.
