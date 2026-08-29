---
name: pre-pr-check
description: Run the complete monorepo quality and verification pipeline (lint, typecheck, unit tests, and production build) across all packages and apps in mailiac. Use before opening a PR or running /pre-pr-check.
---

# Pre-PR Check Workflow

Execute all monorepo checks locally before committing or opening a pull request:

```bash
# 1. Lint all packages and apps
pnpm turbo run lint

# 2. Typecheck with TypeScript strict mode
pnpm turbo run typecheck

# 3. Run all Vitest suites
pnpm turbo run test

# 4. Run Turborepo builds
pnpm turbo run build
```

If any step fails, isolate and fix the error, then re-verify only the failing package before re-running the full check.
