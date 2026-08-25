---
description: Run all checks locally before opening a PR
---

// turbo

1. Run `pnpm turbo run lint`
   // turbo
2. Run `pnpm turbo run typecheck`
   // turbo
3. Run `pnpm turbo run test`
   // turbo
4. Run `pnpm turbo run build`
5. If anything fails, fix it and re-run only the failed step. Once everything passes,
   summarize the results.
