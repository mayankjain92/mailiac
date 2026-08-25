# 10-Day Checklist — Email Forensics Backend

Simple rule for every module, every time:
`/new-branch` → `/sync-contract` → `/implement-module` (paste task card) → `/pre-pr-check` → `/open-pr`

> **Scaffold status (2026-08-25):** The entire repo is scaffolded — folder structure, config files,
> package boilerplate, and typed stub functions are in place. `pnpm turbo run build typecheck`
> passes 30/30 tasks cleanly. **Zero business logic has been implemented yet.**
> Every parsing and scoring function throws `new Error('TODO: implement <name>')`.
> All stage calls inside `apps/worker` are commented out.
> Each developer now picks up their tasks below on their own feature branch.

---

## Day 1 — Everyone together ✅ DONE

- [x] **All 3:** Scaffold the Turborepo monorepo
  - 16 workspace packages, root config, Docker Compose, README, `.env.example`
  - `pnpm turbo run build typecheck` → 30/30 tasks, 0 errors
- [x] **All 3:** Freeze `packages/shared-types` — 11 typed interfaces, no logic
- [ ] **All 3:** Paste the Global Rules into Customizations → Rules → + Workspace
- [ ] **All 3:** Each paste your own individual track rules into your own agent session
- [x] **All 3:** Add the 6 workflows (`new-branch`, `sync-contract`, `implement-module`, `pre-pr-check`, `open-pr`, `integration-check`)
- [x] **Mayank:** Wire the placeholder pipeline in `apps/worker` — all 11 stages are logged in order, every real function call is commented out

---

## Day 1–2 — Feature branches start here

### Mayank

- [x] `/new-branch` → `feat/mayank/express-ingestion`
- [x] `/implement-module` → Finish `POST /api/upload`
  - **Where:** `apps/api/src/routes/upload.ts`
  - **Scaffold already in place:** multer memoryStorage (20 MB), `randomUUID()`, `emailQueue.add()`, returns `202 { jobId }`
  - **What to add:** input validation (MIME-type check for `.eml`), error handling middleware
- [ ] `/pre-pr-check` → `/open-pr`

### Praneet

- [ ] `/new-branch` → `feat/praneet/mime-parse`
- [ ] `/implement-module` → `parseEmlToMdm(rawEml: Buffer): Promise<MDM>`
  - **Where:** `packages/parsing/mime/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** postal-mime parsing, SHA-256 attachment hashing, populate all MDM fields
- [ ] `/pre-pr-check` → `/open-pr`

### Vivek

- [ ] `/new-branch` → `feat/vivek/reverse-hop`
- [ ] `/implement-module` → `traceReverseHops(receivedHeadersRaw: string[]): Promise<ReverseHopResult>`
  - **Where:** `packages/scoring/reverse-hop/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** parse Received headers, PTR validation, detect injection, populate `ForensicHop[]`
- [ ] `/pre-pr-check` → `/open-pr`

---

## Day 3–5

### Mayank

- [ ] `/new-branch` → `feat/mayank/persistence`
- [ ] `/implement-module` → Wire up database connection + persistence
  - **Where (db schema):** `packages/db/src/index.ts`
  - **Scaffold already in place:** `connectDb(uri)` helper, full `AnalysisReportModel` Mongoose schema with TTL (`expireAt`, `expires: '24h'`), indexes on `messageId` and `senderDomain`
  - **What to add:** call `connectDb(process.env.MONGODB_URI)` on `apps/api` startup
- [ ] `/implement-module` → `GET /api/jobs/:id`
  - **Where:** `apps/api/src/routes/jobs.ts`
  - **Scaffold already in place:** BullMQ `getJob()` + state → `queued | processing | completed | failed` mapping
  - **What to add:** proper error handling, response typing
- [ ] `/implement-module` → `GET /api/reports/:id`
  - **Where:** `apps/api/src/routes/reports.ts`
  - **Scaffold already in place:** `AnalysisReportModel.findOne({ messageId })`, 404 if missing
  - **What to add:** ensure `connectDb` is called before this runs, add response typing
- [ ] `/pre-pr-check` → `/open-pr`

### Praneet

- [ ] `/new-branch` → `feat/praneet/decloak-geoip`
- [ ] `/implement-module` → `decloakHtml(rawHtml: string): { cleanedHtml, zeroWidthCharCount, glasswormFlag }`
  - **Where:** `packages/parsing/decloak/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** strip zero-width chars, detect Glassworm patterns, sanitise HTML
- [ ] `/implement-module` → `enrichHopsWithGeo(hops: ForensicHop[]): Promise<ForensicHop[]>`
  - **Where:** `packages/parsing/geoip/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** HTTP call to GeoIP API (`GEOIP_API_KEY`), timeout + fallback, populate `city/country/coordinates/asn`
- [ ] `/pre-pr-check` → `/open-pr`

### Vivek

- [ ] `/new-branch` → `feat/vivek/auth-identity`
- [ ] `/implement-module` → `verifyAuth(rawEml: Buffer): Promise<AuthResult>`
  - **Where:** `packages/scoring/auth/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** SPF/DKIM/DMARC/ARC parsing, compute `authScore`
- [ ] `/implement-module` → `scoreIdentity(senderDomain: string, protectedDomains: string[]): IdentityResult`
  - **Where:** `packages/scoring/identity/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** Levenshtein, Damerau-Levenshtein, Jaro-Winkler, homoglyph detection, compute `identityScore`
- [ ] `/pre-pr-check` → `/open-pr`

---

## Day 6–8

### Mayank

- [ ] `/new-branch` → `feat/mayank/notify-webhook-endpoint`
- [ ] `/implement-module` → WebSocket/SSE job notifications
  - **Where:** new file `apps/api/src/routes/notify.ts` (to be created)
- [ ] `/pre-pr-check` → `/open-pr`

### Praneet

- [ ] `/new-branch` → `feat/praneet/ai-intent`
- [ ] `/implement-module` → `scoreIntent(cleanedBodyText: string): Promise<NLPResult>`
  - **Where:** `packages/parsing/ai-intent/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** Gemini API call (`GEMINI_API_KEY`), timeout + fallback, populate all `NLPResult` fields
- [ ] `/pre-pr-check` → `/open-pr`

### Vivek

- [ ] `/new-branch` → `feat/vivek/risk-engine-webhook`
- [ ] `/implement-module` → `scoreIpReputation(ip: string, dateHeader: string): Promise<IPReputationResult>`
  - **Where:** `packages/scoring/ip-reputation/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** AbuseIPDB call (`ABUSEIPDB_API_KEY`), proxy/VPN detection, timezone discrepancy
- [ ] `/implement-module` → `aggregateRisk(auth, identity, ip, nlp): RiskMatrix`
  - **Where:** `packages/scoring/risk-engine/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** 4-pillar weighted formula → `finalScore`
- [ ] `/implement-module` → `signPayload(payload, signingSecret, timestamp): string`
  - **Where:** `packages/webhooks/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** HMAC-SHA256 using `WEBHOOK_SIGNING_SECRET`
- [ ] `/pre-pr-check` → `/open-pr`

---

## Day 9 — Integration Day (all together)

- [ ] **All 3:** Make sure every PR from Days 1–8 is merged into `develop`
- [ ] **Mayank:** Uncomment and wire the real function calls in `apps/worker/src/index.ts`
  - All 11 stage calls are already in place as comments, in the correct order — just replace `console.info` with real awaited calls
- [ ] **Mayank (or whoever's driving):** run `/integration-check`
- [ ] **All 3:** Upload the 4 test emails (clean, phishing, spoofed-domain, forwarded mailing-list) and verify scores
- [ ] **All 3:** fix anything broken, re-run `/integration-check` until clean

---

## Day 9–10 — Polish

### Mayank

- [ ] `/implement-module` → `generateForensicPdf(report: AnalysisReport): Promise<Buffer>`
  - **Where:** `packages/reporting/pdf/src/index.ts`
  - **Scaffold:** typed signature, throws `TODO`
  - **What to implement:** PDF generation library (e.g. pdfkit), layout the forensic report
- [ ] Tidy up API docs / OpenAPI spec

### Praneet

- [ ] Fix edge cases found during integration (parsing/enrichment side)

### Vivek

- [ ] Fix edge cases found during integration (scoring side)
- [ ] Double-check the final risk formula against real test emails

- [ ] **All 3:** Final `develop → main` merge, demo run-through

---

## Scaffold Map — Quick Reference for Developers

> All functions below throw `new Error('TODO: implement <name>')` — zero logic is inside them yet.
> Each developer opens their branch, queries the assistant, and implements the real logic.

| Package | Exported function | Owner | Status |
|---|---|---|---|
| `packages/shared-types` | 11 interfaces (frozen) | All | ✅ Done — do not modify |
| `packages/db` | `connectDb()`, `AnalysisReportModel` | Mayank | ✅ Schema scaffolded — wire startup call |
| `apps/api` | Express server, 3 routes, BullMQ queue | Mayank | 🔲 Plumbing in place — implement logic |
| `apps/worker` | BullMQ Worker, 11-stage pipeline | Mayank | 🔲 Comments in place — uncomment on Day 9 |
| `packages/parsing/mime` | `parseEmlToMdm` | Praneet | 🔲 Stub only |
| `packages/parsing/decloak` | `decloakHtml` | Praneet | 🔲 Stub only |
| `packages/parsing/geoip` | `enrichHopsWithGeo` | Praneet | 🔲 Stub only |
| `packages/parsing/ai-intent` | `scoreIntent` | Praneet | 🔲 Stub only |
| `packages/scoring/reverse-hop` | `traceReverseHops` | Vivek | 🔲 Stub only |
| `packages/scoring/auth` | `verifyAuth` | Vivek | 🔲 Stub only |
| `packages/scoring/identity` | `scoreIdentity` | Vivek | 🔲 Stub only |
| `packages/scoring/ip-reputation` | `scoreIpReputation` | Vivek | 🔲 Stub only |
| `packages/scoring/risk-engine` | `aggregateRisk` | Vivek | 🔲 Stub only |
| `packages/webhooks` | `signPayload` | Vivek | 🔲 Stub only |
| `packages/reporting/pdf` | `generateForensicPdf` | Mayank | 🔲 Stub only |
