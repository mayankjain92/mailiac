# Backend PRD & Team Execution Plan

## AI-Powered Email Forensics & Threat Intelligence Platform

**Team:** Mayank (Fullstack – MERN) · Praneet (Fullstack – MERN) · Vivek (Backend – Spring Boot, cross-trained on MERN-style logic) · Harshita (Frontend – Next.js / Tailwind)
**Timeline:** 10-day prototype sprint
**Tooling:** Antigravity coding agents (per-module task cards) · Git (monorepo, Turborepo)

---

## 1. Purpose of This Document

The master platform PRD defines _what_ the system does (9-step forensic pipeline, 4-Pillar Risk Scoring Engine, async architecture). This document defines _who builds what and how_, so that four developers can work **in parallel with minimal blocking**, using AI coding agents against clearly scoped, contract-first task cards.

The core idea: every pipeline stage is written as a **pure function against a shared TypeScript contract** (the Message Data Model, or MDM). As long as everyone agrees on the contract on Day 1, each person can build and unit-test their stage in isolation — using fixture data and stubs — without waiting on anyone else's code. Integration only requires wiring functions together, not rewriting them.

---

## 2. Team & Track Mapping

| Developer | Primary Stack | Track | Track Theme |
| --- | --- | --- | --- |
| **Mayank** | MERN (express/Node, MongoDB) | **Track A — Platform & Delivery** | Ingestion, queueing, persistence, notifications, reporting |
| **Praneet** | MERN (Node, React) | **Track B — Enrichment Layer** | MIME parsing, HTML de-cloaking, GeoIP, AI intent extraction |
| **Vivek** | Spring Boot + adaptable to TS/Node | **Track C — Verification & Scoring Engine** | Crypto auth, reverse-hop trust chain, identity/typosquat detection, risk aggregation, webhook signing |
| **Harshita** | Next.js (App Router), Tailwind, shadcn/ui | **Track D — Frontend Application** | Mock data fixture (`mock-data.ts`), `lib/api.ts` abstraction, 3 pages (`/upload`, `/status/[jobId]`, `/report/[jobId]`), recharts breakdown & Leaflet hop map |

**Why this split:** Vivek's background is service-layer/algorithmic logic (Spring Boot is exactly this kind of work), so Track C isolates the deterministic, math-and-rules-heavy pillars — the parts least tied to Express/Fastify idioms and most transferable regardless of language familiarity. Mayank and Praneet, both MERN-native, split the two halves of the Node-specific work: Mayank owns the request/queue/DB "plumbing," Praneet owns the "data gathering" stages that call external libraries/APIs. Harshita owns Track D (Frontend), building all UI components against a single abstraction (`src/lib/api.ts`) and mock fixture so frontend development runs completely in parallel with zero backend dependencies until Day 9 integration.

Each track produces **independently testable modules** and touches its own package folder, so PRs rarely conflict.

---

## 3. Confirmed Backend Stack (Prototype Scope)

Reconciling the two stack tables in the master PRD, for a 10-day build we optimize for speed over production-hardening:

| Layer         | Choice                                    | Note                                                                                                        |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API Framework | **Express.js + TypeScript**               | Team already knows Express well; multipart uploads handled via `multer` with a hard 20MB size limit         |
| Queue         | **BullMQ + ioredis (Redis)**              | Decouples upload from heavy processing                                                                      |
| Database      | **MongoDB Atlas + Mongoose**              | Matches the schema already defined in the master PRD                                                        |
| MIME Parsing  | **postal-mime**                           | Typed EML → JSON, plus attachment SHA-256                                                                   |
| Crypto Auth   | **mailauth**                              | SPF/DKIM/DMARC/ARC in one call                                                                              |
| Fuzzy Match   | **damerau-levenshtein + tldts**           | Typosquat / homoglyph detection                                                                             |
| DOM Cleaning  | **cheerio**                               | Glassworm de-cloaking                                                                                       |
| GeoIP         | **Free HTTP API (ip-api.com / ipapi.co)** | MaxMind `.mmdb` is optional/post-prototype (needs binary DB provisioning we don't have time for in 10 days) |
| IP Reputation | **AbuseIPDB API**                         | Pillar 3                                                                                                    |
| AI/NLP        | **@google/genai (Gemini)**                | Structured JSON intent classification                                                                       |
| Reporting     | **@react-pdf/renderer**                   | Forensic PDF export                                                                                         |
| Realtime      | **WebSocket or SSE**                      | Job status push to frontend                                                                                 |

Cold storage (S3/MinIO for raw `.eml` blobs) is marked **post-prototype** — for the 10-day build, raw EML lives in the transient buffer with the existing `expireAt` TTL index, which is already sufficient for demo purposes.

---

## 4. Monorepo Structure

```
mailiac/
├── apps/
│   ├── api/            # Express gateway            → Mayank
│   └── worker/         # BullMQ consumer/orchestrator → Mayank (shell) + all (stages)
├── packages/
│   ├── shared-types/    # MDM + all pillar interfaces → shared contract, agreed Day 1
│   ├── db/               # Mongoose models/schema     → Mayank
│   ├── parsing/
│   │   ├── mime/         # postal-mime + hashing       → Praneet
│   │   ├── decloak/       # cheerio Glassworm defense   → Praneet
│   │   ├── geoip/         # IP → location enrichment    → Praneet
│   │   └── ai-intent/     # Gemini intent extraction    → Praneet
│   ├── scoring/
│   │   ├── reverse-hop/   # Evidence Boundary trace     → Vivek
│   │   ├── auth/          # mailauth wrapper             → Vivek
│   │   ├── identity/      # Levenshtein/Jaro-Winkler/homoglyph → Vivek
│   │   ├── ip-reputation/ # AbuseIPDB + proxy/VPN + tz check  → Vivek
│   │   └── risk-engine/   # 4-Pillar aggregation formula  → Vivek
│   ├── webhooks/         # HMAC signing + dispatch       → Vivek
│   └── reporting/pdf/    # PDF forensic report            → Mayank
└── turbo.json
```

---

## 5. The Shared Contract: Message Data Model (MDM)

This is the single most important artifact of Day 1. Everyone codes against these interfaces; nobody needs to see anyone else's implementation to start.

```typescript
// packages/shared-types/src/index.ts

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

// Output of Step 3 (Praneet)
export interface MDM {
  messageId: string;
  rawHeaders: Record<string, string[]>;
  from: { name?: string; address: string };
  replyTo?: string;
  subject: string;
  date: string; // ISO 8601
  bodyText: string;
  bodyHtmlRaw: string;
  bodyHtmlCleaned?: string; // filled after Step 7
  attachments: ParsedAttachment[];
  receivedHeadersRaw: string[]; // ordered top → bottom, as received
}

// Output of Step 4 (Vivek)
export interface ForensicHop {
  ip: string;
  hostnameClaimed?: string;
  ptrValid: boolean;
  isPrivate: boolean;
  city?: string;
  country?: string;
  coordinates?: [number, number];
  asn?: string;
  trusted: boolean;
}
export interface ReverseHopResult {
  evidenceBoundaryIndex: number;
  path: ForensicHop[];
  originatingSenderIp: string | null;
  injectionDetected: boolean;
}

// Output of Step 5 (Vivek)
export interface AuthResult {
  spf: 'pass' | 'fail' | 'neutral' | 'none';
  dkim: 'pass' | 'fail' | 'none';
  dmarcAlignment: 'strict' | 'relaxed' | 'fail';
  arcPass: boolean;
  authScore: number; // 0-100
}

// Identity pillar (Vivek)
export interface IdentityResult {
  levenshteinDistance: number;
  damerauLevenshteinDistance: number;
  jaroWinklerScore: number;
  homoglyphMatch: boolean;
  matchedProtectedDomain?: string;
  identityScore: number; // 0-100
}

// IP/Infra pillar (Vivek, consumes Praneet's GeoIP output)
export interface IPReputationResult {
  abuseConfidenceScore: number;
  isProxyOrVpn: boolean;
  timezoneDiscrepancyHours: number;
  ipScore: number; // 0-100
}

// NLP pillar (Praneet)
export interface NLPResult {
  intentLabels: string[]; // e.g. ["FINANCIAL_COERCION"]
  financialRequestScore: number;
  credentialHarvestingScore: number;
  glasswormFlag: boolean;
  zeroWidthCharCount: number;
  nlpScore: number; // 0-100
}

// Final aggregation (Vivek)
export interface RiskMatrix {
  authScore: number;
  identityScore: number;
  ipScore: number;
  nlpScore: number;
  finalScore: number; // (auth*0.3)+(identity*0.2)+(ip*0.2)+(nlp*0.3)
}

// Persisted document (Mayank, matches Mongoose schema)
export interface AnalysisReport {
  messageId: string;
  senderDomain: string;
  timestamp: string;
  forensicPath: ForensicHop[];
  authResults: AuthResult;
  riskMatrix: RiskMatrix;
  aiSummary: {
    urgency: number;
    intent: string[];
    integrityHash: string;
  };
}
```

**Rule for Day 1:** this file is written and merged to `develop` _before_ anyone starts their module. Any change to it afterward requires a quick sync message to the other two devs, since it's the thing every module imports.

---

## 6. Module → Owner → Dependency Map

| Pipeline Step | Module                | Package                      | Owner   | Consumes                               | Produces                                 |
| ------------- | --------------------- | ---------------------------- | ------- | -------------------------------------- | ---------------------------------------- |
| 1–2           | Ingestion + Job Queue | `apps/api`, `apps/worker`    | Mayank  | multipart upload                       | `jobId`, queued BullMQ job               |
| 3             | MIME Deconstruction   | `parsing/mime`               | Praneet | raw EML buffer                         | `MDM` (partial)                          |
| 4             | Reverse-Hop Trace     | `scoring/reverse-hop`        | Vivek   | `MDM.receivedHeadersRaw`               | `ReverseHopResult`                       |
| 5             | Crypto Auth           | `scoring/auth`               | Vivek   | raw EML + headers                      | `AuthResult`                             |
| 6             | GeoIP/ASN Enrichment  | `parsing/geoip`              | Praneet | `ForensicHop[].ip`                     | enriched `ForensicHop[]`                 |
| 7             | HTML De-cloak         | `parsing/decloak`            | Praneet | `MDM.bodyHtmlRaw`                      | `bodyHtmlCleaned` + `zeroWidthCharCount` |
| 8             | AI Intent Scoring     | `parsing/ai-intent`          | Praneet | cleaned body text                      | `NLPResult`                              |
| —             | Identity/Typosquat    | `scoring/identity`           | Vivek   | `MDM.from.address`, sender domain      | `IdentityResult`                         |
| —             | IP Reputation         | `scoring/ip-reputation`      | Vivek   | `ReverseHopResult.originatingSenderIp` | `IPReputationResult`                     |
| —             | 4-Pillar Aggregation  | `scoring/risk-engine`        | Vivek   | Auth + Identity + IP + NLP results     | `RiskMatrix`                             |
| 9             | Persistence + Notify  | `apps/worker`, `packages/db` | Mayank  | full `AnalysisReport`                  | Mongo write + WS/SSE event               |
| —             | Webhook Signing       | `packages/webhooks`          | Vivek   | outbound payload                       | HMAC-signed request                      |
| —             | PDF Report            | `reporting/pdf`              | Mayank  | `AnalysisReport`                       | PDF buffer/download                      |

Only two real dependencies exist across tracks: **Vivek's `ip-reputation` needs the `originatingSenderIp` that Vivek's own `reverse-hop` module produces** (same track, no blocking), and **`risk-engine` needs outputs from all pillars** — which is why it's built last on Vivek's track, using stubbed/fixture pillar outputs until Day 8 integration.

---

## 7. Track A — Mayank: Platform & Delivery

**Owns:** `apps/api`, `apps/worker` (orchestrator shell), `packages/db`, `packages/reporting/pdf`

| Deliverable                 | Detail                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/upload`          | Express + `multer` (memory or disk storage), hard 20MB limit via `limits: { fileSize: 20 * 1024 * 1024 }`, generates `messageId` (UUID), writes EML to transient buffer, enqueues BullMQ job → `202 Accepted { jobId }`                     |
| `GET /api/jobs/:id`         | Returns `queued \| processing \| completed \| failed`                                                                                                                                                                                       |
| `GET /api/reports/:id`      | Returns completed `AnalysisReport` JSON                                                                                                                                                                                                     |
| Worker orchestrator         | BullMQ consumer that calls each pipeline stage function **in sequence**, passing the MDM/result objects along — this is the "glue" that stitches Tracks B and C together, so it's built last (Day 6+) once individual stage functions exist |
| Mongoose schema + TTL index | Exactly as specified in the master PRD (`expireAt` 24h TTL on the transient buffer)                                                                                                                                                         |
| WebSocket/SSE notification  | Pushes job status changes to the frontend                                                                                                                                                                                                   |
| PDF report generation       | `@react-pdf/renderer`, includes SHA-256 attachment hashes for legal-grade integrity                                                                                                                                                         |

### 7.1 Queue Concepts Primer (BullMQ in Plain Terms)

Since the team's queueing knowledge is high-level, here's the minimum mental model actually needed — nothing more:

- **Queue** = a named list in Redis holding pending work items ("jobs"). You create one instance to _add_ jobs: `new Queue('email-forensics', { connection })`.
- **Job** = one unit of work — in our case, "analyze this uploaded EML." When the Express route receives an upload, it does **not** process the email itself. It just calls `queue.add(...)` and immediately responds `202 Accepted`. That's the entire "producer" side — a few lines inside a route handler.
- **Worker** = a _separate_ listener process that pulls jobs off the queue and does the real work: `new Worker('email-forensics', async (job) => { ... }, { connection })`. This is where the 9-step pipeline actually runs — it's `apps/worker`.
- **Job states**, used for `GET /api/jobs/:id`: `waiting → active → completed` on the happy path, or `failed` if the worker throws. BullMQ tracks this automatically via `job.getState()` — you don't build a state machine yourself.
- **Retries** are opt-in per job (`{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`) — useful for the flaky external calls (DNS PTR, GeoIP, AbuseIPDB) but not something anyone needs to hand-roll.

The whole model in one sentence: **the Express route is the producer (adds jobs), one Worker file is the consumer (processes jobs)** — nobody needs to understand Redis internals beyond that.

Minimal shape, for reference:

```typescript
// apps/api — producer side, inside the Express route handler
import { Queue } from 'bullmq';
const emailQueue = new Queue('email-forensics', { connection: redisConnection });

app.post('/api/upload', upload.single('eml'), async (req, res) => {
  const messageId = randomUUID();
  await emailQueue.add('analyze-email', { messageId, filePath: req.file.path });
  res.status(202).json({ jobId: messageId });
});
```

```typescript
// apps/worker — consumer side, separate entry point
import { Worker } from 'bullmq';

new Worker(
  'email-forensics',
  async (job) => {
    const { messageId, filePath } = job.data;
    // call each pipeline stage in sequence here (Praneet's + Vivek's modules)
  },
  { connection: redisConnection }
);
```

**Practical suggestion:** before wiring in any real pipeline logic, spend an hour on Day 1–2 building the smallest possible version of this — a producer that adds a dummy job and a worker that logs it and marks it complete. Once that "hello world" round-trip works, the rest is just swapping the dummy logic for real module calls. Queue mechanics stay isolated to `apps/api` and `apps/worker`; Praneet's and Vivek's modules never need to know BullMQ exists — they just receive plain objects and return plain objects.

---

## 8. Track B — Praneet: Enrichment Layer

**Owns:** `packages/parsing/*`

| Deliverable          | Detail                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIME Deconstruction  | `postal-mime` → produces `MDM`; computes SHA-256 per attachment                                                                                   |
| HTML De-cloaking     | `cheerio` strips `display:none` / `opacity:0` / `font-size:0px`; counts zero-width spaces (U+200B) and soft hyphens (U+00AD); flags if count > 50 |
| GeoIP/ASN Enrichment | Free HTTP GeoIP API call per hop IP, returns city/country/coordinates/ASN — pure enrichment, no scoring judgment                                  |
| AI Intent Scoring    | `@google/genai` (Gemini) — prompt template that returns structured JSON: financial-request score, credential-harvesting score, intent labels      |

**Fixture strategy:** build and test each module against 3–4 sample `.eml` files (a clean email, a BEC-style phishing email, a spoofed-domain email, a legitimately forwarded mailing-list email) — no need to wait for Mayank's ingestion endpoint to exist.

---

## 9. Track C — Vivek: Verification & Scoring Engine

**Owns:** `packages/scoring/*`, `packages/webhooks`

| Deliverable          | Detail                                                                                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reverse-Hop Trace    | Deterministic algorithm: start at top-most trusted `Received:` header, iterate downward doing DNS PTR validation at each hop, filter RFC 1918 private ranges, stop at first PTR mismatch or private IP (Evidence Boundary), isolate first public IP below it as originating sender |
| Crypto Auth          | `mailauth` wrapper for SPF/DKIM/DMARC (strict vs relaxed alignment) + ARC seal check (`cv=pass` overrides a direct SPF/DKIM fail to 0, to avoid penalizing legitimate mailing-list forwards)                                                                                       |
| Identity Pillar      | `damerau-levenshtein` (distance ≤2 → 100 pts), Jaro-Winkler (≥0.85 → 100 pts, combosquatting), UTS #39 homoglyph skeleton mapping for IDN attacks                                                                                                                                  |
| IP Reputation Pillar | AbuseIPDB call (>80% → 100 pts), proxy/VPN/hosting-provider detection, `Date:` header timezone vs resolved IP location discrepancy (>4h → 50 pts)                                                                                                                                  |
| Risk Engine          | Implements the master formula: `finalScore = auth*0.30 + identity*0.20 + ip*0.20 + nlp*0.30`                                                                                                                                                                                       |
| Webhook Signing      | `HMAC-SHA256(signingSecret, timestamp + "." + payloadBody)`, attached as `X-Forensic-Signature` header for downstream Tines/Sublime dispatch                                                                                                                                       |

**Fixture strategy:** the reverse-hop and auth modules can be built and unit-tested against raw header strings/sample DNS responses without needing Praneet's parser — postal-mime's `receivedHeadersRaw` output is just an array of strings, easy to stub by hand on Day 1.

---

## 10. Integration Checkpoints

| Day | Checkpoint               | What must be true                                                                                                               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Contract Freeze**      | `shared-types` package merged to `develop`; everyone has scaffolded their package folder                                        |
| 5   | **Mid-sprint sync**      | Each track demos its module in isolation (unit tests green, run against fixture EMLs)                                           |
| 8   | **Pillar wiring**        | Vivek's `risk-engine` consumes real outputs from Auth/Identity/IP/NLP for the first time (not stubs)                            |
| 9   | **Full Integration Day** | Mayank's worker orchestrator calls the full chain end-to-end: upload → parse → trace → auth → enrich → score → persist → notify |
| 10  | **Demo hardening**       | Bug fixes, malformed-EML edge cases, PDF export polish                                                                          |

---

## 11. Git Workflow

- **Repo:** single monorepo (Turborepo + pnpm workspaces)
- **Branches:**
  - `main` — protected, always demo-able
  - `develop` — integration branch, all feature branches merge here first
  - `feat/<owner>/<module>` — e.g. `feat/vivek/reverse-hop-trace`, `feat/praneet/geoip-enrichment`, `feat/mayank/fastify-ingestion`
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`)
- **PRs:** every module PR requires 1 review from either of the other two devs; CI must pass (`turbo run lint typecheck test`) before merge; squash-merge into `develop`
- **Cadence:** merge to `develop` daily to avoid drift; merge `develop → main` only after each integration checkpoint (Day 5, Day 9)
- **CI:** GitHub Actions workflow running lint/typecheck/unit tests on every PR against `develop`

---

## 12. Working with Antigravity Agents

Since each module is a self-contained package against the shared contract, it's well-suited to being handed to an agent as a scoped task card rather than open-ended prompting. Each developer should write one task card per module before invoking their agent.

**Task card template:**

```
Module:        <name>
Owner:         <dev>
Package path:  packages/<...>
Goal:          <1-2 sentence description>
Depends on:    <which shared-types interfaces this imports>
Input type:    <TS interface>
Output type:   <TS interface>
Acceptance criteria:
  - <concrete, testable behavior 1>
  - <concrete, testable behavior 2>
  - <edge case handling>
Non-goals:     <explicitly out of scope, so the agent doesn't overreach>
Files to create: <list>
```

**Example — filled card for Vivek (Reverse-Hop Trace):**

```
Module:        Reverse-Hop Trace Algorithm
Owner:         Vivek
Package path:  packages/scoring/reverse-hop
Goal:          Walk MDM.receivedHeadersRaw top-to-bottom, validate each hop's
               PTR record, and isolate the true originating public IP,
               discarding everything below the first injection point.
Depends on:    MDM, ForensicHop, ReverseHopResult (from shared-types)
Input type:    string[] (receivedHeadersRaw, ordered top to bottom)
Output type:   ReverseHopResult
Acceptance criteria:
  - Correctly parses IP + claimed hostname out of a standard Received: header
  - Filters RFC 1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Performs DNS PTR lookup per hop with a timeout + graceful fallback
    (ptrValid: false on lookup failure, not a thrown error)
  - Stops trusting hops the moment a PTR mismatch or private IP appears
  - Returns originatingSenderIp = null if no public IP is found below
    the boundary, rather than throwing
Non-goals:     No GeoIP lookup here (that's Praneet's module) — this module
               only returns IP/hostname/trust booleans.
Files to create:
  - packages/scoring/reverse-hop/src/index.ts
  - packages/scoring/reverse-hop/src/dns-ptr.ts
  - packages/scoring/reverse-hop/test/reverse-hop.test.ts
  - packages/scoring/reverse-hop/test/fixtures/*.eml
```

**Example — filled card for Praneet (MIME Deconstruction):**

```
Module:        MIME Deconstruction & Hashing
Owner:         Praneet
Package path:  packages/parsing/mime
Goal:          Convert a raw EML buffer into the MDM object using postal-mime,
               and compute a SHA-256 hash for every attachment.
Depends on:    MDM, ParsedAttachment (from shared-types)
Input type:    Buffer (raw EML)
Output type:   MDM
Acceptance criteria:
  - Extracts from/replyTo/subject/date/body(text+html)/attachments correctly
    against postal-mime's parsed output
  - Preserves receivedHeadersRaw in original top-to-bottom order (critical:
    Vivek's module depends on ordering)
  - Computes SHA-256 for every attachment, including zero-byte attachments
  - Handles malformed/truncated EML without crashing the worker (throws a
    typed ParseError the orchestrator can catch)
Non-goals:     No HTML sanitization here (that's the decloak module).
Files to create:
  - packages/parsing/mime/src/index.ts
  - packages/parsing/mime/test/mime.test.ts
  - packages/parsing/mime/test/fixtures/*.eml
```

Use the same template for the remaining 9 modules — copy, fill, and hand to the agent per feature branch.

---

## 13. 10-Day Sprint Plan

| Day  | Mayank (Track A)                                                                                                                            | Praneet (Track B)                                                 | Vivek (Track C)                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1    | Turborepo scaffold, CI setup                                                                                                                | **Together:** agree & merge `shared-types` (MDM + all interfaces) |                                                                                                                 |
| 1–2  | Express ingestion (`/api/upload` + `multer`, 20MB limit); build the dummy producer/consumer round-trip first, then wire real upload → queue | MIME Deconstruction (`postal-mime`) + SHA-256 hashing             | Reverse-Hop Trace algorithm + PTR validation (against stub headers)                                             |
| 3–5  | Mongoose schema + TTL index, `/api/jobs/:id`, `/api/reports/:id`                                                                            | HTML de-cloak (cheerio, Glassworm threshold) + GeoIP enrichment   | Crypto Auth (`mailauth`: SPF/DKIM/DMARC/ARC) + Identity pillar (Levenshtein/Jaro-Winkler/homoglyph)             |
| 6–8  | WebSocket/SSE notifications, webhook dispatch endpoint                                                                                      | Gemini AI intent scoring integration                              | IP Reputation pillar (AbuseIPDB, proxy/VPN, tz check) + 4-Pillar Risk Engine aggregation + HMAC webhook signing |
| 9    | **Integration Day (all):** wire full pipeline in `apps/worker`, run sample EMLs end-to-end                                                  |                                                                   |                                                                                                                 |
| 9–10 | PDF report generation, API docs polish                                                                                                      | Edge-case fixes on parsing modules                                | Edge-case fixes on scoring modules, final risk-score validation                                                 |

---

## 14. Definition of Done & Testing

- Every pure module (`reverse-hop`, `identity`, `risk-engine`, `mime`, `decloak`) has unit tests against fixture `.eml` files:
  - `benign.eml` — clean, should score low
  - `bec-phishing.eml` — spoofed exec request, should score high on Auth + NLP
  - `spoofed-domain.eml` — typosquat, should trigger Identity pillar
  - `forwarded-mailing-list.eml` — ARC-valid relay, should **not** false-positive on Auth
- `apps/worker` has one integration test running a full EML through the real pipeline (mocking only external network calls: DNS PTR, GeoIP, AbuseIPDB, Gemini)
- PR checklist: lint clean, typecheck clean, tests green, reviewed by 1 teammate before merge to `develop`

---

## 15. Risks & Mitigations

| Risk                                                 | Mitigation                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gemini API quota/rate limits during demo             | Cache responses per fixture EML during dev; add a timeout + fallback NLP score of 0 rather than blocking the pipeline                                                                                                                |
| Free-tier GeoIP API rate limiting                    | Cache lookups per IP within a job; batch hop lookups                                                                                                                                                                                 |
| DNS PTR lookups slow/flaky                           | Hard timeout (e.g. 2s) per hop with `ptrValid: false` fallback, never block the worker                                                                                                                                               |
| `risk-engine` blocked waiting on real pillar outputs | Vivek builds it against typed stub objects from Day 1 — only needs to swap stubs for real calls on Day 8                                                                                                                             |
| Merge conflicts across tracks                        | Package-per-track folder structure means conflicts should be rare; `shared-types` is the only shared file, frozen after Day 1                                                                                                        |
| Team is new to BullMQ/queueing                       | Build the minimal producer/consumer "hello world" pair first (Section 7.1) before wiring real logic; queue mechanics stay confined to `apps/api`/`apps/worker`, so Praneet's and Vivek's modules never need to touch BullMQ directly |
| Malformed/malicious EML crashing the worker          | `apps/worker` wraps each stage call in try/catch, marks job `failed` with a reason instead of crashing the process                                                                                                                   |

---

## 16. Appendix: Environment Variables

```
MONGODB_URI=
REDIS_URL=
GEMINI_API_KEY=
ABUSEIPDB_API_KEY=
GEOIP_API_KEY=          # if using a paid tier of ip-api.com/ipapi.co
WEBHOOK_SIGNING_SECRET=
PORT=
NODE_ENV=
```

_(MaxMind license key intentionally omitted for the prototype — post-prototype only, per the stack decision in Section 3.)_
