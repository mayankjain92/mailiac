---
name: implement-module
description: Implement a mailiac package or app module end-to-end from a task card with strict TypeScript and vitest coverage. Use when asked to implement a module or when running /implement-module.
---

# Implement Module Workflow

Follow these steps to implement a module in `mailiac`:

1. **Verify Task Card**: Confirm package path, inputs, outputs, acceptance criteria, and non-goals.
2. **Review Existing Code**: Check `packages/<path>/src/` or `apps/<path>/src/` and any existing tests.
3. **Check Frozen Contract**: Inspect `packages/shared-types/src/index.ts`. Never modify shared-types without authorization.
4. **Implement**: Satisfy all acceptance criteria following global architecture rules.
5. **Add Tests**: Write vitest test suites covering happy paths, malicious inputs, and malformed edge cases.
6. **Typecheck**: `pnpm --filter <package-name> typecheck`
7. **Test**: `pnpm --filter <package-name> test`
8. **Summary**: Provide clear summary of changes, test coverage, and any TODOs.
