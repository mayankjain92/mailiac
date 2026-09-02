## Project

You are working inside `mailiac`, a Turborepo monorepo implementing a 9-step
asynchronous email forensics pipeline (EML upload / Gmail ingestion → MIME parse →
reverse-hop trace → crypto auth → GeoIP enrich → HTML de-cloak → AI intent scoring →
4-pillar risk score → persist + notify / PDF report).

## Non-negotiable architecture rules

1. Stack is fixed: Express (not Fastify), BullMQ + ioredis, Mongoose/MongoDB, TypeScript
   strict mode, pnpm workspaces, vitest, Next.js 14 (App Router). Do not swap any of
   these without being told to.
2. `packages/shared-types` is the frozen contract. NEVER add, rename, or change a field
   on any interface there without explicit instruction — every other package imports
   from it. If a task seems to need a new field, stop and flag it instead of changing
   the type silently.
3. BullMQ mechanics (Queue/Worker classes) are confined to `apps/api` and `apps/worker`.
   Everything under `packages/parsing/*` and `packages/scoring/*` must be plain,
   queue-agnostic functions: typed input in, typed output out (or a typed error thrown).
   No Redis/Mongo side effects from inside these packages.
4. Stay inside your assigned package(s) or app(s) unless explicitly asked to touch another.
   Do not "helpfully" refactor another developer's package.
5. This is a fast-paced prototype / SIH hackathon build. No cold storage (S3/MinIO), no
   unnecessary complex infra unless asked — build the cleanest, correct version of what's scoped.
6. Only import from `packages/shared-types` or designated package entrypoints (e.g. `@mailiac/db`).
   Never import directly from another sibling package's `src/` internals.

## Code conventions

- TypeScript strict mode, no `any` (use `unknown` + narrowing if genuinely unknown).
- Every package exports from `src/index.ts`.
- Errors: throw typed Error subclasses (e.g. `class ParseError extends Error {}`), never
  raw strings. Never let an error crash `apps/worker` — the orchestrator catches
  per-stage and marks the job `failed` with a reason.
- Any async I/O (DNS, HTTP calls to GeoIP/AbuseIPDB/Gemini/Google APIs) needs an explicit timeout and
  a defined fallback value on failure — one flaky call must never hang the pipeline.
- No `console.log` of full email bodies, attachments, or PII outside local dev scripts —
  treat sample data with production-level care.

## Testing

- Every exported function gets a `test/*.test.ts` file using vitest.
- Use realistic fixture data (sample `.eml` files, header arrays), not trivial inputs.
- Cover at minimum: happy path, one clearly-malicious input, one malformed/edge-case input.

## Git & Workflows

- Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`).
- One feature branch per module: `feat/<owner>/<module-name>`.
- Open a PR against `develop` and stop — do not merge into `develop`/`main` yourself.
- Follow the 5-step Antigravity workflow:
  `/new-branch` → `/sync-contract` → `/implement-module` → `/pre-pr-check` → `/open-pr`

## When something is ambiguous

Implement the smallest correct version and leave a `// TODO:` comment on the open
question, rather than guessing silently or expanding scope.

## Dependencies & tooling

- Use `pnpm` exclusively — never `npm install` or `yarn`. Do not commit a
  `package-lock.json` or `yarn.lock`.
- Do not add a new dependency without asking first and stating why. Prefer what's
  already in the stack over introducing alternatives.
- Do not edit root-level config (`turbo.json`, `tsconfig.base.json`, `.eslintrc`,
  `pnpm-workspace.yaml`, `docker-compose.yml`) without explicit instruction.

## Secrets

- Never hardcode API keys, OAuth secrets, or webhook signing secrets — always read from
  `process.env`. If a task needs a new environment variable, add a placeholder to
  `.env.example` and flag it.

---

## Developer Tracks & Ownership

### Track A: Mayank (Fullstack & Core Infrastructure)
- **Scope**: `apps/api`, `packages/db`, `packages/reporting/pdf`, Google OAuth & DB services, Next.js UI integration.
- **Key Modules**: API ingestion gateway (`POST /api/upload`), SSE job events, MongoDB persistence, PDF report generation (`GET /api/reports/:id/pdf`), Gmail OAuth routes & session management.

### Track B: Praneet (Parsing Engine)
- **Scope**: `packages/parsing/*`.
- **Key Modules**: MIME parsing (`packages/parsing/mime`), HTML de-cloaking (`packages/parsing/decloak`), GeoIP enrichment (`packages/parsing/geoip`), AI Intent scoring (`packages/parsing/ai-intent`).

### Track C: Vivek (Scoring & Analysis Engine)
- **Scope**: `packages/scoring/*`, `packages/webhooks`, `apps/worker`, Gmail client service.
- **Key Modules**: Reverse-hop trace (`packages/scoring/reverse-hop`), Cryptographic Auth (`packages/scoring/auth`), Identity scoring (`packages/scoring/identity`), IP Reputation (`packages/scoring/ip-reputation`), Risk Engine (`packages/scoring/risk-engine`), Webhook dispatcher (`packages/webhooks`), Gmail API client & RFC 822 decoder.

### Track D: Harshita (Frontend & Dashboard)
- **Scope**: `apps/web` only. Never touch `apps/api`, `apps/worker`, or `packages/`.
- **Key Modules**: Next.js 14 App Router, Stitch design system, Tailwind CSS + shadcn/ui components, `src/lib/api.ts` data layer, Forensic Analysis Console (`/analysis-console/[caseId]`, `/forensic-analysis`), Recharts 4-pillar breakdown, Leaflet hop map, Sender attribution badges.
- **Rules**: All data types come from `@mailiac/shared-types`. ALL data fetching goes through `src/lib/api.ts`.
