# 10-Day Checklist — Email Forensics Backend

Simple rule for every module, every time:
`/new-branch` → `/sync-contract` → `/implement-module` (paste task card) → `/pre-pr-check` → `/open-pr`

> **Scaffold status (2026-08-27):** The core backend modules are implemented and integrated into the `apps/worker` pipeline.
> AI intent scoring runs in parallel with enrichment tasks, and the Risk Engine uses a multi-pillar corroboration model.
> The integration checkpoint is complete for the backend pipeline.
> Each developer continues to refine their modules on their feature branches.

---

## Day 1 — Everyone together ✅ DONE

- [x] **All 4:** Scaffold the Turborepo monorepo
  - Workspace packages & apps, root config, Docker Compose, README, `.env.example`
  - `pnpm turbo run build typecheck` → 30/30 tasks, 0 errors
- [x] **All 4:** Freeze `packages/shared-types` — 11 typed interfaces, no logic
- [ ] **All 4:** Paste the Global Rules into Customizations → Rules → + Workspace
- [ ] **All 4:** Each paste your own individual track rules into your own agent session
- [x] **All 4:** Add the 7 workflows (`new-branch`, `sync-contract`, `implement-module`, `pre-pr-check`, `open-pr`, `integration-check`, `wire-real-api`)
- [x] **Mayank:** Wire the placeholder pipeline in `apps/worker` — all 11 stages are logged in order, every real function call is commented out

---

## Day 1–2 — Feature branches start here

### Mayank

- [x] `/new-branch` → `feat/mayank/express-ingestion`
- [x] `/implement-module` → Finish `POST /api/upload`
  - **Where:** `apps/api/src/routes/upload.ts`
  - **Scaffold already in place:** multer memoryStorage (20 MB), `randomUUID()`, `emailQueue.add()`, returns `202 { jobId }`
  - **What to add:** input validation (MIME-type check for `.eml`), error handling middleware
- [x] `/pre-pr-check` → `/open-pr`

### Praneet

- [x] `/new-branch` → `feat/praneet/mime-parse`
- [x] `/implement-module` → `parseEmlToMdm(rawEml: Buffer): Promise<MDM>`
  - **Where:** `packages/parsing/mime/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** postal-mime parsing, SHA-256 attachment hashing, populate all MDM fields
- [x] `/pre-pr-check` → `/open-pr`

### Vivek

- [x] `/new-branch` → `feat/vivek/reverse-hop`
- [x] `/implement-module` → `traceReverseHops(receivedHeadersRaw: string[]): Promise<ReverseHopResult>`
  - **Where:** `packages/scoring/reverse-hop/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** parse Received headers, PTR validation, detect injection, populate `ForensicHop[]`
- [x] `/pre-pr-check` → `/open-pr`

### Harshita (Track D — Frontend)

- [ ] `/new-branch` → `feat/harshita/scaffold-web`
- [ ] Implement scaffold prompt for `apps/web`:
  - **Stack:** Next.js 14 (App Router), Tailwind CSS + shadcn/ui, recharts, react-leaflet + leaflet, `@mailiac/shared-types`
  - **Mock Data Fixture:** create `apps/web/src/lib/mock-data.ts` exporting realistic `AnalysisReport` object
  - **API Abstraction Layer:** create `apps/web/src/lib/api.ts` with mock returns (simulated delay via `setTimeout`):
    - `uploadEml(file: File)`
    - `getJobStatus(jobId: string)`
    - `getReport(jobId: string)`
- [ ] `/pre-pr-check` → `/open-pr`

---

## Day 3–5

### Mayank

- [x] `/new-branch` → `feat/mayank/persistence`
- [x] `/implement-module` → Wire up database connection + persistence
  - **Where (db schema):** `packages/db/src/index.ts`
  - **Scaffold already in place:** `connectDb(uri)` helper, full `AnalysisReportModel` Mongoose schema with TTL (`expireAt`, `expires: '24h'`), indexes on `messageId` and `senderDomain`
  - **What to add:** call `connectDb(process.env.MONGODB_URI)` on `apps/api` startup
- [x] `/implement-module` → `GET /api/jobs/:id`
  - **Where:** `apps/api/src/routes/jobs.ts`
  - **Scaffold already in place:** BullMQ `getJob()` + state → `queued | processing | completed | failed` mapping
  - **What to add:** proper error handling, response typing
- [x] `/implement-module` → `GET /api/reports/:id`
  - **Where:** `apps/api/src/routes/reports.ts`
  - **Scaffold already in place:** `AnalysisReportModel.findOne({ messageId })`, 404 if missing
  - **What to add:** ensure `connectDb` is called before this runs, add response typing
- [x] `/pre-pr-check` → `/open-pr`

### Praneet

- [x] `/new-branch` → `feat/praneet/decloak-geoip`
- [x] `/implement-module` → `decloakHtml(rawHtml: string): { cleanedHtml, zeroWidthCharCount, glasswormFlag }`
  - **Where:** `packages/parsing/decloak/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** strip zero-width chars, detect Glassworm patterns, sanitise HTML
- [x] `/implement-module` → `enrichHopsWithGeo(hops: ForensicHop[]): Promise<ForensicHop[]>`
  - **Where:** `packages/parsing/geoip/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** HTTP call to GeoIP API (`GEOIP_API_KEY`), timeout + fallback, populate `city/country/coordinates/asn`
- [x] `/pre-pr-check` → `/open-pr`

### Vivek

- [x] `/new-branch` → `feat/vivek/auth-identity`
- [x] `/implement-module` → `verifyAuth(rawEml: Buffer): Promise<AuthResult>`
  - **Where:** `packages/scoring/auth/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** SPF/DKIM/DMARC/ARC parsing, compute `authScore`
- [x] `/implement-module` → `scoreIdentity(senderDomain: string, protectedDomains: string[]): IdentityResult`
  - **Where:** `packages/scoring/identity/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** Levenshtein, Damerau-Levenshtein, Jaro-Winkler, homoglyph detection, compute `identityScore`
- [x] `/pre-pr-check` → `/open-pr`

### Harshita (Track D — Frontend)

- [ ] `/new-branch` → `feat/harshita/upload-status-pages`
- [ ] `/implement-module` → Create `/upload` and `/status/[jobId]` pages:
  - **`/upload`:** Drag-and-drop / file-picker for `.eml`, calls `uploadEml()`, displays `jobId`, redirects to `/status/[jobId]`
  - **`/status/[jobId]`:** Polls `getJobStatus()` every 2s, state indicator (`queued`/`processing`/`completed`/`failed`), redirects to `/report/[jobId]` on completion
- [ ] `/pre-pr-check` → `/open-pr`

---

## Day 6–8

### Mayank

- [x] `/new-branch` → `feat/mayank/notify-webhook-endpoint`
- [x] `/implement-module` → WebSocket/SSE job notifications
  - **Where:** new file `apps/api/src/routes/notify.ts` (to be created)
- [x] `/pre-pr-check` → `/open-pr`

### Praneet

- [x] `/new-branch` → `feat/praneet/ai-intent`
- [x] `/implement-module` → `scoreIntent(cleanedBodyText: string): Promise<NLPResult>`
  - **Where:** `packages/parsing/ai-intent/src/index.ts`
  - **Status:** ✅ Implemented hybrid AI/Heuristic approach (Gemini 3.6-flash + local heuristics)
  - **What to implement:** Gemini API call (`GEMINI_API_KEY`), timeout + fallback, populate all `NLPResult` fields
- [x] `/pre-pr-check` → `/open-pr`

### Vivek

- [x] `/new-branch` → `feat/vivek/risk-engine-webhook`
- [x] `/implement-module` → `scoreIpReputation(ip: string, dateHeader: string): Promise<IPReputationResult>`
  - **Where:** `packages/scoring/ip-reputation/src/index.ts`
  - **Status:** ✅ Implemented AbuseIPDB call, proxy/VPN detection, timezone discrepancy
- [x] `/implement-module` → `aggregateRisk(auth, identity, ip, nlp): RiskMatrix`
  - **Where:** `packages/scoring/risk-engine/src/index.ts`
  - **Status:** ✅ Implemented evidence-based corroboration model for threat scoring
- [x] `/implement-module` → `signPayload(payload, signingSecret, timestamp): string`
  - **Where:** `packages/webhooks/src/index.ts`
  - **Status:** ✅ Implemented HMAC-SHA256 signature generation
- [x] `/pre-pr-check` → `/open-pr`

### Harshita (Track D — Frontend)

- [ ] `/new-branch` → `feat/harshita/report-page`
- [ ] `/implement-module` → Create `/report/[jobId]` page:
  - Risk score gauge (0-100, color-coded: green <40, yellow 40-70, red >70)
  - Bar chart (recharts) of 4 pillar scores (auth/identity/ip/nlp)
  - Table of forensic hop path (IP, city, country, trusted flag)
  - Leaflet map plotting hop coordinates
  - AI Summary section (urgency, intent labels)
- [ ] `/pre-pr-check` → `/open-pr`

---

## Day 9 — Integration Day (all together)

- [x] **All 4:** Make sure every PR from Days 1–8 is merged into `develop`
- [ ] **Harshita:** Run `/wire-real-api` → swap mock data returns in `src/lib/api.ts` for real `fetch()` calls to `NEXT_PUBLIC_API_URL` endpoints
- [x] **Mayank:** Uncomment and wire the real function calls in `apps/worker/src/index.ts`
  - ✅ All pipeline stages wired up with parallel execution phases for performance.
- [ ] **Mayank (or whoever's driving):** run `/integration-check`
- [ ] **All 4:** Upload the 4 test emails (clean, phishing, spoofed-domain, forwarded mailing-list) via the frontend (`/upload`) and verify end-to-end flow
- [ ] **All 4:** Fix anything broken, re-run `/integration-check` until clean

---

## Day 9–10 — Polish

### Mayank

- [x] `/implement-module` → `generateForensicPdf(report: AnalysisReport): Promise<Buffer>`
  - **Where:** `packages/reporting/pdf/src/index.ts`
  - **Status:** ✅ Implemented zero-dependency PDF 1.4 generator & added `GET /api/reports/:id/pdf` route in `apps/api`
- [ ] Tidy up API docs / OpenAPI spec

### Praneet

- [ ] Fix edge cases found during integration (parsing/enrichment side)

### Vivek

- [ ] Fix edge cases found during integration (scoring side)
- [ ] Double-check the final risk formula against real test emails

### Harshita

- [ ] UI polish & SOC analyst dark dashboard styling refinements
- [ ] Verify error states (failed job, missing report) rendering smoothly

- [ ] **All 4:** Final `develop → main` merge, demo run-through

---

## Scaffold Map — Quick Reference for Developers

> Note: Backend modules are fully implemented. Frontend tasks are pending.

| Package / App | Exported function / App scope | Owner | Status |
|---|---|---|---|
| `packages/shared-types` | 11 interfaces (frozen) | All | ✅ Done — do not modify |
| `packages/db` | `connectDb()`, `AnalysisReportModel` | Mayank | ✅ Implemented & Wired |
| `apps/api` | Express server, 3 routes, BullMQ queue | Mayank | ✅ Implemented & Merged |
| `apps/worker` | BullMQ Worker, 11-stage pipeline | Mayank | ✅ Implemented & Wired |
| `apps/web` | Next.js 14 UI, `lib/api.ts`, 3 pages | Harshita | 🔲 Scaffold prompt ready |
| `packages/parsing/mime` | `parseEmlToMdm` | Praneet | ✅ Implemented & Merged |
| `packages/parsing/decloak` | `decloakHtml` | Praneet | ✅ Implemented |
| `packages/parsing/geoip` | `enrichHopsWithGeo` | Praneet | ✅ Implemented |
| `packages/parsing/ai-intent` | `scoreIntent` | Praneet | ✅ Implemented |
| `packages/scoring/reverse-hop` | `traceReverseHops` | Vivek | ✅ Implemented & Merged |
| `packages/scoring/auth` | `verifyAuth` | Vivek | ✅ Implemented |
| `packages/scoring/identity` | `scoreIdentity` | Vivek | ✅ Implemented |
| `packages/scoring/ip-reputation` | `scoreIpReputation` | Vivek | ✅ Implemented |
| `packages/scoring/risk-engine` | `aggregateRisk` | Vivek | ✅ Implemented |
| `packages/webhooks` | `signPayload` | Vivek | ✅ Implemented |
| `packages/reporting/pdf` | `generateForensicPdf` | Mayank | ✅ Implemented & Tested |

