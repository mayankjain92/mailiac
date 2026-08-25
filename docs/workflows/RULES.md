## Project

You are working inside `email-forensics`, a Turborepo monorepo implementing a 9-step
asynchronous email forensics pipeline (EML upload → MIME parse → reverse-hop trace →
crypto auth → GeoIP enrich → HTML de-cloak → AI intent scoring → 4-pillar risk score →
persist + notify).

## Non-negotiable architecture rules

1. Stack is fixed: Express (not Fastify), BullMQ + ioredis, Mongoose/MongoDB, TypeScript
   strict mode, pnpm workspaces, vitest. Do not swap any of these without being told to.
2. `packages/shared-types` is the frozen contract. NEVER add, rename, or change a field
   on any interface there without explicit instruction — every other package imports
   from it. If a task seems to need a new field, stop and flag it instead of changing
   the type silently.
3. BullMQ mechanics (Queue/Worker classes) are confined to `apps/api` and `apps/worker`.
   Everything under `packages/parsing/*` and `packages/scoring/*` must be plain,
   queue-agnostic functions: typed input in, typed output out (or a typed error thrown).
   No Redis/Mongo side effects from inside these packages.
4. Stay inside your assigned package(s) unless explicitly asked to touch another. Do not
   "helpfully" refactor another developer's package.
5. This is a 10-day prototype, not a production system. No cold storage (S3/MinIO), no
   auth/authz, no rate limiting unless asked — build the simplest correct version of
   what's scoped.

## Code conventions

- TypeScript strict mode, no `any` (use `unknown` + narrowing if genuinely unknown).
- Every package exports from `src/index.ts`.
- Errors: throw typed Error subclasses (e.g. `class ParseError extends Error {}`), never
  raw strings. Never let an error crash `apps/worker` — the orchestrator catches
  per-stage and marks the job `failed` with a reason.
- Any async I/O (DNS, HTTP calls to GeoIP/AbuseIPDB/Gemini) needs an explicit timeout and
  a defined fallback value on failure — one flaky call must never hang the pipeline.
- No `console.log` of full email bodies, attachments, or PII outside local dev scripts —
  treat sample data with production-level care.

## Testing

- Every exported function gets a `test/*.test.ts` file using vitest.
- Use realistic fixture data (sample `.eml` files, header arrays), not trivial inputs.
- Cover at minimum: happy path, one clearly-malicious input, one malformed/edge-case input.

## Git

- Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`).
- One feature branch per module: `feat/<owner>/<module-name>`.
- Open a PR and stop — do not merge into `develop`/`main` yourself.

## When something is ambiguous

Implement the smallest correct version and leave a `// TODO:` comment on the open
question, rather than guessing silently or expanding scope.

## Non-negotiable architecture rules

- Only import from `packages/shared-types` across package boundaries. Never import
  directly from another sibling package's internals — if you need something another
  package doesn't export, flag it instead of reaching into its src files.

## Dependencies & tooling

- Use `pnpm` exclusively — never `npm install` or `yarn`. Do not commit a
  `package-lock.json` or `yarn.lock`.
- Do not add a new dependency without asking first and stating why. Prefer what's
  already in the stack (the packages listed in the PRD) over introducing alternatives.
- Do not edit root-level config (`turbo.json`, `tsconfig.base.json`, `.eslintrc`,
  `pnpm-workspace.yaml`, `docker-compose.yml`) without explicit instruction — these
  are shared across all three developers' work.

## Diff hygiene

- Keep changes scoped to what the task asks for. Don't reformat, reorder imports, or
  "clean up" code outside the function(s) you were asked to implement.
- One logical change per commit — don't bundle an unrelated fix into a feature commit.

## Secrets

- Never hardcode API keys or the webhook signing secret — always read from
  `process.env`. If a task needs a new environment variable, add a placeholder to
  `.env.example` and say so, rather than inventing a default value silently.

---

# Track D (Harshita): Frontend

## Your app
`apps/web` only. Never touch `apps/api`, `apps/worker`, or `packages/`.

## Context
- All data types come from `@mailiac/shared-types` — import them,
  never redefine `AnalysisReport`/`RiskMatrix`/etc. locally.
- ALL data fetching goes through `src/lib/api.ts`. No component should ever
  call `fetch()` directly or import `mock-data.ts` directly — this is what makes
  the Day 9 swap to the real backend a one-file change instead of a rewrite.
- Build and test every screen against the mock fixture first. Don't wait for
  the real backend to be ready to build UI.
- Risk score color bands: green <40, yellow 40-70, red >70.

## Non-goals
No auth/login. No settings/admin pages. Just the 3 screens: upload, status,
report. If it's not one of those 3, it's out of scope for this sprint.

