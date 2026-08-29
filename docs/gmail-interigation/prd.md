# Product Requirements Document & Team Execution Plan

# Mailiac Gmail Integration — On-Demand Email Forensic Analysis

**Product:** Mailiac — AI-Powered Email Forensics & Threat Intelligence Platform  
**Feature:** Gmail Integration (Dual Ingestion Architecture: Manual `.eml` Upload + Connected Gmail Account)  
**Status:** Approved Specification  
**Target:** SIH 2026 MVP  
**Authors/Owners:** Mayank (Track A Lead) · Praneet (Track B Lead) · Vivek (Track C Lead) · Harshita (Track D Lead)  
**Primary Goal:** Enable users to securely connect their Google Workspace / Gmail account, browse recent emails, select an individual email, and run Mailiac's existing 9-step forensic analysis pipeline directly on that email with a single click—without needing to manually export and upload an `.eml` file.

---

## 1. Executive Summary

Mailiac currently provides a deterministic, 9-step asynchronous email forensic pipeline that analyzes manually uploaded `.eml` files (MIME deconstruction, reverse-hop path tracing, DKIM/SPF cryptographic authentication, HTML glassworm de-cloaking, GeoIP/ASN enrichment, hybrid NLP semantic intent analysis, and 4-pillar risk corroboration).

This feature introduces **Gmail as a second, coexisting email-ingestion source**. The existing `.eml` file upload workflow remains 100% active and untouched.

A user will be able to:
1. Connect their Gmail account using Google OAuth 2.0 (read-only least privilege).
2. View a lightweight list of recent Gmail messages (metadata only).
3. Select one email from their inbox or search results.
4. Explicitly click **"Analyze with Mailiac"**.
5. The backend fetches *only that selected message* as raw RFC 822 MIME bytes (`format: 'raw'`).
6. The existing Mailiac parsing and 4-pillar detection pipeline analyzes the message via BullMQ worker.
7. The canonical `AnalysisReport` is stored in MongoDB and rendered by the existing frontend forensic console.

> **Privacy-First Design:** The MVP does **NOT** continuously monitor Gmail, scan the inbox in the background, automatically analyze unselected emails, send/delete/modify messages, or download the full bodies of unselected emails.

```
                                  Mailiac Ingestion Layer
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │                                           │
               Source 1: Upload .EML                       Source 2: Connect Gmail
                       │                                           │
                       │                                   Fetch Email Metadata
                       │                                           │
                       │                                    User Selects Email
                       │                                           │
                       │                                   Fetch Raw RFC 822 MIME
                       │                                           │
                       └─────────────────────┬─────────────────────┘
                                             ↓
                                 Raw RFC 822 Byte Buffer
                                             ↓
                                  BullMQ 'email-forensics'
                                             ↓
                               Existing MIME Parser (postal-mime)
                                             ↓
                       ┌─────────────────────┼─────────────────────┐
                       ↓                     ↓                     ↓
                  Crypto Auth            Identity             IP/Infra
                 (mailauth/ARC)      (Levenshtein/Jaro)      (AbuseIPDB)
                       │                     │                     │
                       └─────────────────────┼─────────────────────┘
                                             ↓
                                   NLP Intent & Decloak
                                 (Gemini + Local Fallback)
                                             ↓
                                  4-Pillar Risk Engine
                                             ↓
                                  Canonical AnalysisReport
                                             ↓
                              Frontend Forensic Console (/report)
```

---

## 2. Problem Statement & User Journey

### 2.1 The Current Problem
Exporting `.eml` files from webmail clients is technically effective but cumbersome for analysts and end-users:
```text
Open Gmail → Open Email → Click "..." (More) → "Download message" (.eml) → Switch to Mailiac → Drag & Drop .eml → Analyze
```

### 2.2 The Desired Dual-Source Flow
With Gmail integration enabled, users have two seamless options on the Mailiac landing page:
```text
Option A (.eml):   Drag & Drop .eml File → Run Forensics
Option B (Gmail):  Connect Gmail → Browse / Search Emails → Select Email → Run Forensics
```

---

## 3. Goals & Non-Goals

### 3.1 Primary Goals
- **G1. Secure Google OAuth 2.0:** Allow users to authenticate their Gmail account with minimum required scopes.
- **G2. Dual Ingestion Coexistence:** Maintain `.eml` manual upload and Gmail as equal, parallel ingestion options.
- **G3. Lightweight Mailbox Browsing:** Retrieve and paginate message metadata (`messageId`, `sender`, `subject`, `date`, `snippet`) without downloading full bodies.
- **G4. Explicit Single-Email Analysis:** Only retrieve the full raw message when the user explicitly triggers analysis.
- **G5. Zero Modifications to Frozen Core Contracts:** Gmail raw MIME payload decodes directly into `Buffer` and feeds into `parseEmlToMdm(buffer)` and `verifyAuth(buffer)` with **zero changes to `@mailiac/shared-types`**.
- **G6. Universal Report Rendering:** Produce the identical `AnalysisReport` interface rendered by the Next.js forensic console.

### 3.2 Non-Goals (Out of Scope for MVP)
- Continuous background inbox monitoring / auto-scanning (Pub/Sub webhooks deferred to post-MVP).
- Bulk scanning of the entire mailbox (all emails at once).
- Modifying, deleting, or auto-quarantining emails inside Gmail (read-only scope).
- Sending emails or drafts via Gmail API.
- Replacing or deprecating the `.eml` upload workflow.

---

## 4. Architecture & Monorepo Integration

### 4.1 Monorepo Structure & Ownership

```text
mailiac/
├── apps/
│   ├── api/                    # Express REST API (OAuth, Gmail routes, BullMQ producer) → Mayank
│   ├── worker/                 # BullMQ pipeline worker (unmodified 9-step pipeline) → Vivek / Mayank
│   └── web/                    # Next.js App Router (Landing, Gmail Drawer, Report Console) → Harshita
├── packages/
│   ├── shared-types/           # FROZEN CONTRACT (MDM, AnalysisReport, RiskMatrix) → Shared
│   ├── db/                     # Mongoose schemas (AnalysisReport, GmailAccount) → Mayank
│   ├── parsing/
│   │   ├── mime/               # postal-mime RFC 822 parser → Praneet
│   │   ├── decloak/            # cheerio HTML glassworm defense → Praneet
│   │   ├── geoip/              # IP location enrichment → Praneet
│   │   └── ai-intent/          # Gemini 3.6-flash + local heuristics → Praneet
│   ├── scoring/
│   │   ├── reverse-hop/        # Received header trace & evidence boundary → Vivek
│   │   ├── auth/               # mailauth SPF/DKIM/DMARC/ARC → Vivek
│   │   ├── identity/           # Damerau-Levenshtein / Jaro-Winkler → Vivek
│   │   ├── ip-reputation/      # AbuseIPDB + proxy/VPN check → Vivek
│   │   └── risk-engine/        # 4-Pillar deterministic corroboration → Vivek
│   └── reporting/pdf/          # Forensic PDF generator → Mayank
```

### 4.2 Architectural Rules & Invariants
1. **Stack is Fixed:** Express.js (not Fastify), BullMQ + ioredis, MongoDB Atlas + Mongoose, Next.js App Router, TypeScript strict mode, pnpm.
2. **Contract Preservation:** `packages/shared-types` is frozen. No fields are modified or deleted.
3. **Queue Mechanics Isolation:** BullMQ `Queue` and `Worker` remain confined to `apps/api` and `apps/worker`. All packages under `packages/*` remain queue-agnostic pure functions.
4. **Single Forensic Engine:** Exactly one risk engine and one MIME parser handle all emails regardless of origin.

---

## 5. Technical Specification: Gmail Ingestion Engine

### 5.1 Google OAuth 2.0 Flow
- **Library:** `googleapis` & `google-auth-library`.
- **Minimum Scopes:**
  ```text
  https://www.googleapis.com/auth/userinfo.email
  https://www.googleapis.com/auth/gmail.readonly
  ```
- **State Security:** Cryptographically random `state` parameter generated with `crypto.randomBytes(32)` stored in server-side session / encrypted cookie to prevent CSRF.

### 5.2 Lightweight Message Browsing
- Call `gmail.users.messages.list({ userId: 'me', maxResults: 20, q: query, pageToken })`.
- Fetch message metadata using `gmail.users.messages.batchGet` or individual lightweight metadata fetches (`format: 'metadata'`, headers: `['From', 'Subject', 'Date']`).
- Return minimal payload to frontend:
  ```typescript
  export interface GmailMessageSummary {
    id: string;
    threadId: string;
    sender: string;
    subject: string;
    date: string;
    snippet: string;
  }
  ```

### 5.3 Raw RFC 822 Extraction & Pipeline Bridge
When the user clicks "Analyze with Mailiac":
1. The backend invokes:
   ```typescript
   const response = await gmail.users.messages.get({
     userId: 'me',
     id: messageId,
     format: 'raw',
   });
   ```
2. Google returns the RFC 822 MIME message encoded in **base64url** format (`response.data.raw`).
3. The backend decodes this string into a Node.js `Buffer`:
   ```typescript
   const rawEmlBuffer = Buffer.from(response.data.raw, 'base64url');
   ```
4. The backend enqueues the job into BullMQ:
   ```typescript
   const analysisJobId = randomUUID();
   await emailQueue.add(
     'process-email',
     {
       messageId: analysisJobId,
       buffer: rawEmlBuffer,
     },
     { jobId: analysisJobId }
   );
   ```
5. Returns `202 Accepted { jobId: analysisJobId }` to the frontend.
6. The frontend polls `GET /api/jobs/:id` or listens via SSE `GET /api/notify/sse/:id`, redirecting to `/forensic-analysis?jobId=...` on completion.

---

## 6. Database Models (`packages/db`)

### 6.1 `GmailAccount` Model
Stores connected OAuth accounts and credentials per session.

```typescript
// packages/db/src/index.ts

export interface GmailAccountDocument extends Document {
  sessionId: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gmailAccountSchema = new Schema<GmailAccountDocument>(
  {
    sessionId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    tokenExpiry: { type: Date, required: true },
  },
  { timestamps: true }
);

export const GmailAccountModel = model<GmailAccountDocument>(
  'GmailAccount',
  gmailAccountSchema
);
```

---

## 7. API Specifications (`apps/api`)

All endpoints are registered under `/api/gmail/*` in `apps/api/src/routes/gmail.ts`:

### 7.1 `GET /api/gmail/auth/url`
- **Description:** Generates Google OAuth consent URL.
- **Response (200):**
  ```json
  { "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
  ```

### 7.2 `GET /api/gmail/auth/callback`
- **Description:** OAuth redirect callback. Exchanges `code` for tokens, creates/updates `GmailAccount`, and redirects to frontend.
- **Query Params:** `code`, `state`.
- **Response (302):** Redirects to `${FRONTEND_URL}/?gmail=connected`.

### 7.3 `GET /api/gmail/status`
- **Description:** Checks if current user/session has an active Gmail connection.
- **Response (200):**
  ```json
  { "connected": true, "email": "analyst@target-corp.com" }
  ```

### 7.4 `DELETE /api/gmail/disconnect`
- **Description:** Revokes tokens with Google and deletes `GmailAccount` record.
- **Response (200):**
  ```json
  { "success": true, "message": "Gmail account disconnected" }
  ```

### 7.5 `GET /api/gmail/messages`
- **Description:** Returns paginated list of recent email metadata.
- **Query Params:**
  - `q`: Optional search filter (e.g., `is:unread`, `from:paypal`, `invoice`)
  - `maxResults`: Default `20`, Max `50`
  - `pageToken`: Optional pagination token
- **Response (200):**
  ```json
  {
    "messages": [
      {
        "id": "18f8ab219c4d21a0",
        "threadId": "18f8ab219c4d21a0",
        "sender": "PayPal Security <service@paypa1-security.com>",
        "subject": "Urgent: Verify your account within 24h",
        "date": "2026-08-29T14:15:00.000Z",
        "snippet": "We detected unusual sign-in activity on your account..."
      }
    ],
    "nextPageToken": "CDA4..."
  }
  ```

### 7.6 `POST /api/gmail/messages/:messageId/analyze`
- **Description:** Fetches raw RFC 822 MIME payload for specified message ID, decodes base64url to Buffer, and enqueues BullMQ forensic job.
- **Response (202):**
  ```json
  {
    "jobId": "e2f47c0b-3b32-4d2a-89b1-507ff582103f",
    "status": "queued"
  }
  ```

---

## 8. Frontend UI / UX Specifications (`apps/web`)

### 8.1 Dual Ingestion UI Component (`UploadZone.tsx` / `GmailModal.tsx`)
The Mailiac landing page hero section displays two distinct action triggers:
1. **`[ Upload .EML File ]`** — Opens standard drag-and-drop file picker.
2. **`[ Connect Gmail Account ]`** / **`[ Browse Gmail Inbox ]`** — Opens interactive Gmail modal/drawer.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MAILIAC INGESTION CONSOLE                       │
│                                                                        │
│   ┌──────────────────────────────┐  ┌──────────────────────────────┐   │
│   │       UPLOAD RAW .EML        │  │       CONNECT GMAIL          │   │
│   │   [ Drag & Drop .eml File ]  │  │   [ Connect with Google ]    │   │
│   │    Analyze standalone file   │  │    Browse & Select Email     │   │
│   └──────────────────────────────┘  └──────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Gmail Inbox Drawer / Modal
When connected, the Gmail interface displays:
- **Header:** Connected account badge (`analyst@example.com`) + `[ Disconnect ]` button.
- **Search Bar:** Real-time search query box supporting Gmail filters (`from:`, `subject:`, `is:unread`).
- **Email List Table:** List of recent emails showing Sender, Subject, Date, Snippet.
- **Action Column:** `[ Analyze with Mailiac → ]` button per email.
- **Loading State:** Progress indicator during single-email raw fetch and BullMQ enqueuing.
- **Transition:** Automatically redirects to `/forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(subject)}`.

---

## 9. Team Track Breakdown & Task Cards

### 9.1 Track A — Mayank: Platform & Ingestion Gateway
- **Ownership:** Google OAuth2 Client, `packages/db` Mongoose schema, `apps/api/src/routes/gmail.ts`, BullMQ producer integration.
- **Task Cards:**
  - `CARD-A1`: Implement `GmailAccountModel` in `packages/db/src/index.ts`.
  - `CARD-A2`: Build Google OAuth2 service (`generateAuthUrl`, `exchangeCodeForTokens`, `getOAuthClientForSession`).
  - `CARD-A3`: Implement `/api/gmail/auth/url`, `/api/gmail/auth/callback`, `/api/gmail/status`, and `/api/gmail/disconnect` routes.
  - `CARD-A4`: Implement `/api/gmail/messages` (metadata list) and `/api/gmail/messages/:messageId/analyze` (raw RFC 822 fetch & BullMQ enqueuing).

### 9.2 Track B — Praneet: Extraction & RFC 822 Resilience
- **Ownership:** Base64url raw MIME decoding verification, Gmail metadata extraction helpers, rate-limit retry wrapper.
- **Task Cards:**
  - `CARD-B1`: Build helper to decode Gmail base64url raw payload into RFC 822 Buffer.
  - `CARD-B2`: Validate that `parseEmlToMdm()` parses Gmail raw buffers identically to native `.eml` files.
  - `CARD-B3`: Implement exponential backoff for Google API 429 rate limits.

### 9.3 Track C — Vivek: Scoring Consistency & Integration Tests
- **Ownership:** Verify 4-pillar risk consistency across Gmail and `.eml` inputs, end-to-end integration tests.
- **Task Cards:**
  - `CARD-C1`: Write integration test verifying that a Gmail raw buffer produces valid `AuthResult`, `IdentityResult`, `IPReputationResult`, and `NLPResult`.
  - `CARD-C2`: Confirm `RiskMatrix` calculation produces consistent score parity between Gmail-ingested emails and file-uploaded `.eml` samples.

### 9.4 Track D — Harshita: Frontend Experience
- **Ownership:** Next.js UI (`apps/web`), Dual-source ingestion UI, Gmail Inbox drawer, message selection, SSE progress tracking.
- **Task Cards:**
  - `CARD-D1`: Add "Connect Gmail" CTA and status badge to `UploadZone.tsx` / landing page.
  - `CARD-D2`: Build `GmailInboxModal` / Drawer component with search, pagination, and message selection.
  - `CARD-D3`: Wire `analyzeMessage(messageId)` API call with loading spinner and redirect to `/forensic-analysis`.

---

## 10. Environment Variables (`.env.example`)

Add the following to `.env.example`:

```bash
# Google OAuth 2.0 Configuration
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/gmail/auth/callback

# Session Secret (for OAuth state validation)
SESSION_SECRET=your-random-session-secret-key

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

---

## 11. Security, Token Lifecycle & Privacy

1. **Least-Privilege Scopes:** Request `gmail.readonly` only. Never request `gmail.modify` or `gmail.compose` for MVP.
2. **Token Protection:** Tokens are stored server-side in MongoDB with access restricted to backend services. Tokens are never exposed to the client or logged.
3. **Session State CSRF Protection:** Cryptographic `state` token verified on OAuth callback.
4. **Transient Storage:** Raw RFC 822 buffers are processed through BullMQ into MongoDB reports with automatic 24-hour TTL index expiration (`expireAt`).
5. **Clean Disconnect:** Calling `/api/gmail/disconnect` deletes server records and revokes token with Google.

---

## 12. Verification & Testing Strategy

### 12.1 Automated Vitest Suites
- **OAuth Callback Test:** Tests code exchange, state validation, and account persistence.
- **Message List Test:** Tests pagination, query parameter passing, and metadata extraction.
- **Raw Fetch & Decoding Test:** Verifies base64url decoding into RFC 822 Buffer.
- **End-to-End Pipeline Parity Test:** Feeds a decoded Gmail mock message into `apps/worker` and asserts that all 4 pillars (`authResults`, `identityScore`, `ipScore`, `nlpScore`) and `RiskMatrix` calculate accurately.

### 12.2 Manual Verification Checklist
- [ ] Connect Gmail account via Google OAuth popup/redirect.
- [ ] Verify connected account email displays on Mailiac dashboard.
- [ ] Search and browse Gmail inbox emails with pagination.
- [ ] Select a suspicious email, click "Analyze with Mailiac", and observe seamless redirect to `/forensic-analysis`.
- [ ] Verify all 4 pillars, forensic hops, and risk scores render identically to uploaded `.eml` files.
- [ ] Click "Disconnect" and verify account is removed and tokens cleared.
