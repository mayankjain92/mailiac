# 📄 Master Product Requirements Document (PRD) & Team Execution Plan

## AI-Powered Email Forensics & Threat Intelligence Platform (Dual Ingestion: EML + Gmail)

- **Product:** Mailiac — AI-Powered Email Forensics & Threat Intelligence Platform  
- **Team:** Mayank (Track A Lead – Platform & Delivery) · Praneet (Track B Lead – Enrichment Layer) · Vivek (Track C Lead – Verification & Scoring Engine) · Harshita (Track D Lead – Frontend Application)  
- **Sprint Scope:** 10-day prototype sprint / Smart India Hackathon (SIH) 2026  
- **Methodology:** Contract-First Development · Parallel Antigravity AI Coding Agent Task Cards · Turborepo Monorepo · Strict PR Gates  

---

## 1. Executive Summary & Purpose

Mailiac is an enterprise-grade, asynchronous email forensics platform designed to ingest suspicious emails, structurally dissect their contents, and expose sophisticated cyber threats—such as Business Email Compromise (BEC), spear phishing, lookalike domain spoofing, and zero-width evasion attacks.

A key differentiator of Mailiac is its **Deterministic 4-Pillar Corroboration Risk Engine**. Rather than naively feeding unvetted email bodies into an LLM and blindly trusting the output, Mailiac sandboxes semantic AI as one of four independent forensic pillars (Identity 35%, AI Intent 35%, Crypto 20%, Infrastructure 10%).

### Dual-Ingestion Model
Mailiac supports two seamless ingestion sources that feed into the exact same 9-step forensics pipeline:
1. **Manual `.eml` Upload (`POST /api/upload`)**: Drag-and-drop raw RFC 822 `.eml` files (up to 20MB).
2. **On-Demand Gmail OAuth 2.0 (`/api/gmail/*`)**: Securely connect a Google Workspace / Gmail account, browse recent messages (metadata only), and trigger 1-click forensic extraction (`format: 'raw'`).

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
                        Stage 1: MIME Parser (postal-mime)
                                         ↓
                   ┌─────────────────────┼─────────────────────┐
                   ↓                     ↓                     ↓
              Crypto Auth             Identity              IP/Infra
             (mailauth/ARC)      (Levenshtein/Jaro)       (AbuseIPDB)
                   │                     │                     │
                   └─────────────────────┼─────────────────────┘
                                         ↓
                               NLP Intent & Decloak
                             (Gemini + Local Fallback)
                                         ↓
                         4-Pillar Deterministic Risk Engine
                                         ↓
                             Canonical AnalysisReport
                                         ↓
                     Frontend Forensic Console & PDF Export
```

---

## 2. Team & Track Responsibilities

| Developer | Primary Track | Track Scope & Ownership | Key Deliverables |
|---|---|---|---|
| **Mayank** | **Track A — Platform & Delivery** | Ingestion, BullMQ queueing, MongoDB persistence, SSE notifications, PDF export, Google OAuth service | `apps/api`, `apps/worker` (orchestrator), `packages/db`, `packages/reporting/pdf` |
| **Praneet** | **Track B — Enrichment Layer** | MIME parsing, HTML de-cloaking, GeoIP enrichment, AI intent extraction | `packages/parsing/mime`, `packages/parsing/decloak`, `packages/parsing/geoip`, `packages/parsing/ai-intent` |
| **Vivek** | **Track C — Verification & Scoring** | Crypto auth, reverse-hop trace, identity/homoglyph detection, IP reputation, 4-pillar risk engine, webhook signing, Gmail API client | `packages/scoring/reverse-hop`, `packages/scoring/auth`, `packages/scoring/identity`, `packages/scoring/ip-reputation`, `packages/scoring/risk-engine`, `packages/webhooks` |
| **Harshita** | **Track D — Frontend Console** | SOC analyst dashboard, dual-source upload zone, Gmail inbox modal, risk visualizations, hop map | `apps/web` (Next.js 14 App Router, Tailwind CSS, Recharts, Leaflet) |

---

## 3. Technology Stack & Invariants

| Layer | Choice | Details |
|---|---|---|
| **Monorepo** | **Turborepo + pnpm workspaces** | Strict package boundaries, caching, TypeScript strict mode |
| **API Framework** | **Express.js + TypeScript** | Port 4000; Multer 20MB buffer limit; Google OAuth 2.0 client |
| **Queue & Broker** | **BullMQ + ioredis (Redis)** | Dedicated `email-forensics` queue; non-blocking background worker |
| **Database** | **MongoDB + Mongoose** | Collections: `AnalysisReport` (24h TTL), `GmailAccount`, `EmailAnalysisRecord` |
| **MIME Parsing** | **postal-mime** | Lossless RFC 822 header and body parsing + SHA-256 attachment hashing |
| **Crypto Auth** | **mailauth** | SPF, DKIM (RSA/Ed25519), DMARC alignment, and Multi-Hop ARC validation |
| **Identity Defense** | **damerau-levenshtein + tldts** | String distance algorithms, homoglyph skeleton mapping |
| **HTML Cleaning** | **cheerio** | Zero-width character detection (U+200B/C/D), invisible font-size:0 stripping |
| **GeoIP Enrichment** | **Free HTTP API (ip-api.com / ipapi.co)** | Geolocation coordinates, city, country, and ASN lookup |
| **IP Reputation** | **AbuseIPDB API** | Threat confidence scoring, Tor exit nodes, VPN/proxy indicators |
| **AI / NLP** | **@google/genai (Gemini 3.6-flash)** | Structured JSON intent scoring with local regex heuristic fallback |
| **Reporting** | **Zero-Dependency PDF 1.4 Generator** | Immutable binary PDF generator in `packages/reporting/pdf` |
| **Frontend UI** | **Next.js 14 (App Router)** | Port 3000; Tailwind CSS, Recharts risk gauges, Leaflet map |

---

## 4. The Shared Contract: Message Data Model (MDM)

The interfaces in `packages/shared-types/src/index.ts` represent the immutable contract across the monorepo:

```typescript
export interface ParsedAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface MDM {
  messageId: string;
  rawHeaders: Record<string, string[]>;
  from: { name?: string; address: string };
  replyTo?: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtmlRaw: string;
  bodyHtmlCleaned?: string;
  attachments: ParsedAttachment[];
  receivedHeadersRaw: string[];
}

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

export interface AuthResult {
  spf: 'pass' | 'fail' | 'neutral' | 'none';
  dkim: 'pass' | 'fail' | 'none';
  dmarcAlignment: 'strict' | 'relaxed' | 'fail';
  arcPass: boolean;
  authScore: number;
  findings: Finding[];
}

export interface IdentityResult {
  levenshteinDistance: number;
  damerauLevenshteinDistance: number;
  jaroWinklerScore: number;
  homoglyphMatch: boolean;
  matchedProtectedDomain?: string;
  identityScore: number;
  findings: Finding[];
}

export interface IPReputationResult {
  abuseConfidenceScore: number;
  isProxyOrVpn: boolean;
  timezoneDiscrepancyHours: number;
  ipScore: number;
  findings: Finding[];
}

export interface NLPResult {
  provider: 'gemini' | 'heuristic' | 'hybrid';
  providerStatus: 'success' | 'fallback';
  intentLabels: string[];
  financialRequestScore: number;
  credentialHarvestingScore: number;
  glasswormFlag: boolean;
  zeroWidthCharCount: number;
  nlpScore: number;
  confidence?: number;
  findings: Finding[];
}

export interface RiskMatrix {
  authScore: number;
  identityScore: number;
  ipScore: number;
  nlpScore: number;
  finalScore: number;
  pillars: {
    authentication: { score: number; weight: number; findings: Finding[] };
    identity: { score: number; weight: number; findings: Finding[] };
    infrastructure: { score: number; weight: number; findings: Finding[] };
    nlp: { score: number; weight: number; findings: Finding[] };
  };
}

export interface AnalysisReport {
  messageId: string;
  senderDomain: string;
  timestamp: string;
  executionTimeMs?: number;
  forensicPath: ForensicHop[];
  authResults: AuthResult;
  riskMatrix: RiskMatrix;
  aiSummary: {
    urgency: number;
    intent: string[];
    integrityHash: string;
    confidence: number;
    findings: Finding[];
  };
}
```

---

## 5. Detailed 9-Stage Forensics Pipeline Specification

### Stage 1: MIME Parsing & Attachment Hashing (`packages/parsing/mime`)
- Lossless extraction of RFC 822 emails into `MDM`.
- Computes SHA-256 hashes for all attachments.

### Stage 2: Reverse-Hop Path Tracing (`packages/scoring/reverse-hop`)
- Walks `Received` headers bottom-up to locate the **Evidence Boundary**.
- Performs DNS PTR verification to flag proxy injection.

### Stage 3: Cryptographic Verification (`packages/scoring/auth`)
- Mathematically validates SPF, DKIM (RSA/Ed25519), and DMARC alignment.
- Checks Authenticated Received Chain (ARC) seals for forwarded mail.

### Stage 4: HTML Glassworm De-cloaking (`packages/parsing/decloak`)
- Scans HTML bodies for zero-width Unicode characters (`U+200B`, `U+200C`, `U+200D`, `U+FEFF`).
- Strips hidden tracking structures and `font-size: 0px` text.

### Stage 5: GeoIP & ASN Enrichment (`packages/parsing/geoip`)
- Maps public IP hops to physical coordinates (City, Country, ASN) for map rendering.

### Stage 6: IP Reputation & Threat Intel (`packages/scoring/ip-reputation`)
- Queries AbuseIPDB for abuse confidence scores; detects Tor/VPN relays and timezone anomalies.

### Stage 7: Sender Identity & Homoglyph Defense (`packages/scoring/identity`)
- Computes Levenshtein and Jaro-Winkler distances against protected enterprise domains.
- Detects Unicode homoglyphs and display-name mismatching.

### Stage 8: Hybrid NLP Intent Scoring (`packages/parsing/ai-intent`)
- Primary: **Google Gemini 3.6-flash** with strict JSON schema enforcement.
- Fail-Safe: Instant local regex heuristic fallback on API timeouts or network errors.

### Stage 9: Deterministic 4-Pillar Corroboration Engine (`packages/scoring/risk-engine`)
$$\text{BaseScore} = (0.35 \times S_{\text{identity}}) + (0.35 \times S_{\text{nlp}}) + (0.20 \times S_{\text{auth}}) + (0.10 \times S_{\text{ip}})$$
- Enforces evidence rules ($C_1 - C_4$) to prevent AI hallucinations and guarantee deterministic verdicts.

---

## 6. Gmail Dual-Ingestion Engine Specification

### 6.1 Google OAuth 2.0 Flow
- Scopes: `userinfo.email`, `gmail.readonly` (least privilege).
- Endpoints: `GET /api/gmail/auth/url`, `GET /api/gmail/auth/callback`, `DELETE /api/gmail/disconnect`.

### 6.2 Lightweight Browsing & Extraction
- `GET /api/gmail/messages`: Lists recent messages (metadata only) with cached analysis badges.
- `POST /api/gmail/messages/:messageId/analyze`: Fetches raw RFC 822 MIME bytes (`format: 'raw'`), decodes base64url into a `Buffer`, and dispatches it directly into BullMQ `email-forensics`.

### 6.3 Privacy Invariants
- **No Background Scanning:** Unselected emails are never analyzed or downloaded.
- **Read-Only:** Mailiac cannot send, delete, or alter Gmail messages.

---

## 7. Database Models (`packages/db`)

1. **`AnalysisReportModel`**: Stores full canonical report JSON with a 24-hour TTL index (`expireAt`).
2. **`GmailAccountModel`**: Stores user session tokens, refresh tokens, and token expiration timestamps.
3. **`EmailAnalysisRecordModel`**: Unified tracking collection for both `.eml` uploads and Gmail messages with sparse unique indexing on `gmailMessageId` for idempotent re-analysis.

---

## 8. Antigravity AI Agent Task Cards

### Task Card A1 (Mayank — Ingestion Gateway)
```markdown
Module:        Express Ingestion Gateway
Owner:         Mayank
Package paths: apps/api/src/routes/upload.ts, apps/api/src/server.ts
Goal:          Implement multipart upload route with 20MB Multer limit and BullMQ enqueueing.
Inputs:        multipart/form-data with file field
Outputs:       202 Accepted { jobId: string, status: 'queued' }
```

### Task Card B1 (Praneet — MIME Parser)
```markdown
Module:        MIME Deconstruction & Attachment Hashing
Owner:         Praneet
Package paths: packages/parsing/mime/src/index.ts
Goal:          Convert raw EML buffer into MDM object and compute SHA-256 attachment hashes.
Inputs:        rawEml: Buffer
Outputs:       MDM
```

### Task Card C1 (Vivek — Reverse-Hop Tracer)
```markdown
Module:        Reverse-Hop Trace Algorithm
Owner:         Vivek
Package paths: packages/scoring/reverse-hop/src/index.ts
Goal:          Parse Received headers top-to-bottom, detect evidence boundary, and validate PTR.
Inputs:        receivedHeadersRaw: string[]
Outputs:       ReverseHopResult
```

### Task Card C2 (Vivek — 4-Pillar Risk Engine)
```markdown
Module:        4-Pillar Risk Scoring Engine
Owner:         Vivek
Package paths: packages/scoring/risk-engine/src/index.ts
Goal:          Aggregate 4 pillar scores using deterministic formula and C1-C4 circuit breakers.
Inputs:        auth, identity, ip, nlp results
Outputs:       RiskMatrix
```

### Task Card M1 / V1 (Mayank & Vivek — Gmail OAuth & Raw Ingestion)
```markdown
Module:        Gmail OAuth & RFC 822 Extraction
Owner:         Mayank & Vivek
Package paths: apps/api/src/services/googleAuth.ts, apps/api/src/services/gmailClient.ts, apps/api/src/routes/gmail.ts
Goal:          Implement OAuth 2.0 flow, lightweight message list, and raw RFC 822 MIME decoding.
Inputs:        Google OAuth code, Gmail Message ID
Outputs:       Decoded RFC 822 Buffer dispatched to BullMQ
```

---

## 9. 10-Day Sprint Schedule & Definition of Done

| Phase | Milestone | Status |
|---|---|---|
| **Day 1** | Contract Freeze (`packages/shared-types`) & Monorepo Scaffold | ✅ Complete |
| **Days 1–2** | Upload Ingestion, MIME Parsing, Reverse-Hop & Frontend Scaffold | ✅ Complete |
| **Days 3–5** | Database Persistence, Crypto Auth, GeoIP & Identity Defense | ✅ Complete |
| **Days 6–8** | AI Semantic Intent, IP Reputation, Risk Engine & Webhook Signing | ✅ Complete |
| **Day 9** | Full Pipeline Integration & Parallel Worker Orchestration | ✅ Complete |
| **Days 9–10** | On-Demand Gmail OAuth 2.0 Ingestion & Forensic PDF Export | ✅ Complete |

### Definition of Done
- 100% test coverage across 28 Vitest test suites.
- 0 TypeScript compilation errors in strict mode (`pnpm turbo run build typecheck test`).
- Lossless parity between `.eml` uploads and Gmail-ingested emails.
