# Gmail Integration Checklist — 2-Developer Parallel Execution Plan

**Feature:** On-Demand Gmail Forensic Ingestion  
**Team:** Mayank (Fullstack Track: OAuth, Database, Express Gateway & Next.js UI) · Vivek (Engine Track: Gmail API Client, Raw RFC 822 Extraction, BullMQ Bridge & Testing)  
**Methodology:** Parallel Antigravity AI Coding Agent Task Cards · Turborepo Monorepo · Strict PR Gates  

---

## 1. Quick Reference & Golden Rules

Every feature branch follows the strict Antigravity 5-step workflow:
```text
/new-branch → /sync-contract → /implement-module (paste task card) → /pre-pr-check → /open-pr
```

### Golden Invariants
1. **Frozen Contract:** Never touch `packages/shared-types/src/index.ts`. All 4 scoring pillars remain unchanged.
2. **Dual-Ingestion Coexistence:** Standalone `.eml` upload (`POST /api/upload`) must remain 100% operational.
3. **Queue Mechanics Isolation:** BullMQ `Queue` and `Worker` remain confined to `apps/api` and `apps/worker`.
4. **On-Demand & Privacy First:** Only retrieve the full raw RFC 822 payload when the user explicitly clicks **"Analyze with Mailiac"**.
5. **No Direct Package Cross-Imports:** Always import via package entrypoints (e.g. `@mailiac/db`).

---

## 2. Parallel Track Breakdown

```
┌────────────────────────────────────────────────────────┐  ┌────────────────────────────────────────────────────────┐
│             TRACK 1: MAYANK (Fullstack)                │  │               TRACK 2: VIVEK (Engine)                  │
│                                                        │  │                                                        │
│  Phase M1: Mongoose Schema & Google OAuth Service      │  │  Phase V1: Gmail API Client & Raw RFC 822 Extraction   │
│  • GmailAccountModel in packages/db                    │  │  • listMessages() metadata fetcher                     │
│  • Google OAuth URL generator & code exchanger         │  │  • fetchRawMessage() base64url → Buffer decoder        │
│                                                        │  │  • Token refresh & 429 exponential backoff             │
│  Phase M2: OAuth & Session Express Endpoints           │  │                                                        │
│  • GET  /api/gmail/auth/url                            │  │  Phase V2: Ingestion Routes & BullMQ Bridge            │
│  • GET  /api/gmail/auth/callback                       │  │  • GET  /api/gmail/messages                            │
│  • GET  /api/gmail/status                              │  │  • POST /api/gmail/messages/:messageId/analyze         │
│  • DELETE /api/gmail/disconnect                        │  │  • BullMQ 'email-forensics' queue dispatch             │
│                                                        │  │                                                        │
│  Phase M3: Next.js Frontend Integration                │  │  Phase V3: Vitest Suites & Forensic Parity Tests       │
│  • Dual-source hero buttons (Upload .EML / Gmail)      │  │  • Unit tests for raw RFC 822 decoding                 │
│  • Gmail Inbox Modal / Drawer with search & selection  │  │  • Integration test for 9-step worker pipeline parity  │
│  • 1-Click "Analyze" redirect to /forensic-analysis    │  │  • EML vs Gmail output consistency verification        │
└───────────────────────────┬────────────────────────────┘  └───────────────────────────┬────────────────────────────┘
                            │                                                           │
                            └─────────────────────────────┬─────────────────────────────┘
                                                          ▼
                                             MID-SPRINT INTEGRATION CHECK
                                            pnpm turbo run test typecheck
```

---

## 3. Step-by-Step Execution Checklist

### Milestone 0: Setup & Contract Confirmation (Together)
- [ ] **Mayank & Vivek:** Add Google OAuth credentials to `.env` (using `.env.example` placeholders):
  ```bash
  GOOGLE_CLIENT_ID=
  GOOGLE_CLIENT_SECRET=
  GOOGLE_REDIRECT_URI=http://localhost:4000/api/gmail/auth/callback
  FRONTEND_URL=http://localhost:3000
  ```
- [ ] **Mayank & Vivek:** Verify clean baseline build: `pnpm turbo run build typecheck` (29/29 pass).

---

### Track 1: Mayank (Fullstack Track)

#### Task M1: Mongoose Schema & Google OAuth Service
- [ ] `/new-branch` → `feat/mayank/gmail-oauth-service`
- [ ] `/sync-contract`
- [ ] `/implement-module` (Paste **Task Card M1**)
  - Add `GmailAccountModel` in `packages/db/src/index.ts`
  - Implement `GoogleAuthService` in `apps/api/src/services/googleAuth.ts` (`generateAuthUrl`, `exchangeCodeForTokens`, `getOAuthClient`)
- [ ] Add unit test: `packages/db` schema validation
- [ ] `/pre-pr-check` → `pnpm turbo run typecheck test`
- [ ] `/open-pr`

#### Task M2: Express OAuth & Account Routes
- [ ] `/new-branch` → `feat/mayank/gmail-auth-routes`
- [ ] `/sync-contract`
- [ ] `/implement-module` (Paste **Task Card M2**)
  - Create `apps/api/src/routes/gmail.ts`
  - Implement `GET /api/gmail/auth/url`
  - Implement `GET /api/gmail/auth/callback` (stores token in DB, sets cookie/session, redirects to frontend)
  - Implement `GET /api/gmail/status` (returns connected email and connection status)
  - Implement `DELETE /api/gmail/disconnect` (revokes Google token, deletes DB record)
  - Register router in `apps/api/src/server.ts` (`app.use('/api/gmail', gmailRouter)`)
- [ ] `/pre-pr-check` → `pnpm turbo run typecheck test`
- [ ] `/open-pr`

#### Task M3: Next.js Frontend Dual Ingestion & Inbox Drawer
- [ ] `/new-branch` → `feat/mayank/gmail-frontend-ui`
- [ ] `/sync-contract`
- [ ] `/implement-module` (Paste **Task Card M3**)
  - Update `apps/web/src/components/UploadZone.tsx` to support dual options: `[ Upload .EML File ]` and `[ Connect Gmail ]`
  - Create `apps/web/src/components/GmailInboxModal.tsx` (or Drawer):
    - Displays connected account status & `[ Disconnect ]` button
    - Search input supporting Gmail queries (`from:`, `is:unread`, `subject:`)
    - Message table showing Sender, Subject, Date, Snippet
    - `[ Analyze with Mailiac → ]` trigger button per message
  - Handle analysis trigger: call `POST /api/gmail/messages/:id/analyze`, display loading spinner, redirect to `/forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(subject)}`
- [ ] `/pre-pr-check` → `pnpm turbo run typecheck`
- [ ] `/open-pr`

---

### Track 2: Vivek (Engine Track)

#### Task V1: Gmail API Client & Raw RFC 822 Extraction
- [ ] `/new-branch` → `feat/vivek/gmail-api-client`
- [ ] `/sync-contract`
- [ ] `/implement-module` (Paste **Task Card V1**)
  - Install `googleapis` in `apps/api` (or shared service)
  - Implement `GmailClientService` in `apps/api/src/services/gmailClient.ts`:
    - `listMessages(auth, options: { q, maxResults, pageToken })`: Fetches message IDs and headers (`From`, `Subject`, `Date`, `Snippet`)
    - `fetchRawMessage(auth, messageId: string)`: Calls `users.messages.get({ id, format: 'raw' })` and decodes `base64url` into a `Buffer`
    - Token refresh handling with `refreshToken`
    - Exponential backoff for Google API rate limiting (429)
- [ ] Add unit test: `apps/api/test/gmailClient.test.ts` (test base64url decoding and metadata parsing with mock responses)
- [ ] `/pre-pr-check` → `pnpm turbo run typecheck test`
- [ ] `/open-pr`

#### Task V2: Ingestion Route & BullMQ Bridge
- [ ] `/new-branch` → `feat/vivek/gmail-ingestion-routes`
- [ ] `/sync-contract`
- [ ] `/implement-module` (Paste **Task Card V2**)
  - Add `GET /api/gmail/messages` in `apps/api/src/routes/gmail.ts` (calls `listMessages`)
  - Add `POST /api/gmail/messages/:messageId/analyze`:
    - Validates session / account
    - Calls `fetchRawMessage(auth, messageId)` to obtain RFC 822 `Buffer`
    - Creates UUID `messageId = randomUUID()`
    - Enqueues job to BullMQ `emailQueue.add('process-email', { messageId, buffer: rawEmlBuffer }, { jobId: messageId })`
    - Returns `202 Accepted { jobId: messageId, status: 'queued' }`
- [ ] `/pre-pr-check` → `pnpm turbo run typecheck test`
- [ ] `/open-pr`

#### Task V3: End-to-End Forensic Parity Tests
- [ ] `/new-branch` → `feat/vivek/gmail-parity-tests`
- [ ] `/sync-contract`
- [ ] `/implement-module` (Paste **Task Card V3**)
  - Create integration test: `apps/worker/test/gmail-ingestion.test.ts`
  - Take a sample fixture `.eml`, convert to base64url string, simulate Gmail API raw response
  - Decode to `Buffer` and run through the full 9-step worker pipeline (`parseEmlToMdm`, `traceReverseHops`, `verifyAuth`, `scoreIdentity`, `scoreIpReputation`, `scoreIntent`, `aggregateRisk`)
  - Assert that all 4 pillars and `AnalysisReport` in MongoDB match identical scores from direct `.eml` upload
- [ ] `/pre-pr-check` → `pnpm turbo run test`
- [ ] `/open-pr`

---

### Milestone 4: Integration Checkpoint & End-to-End Demo (Together)
- [ ] Both PRs merged into `develop`.
- [ ] Run full monorepo validation:
  ```bash
  pnpm turbo run build typecheck test
  ```
- [ ] Perform live end-to-end verification:
  1. Open Next.js UI (`http://localhost:3000`).
  2. Click "Connect Gmail" → Complete Google OAuth consent.
  3. Verify email address displays in the top bar / modal.
  4. Search for a test email in the Gmail Inbox drawer.
  5. Click "Analyze with Mailiac".
  6. Verify real-time transition to `/forensic-analysis?jobId=...`.
  7. Verify all 4 risk pillars, evidence boundary hops, and PDF report render with forensic parity.
  8. Upload a standalone `.eml` file to ensure dual-source coexistence remains intact.

---

## 4. Antigravity Agent Task Cards (Ready to Copy-Paste)

### Task Card M1 (Mayank)
```markdown
Module:        Gmail Mongoose Schema & Google OAuth Service
Owner:         Mayank
Package paths: packages/db/src/index.ts, apps/api/src/services/googleAuth.ts
Goal:          Create the GmailAccount Mongoose schema and Google OAuth client service.
Inputs:        Google Client ID, Client Secret, Redirect URI from process.env
Outputs:       GmailAccountModel, generateAuthUrl(), exchangeCodeForTokens(code), getOAuth2Client()
Constraints:
- Follow packages/db conventions with TypeScript interfaces.
- Token security: Store tokens server-side with tokenExpiry date.
- Zero changes to packages/shared-types.
- Vitest test in packages/db verifying model instantiation.
```

### Task Card M2 (Mayank)
```markdown
Module:        Express Gmail Auth Routes
Owner:         Mayank
Package paths: apps/api/src/routes/gmail.ts, apps/api/src/server.ts
Goal:          Implement the Express routes for Google OAuth handshake and account management.
Endpoints:
- GET  /api/gmail/auth/url -> { url: string }
- GET  /api/gmail/auth/callback -> exchanges code, saves account in Mongo, redirects to FRONTEND_URL
- GET  /api/gmail/status -> { connected: boolean, email?: string }
- DELETE /api/gmail/disconnect -> revokes token and removes account
Constraints:
- Express router with async error handling (next(err)).
- Register router at /api/gmail in server.ts.
- Return proper HTTP status codes (200, 302, 400, 401).
```

### Task Card M3 (Mayank)
```markdown
Module:        Next.js Frontend Dual Ingestion & Gmail Modal
Owner:         Mayank
Package paths: apps/web/src/components/UploadZone.tsx, apps/web/src/components/GmailInboxModal.tsx
Goal:          Add Gmail Connect CTA alongside .eml upload and build the interactive Gmail Inbox Drawer.
Components:
- Dual Ingestion Buttons in UploadZone: [ Upload .EML ] and [ Connect Gmail ]
- GmailInboxModal: Displays connected email, Disconnect button, Search bar (q param), and paginated message list
- Action: "Analyze with Mailiac" button per email calling POST /api/gmail/messages/:id/analyze and redirecting to /forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(subject)}
Constraints:
- Match existing Mailiac Tailwind dark/light theme (Stitch design system).
- Preserve existing manual .eml drag-and-drop workflow completely.
```

### Task Card V1 (Vivek)
```markdown
Module:        Gmail API Client Service & Raw RFC 822 Decoder
Owner:         Vivek
Package paths: apps/api/src/services/gmailClient.ts, apps/api/test/gmailClient.test.ts
Goal:          Implement Gmail API wrapper for lightweight metadata listing and raw RFC 822 extraction.
Functions:
- listMessages(auth, { q, maxResults, pageToken }): Fetches messages with format: 'metadata' (From, Subject, Date, Snippet)
- fetchRawMessage(auth, messageId): Calls users.messages.get({ id, format: 'raw' }), decodes base64url string to Buffer
- Token refresh helper: refreshes token if expired
- Error handling: Exponential backoff for 429 rate-limiting
Constraints:
- Type-safe TypeScript interfaces.
- vitest unit tests in apps/api/test/gmailClient.test.ts verifying base64url decoding with mock payloads.
```

### Task Card V2 (Vivek)
```markdown
Module:        Gmail Ingestion Route & BullMQ Bridge
Owner:         Vivek
Package paths: apps/api/src/routes/gmail.ts
Goal:          Implement /api/gmail/messages list and /api/gmail/messages/:messageId/analyze endpoints.
Endpoints:
- GET  /api/gmail/messages?q=... -> { messages: GmailMessageSummary[], nextPageToken?: string }
- POST /api/gmail/messages/:messageId/analyze -> fetches raw Buffer via fetchRawMessage, adds job to emailQueue ('email-forensics'), returns 202 { jobId, status: 'queued' }
Constraints:
- Uses existing emailQueue from apps/api/src/queue.ts.
- Job payload must exactly match { messageId: string, buffer: Buffer }.
- Fast response (202 Accepted) without blocking on worker execution.
```

### Task Card V3 (Vivek)
```markdown
Module:        End-to-End Forensic Parity Test Suite
Owner:         Vivek
Package paths: apps/worker/test/gmail-parity.test.ts
Goal:          Verify that emails ingested from Gmail raw format produce identical 4-pillar forensic results as uploaded .eml files.
Tests:
- Take a real fixture .eml from packages/parsing/mime/test/fixtures/
- Encode as base64url, decode via fetchRawMessage decoder
- Execute full 9-step worker pipeline against decoded buffer
- Assert authResults, identityScore, ipScore, nlpScore, and RiskMatrix match .eml parsing
Constraints:
- vitest test file.
- Strict assertions on MDM, reverse-hop path, and 4-pillar risk matrix.
```
