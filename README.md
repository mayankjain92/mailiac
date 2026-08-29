# 🛡️ Mailiac

**Enterprise-Grade AI Email Forensics & Threat-Hunting Platform**  
*Built for the Smart India Hackathon (SIH) 2026*

[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict_Mode-blue.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444.svg)](https://turbo.build/)
[![Vitest](https://img.shields.io/badge/Vitest-100%25_Passing-success.svg)](https://vitest.dev/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14_App_Router-black.svg)](https://nextjs.org/)
[![Express](https://img.shields.io/badge/Express-Gateway-lightgrey.svg)](https://expressjs.com/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Redis_Queue-red.svg)](https://bullmq.io/)

---

## 📌 Executive Overview

**Mailiac** is an asynchronous, high-throughput email forensics platform that automatically dissects raw `.eml` email files and on-demand Google Workspace / Gmail messages to expose Business Email Compromise (BEC), spear phishing, lookalike domain spoofing, and zero-width obfuscation attacks.

Unlike naive tools that blindly forward unvetted emails to Large Language Models, Mailiac utilizes a **Deterministic 4-Pillar Corroboration Engine**. AI is sandboxed as one of four independently weighted forensic pillars (Identity 35%, AI Intent 35%, Crypto Auth 20%, Infrastructure 10%), backed by hard cryptographic verification (SPF/DKIM/DMARC/ARC), reverse-hop network evidence boundary tracing, and zero-downtime local heuristic fallback engines.

---

## 📚 Master Documentation Hub

All technical specifications, architecture diagrams, API specs, and sprint roadmaps are organized under [`docs/`](./docs/README.md):

| Category | Document | Description |
|---|---|---|
| **Architectural Design** | **[Architecture & Threat Engine Report](./docs/Mailiac_Architecture_Report.md)** | Full System Architecture, Monorepo Boundaries & Data Flow |
| **Pipeline & Math** | **[Pipeline & Risk Engine Deep Dive](./docs/PIPELINE_AND_RISK_ENGINE.md)** | 9-Stage Forensic Pipeline, Math Formulas & Evidence Rules ($C_1 - C_4$) |
| **Product Specification** | **[Master PRD & Team Execution Plan](./docs/PRD.md)** | Unified PRD, Message Data Model (MDM), Track Cards & Schedule |
| **API Reference** | **[API Reference Specification](./docs/API_REFERENCE.md)** | REST Endpoints, EML Upload, Gmail OAuth, PDF Export & SSE Streams |
| **Integrations** | **[Gmail Ingestion PRD & Checklist](./docs/gmail-integration/checklist.md)** | On-Demand Gmail Dual-Ingestion Specification & Parity Tests |
| **Developer Guide** | **[Developer Onboarding Guide](./docs/DEVELOPER_ONBOARDING.md)** | Setup, Docker Compose, Env Variables & Antigravity AI Workflows |
| **Sprint Progress** | **[10-Day Prototype Checklist](./docs/10_Day_Checklist.md)** | Module Completion Status & Track Breakdown |
| **Future Vision & Roadmap** | **[Future Goals & Innovation Architecture](./docs/FUTURE_ROADMAP.md)** | Active Learning, Fast-Path Hashes, Graph Threat Hunting & SOAR |
| **Hackathon & Pitch** | **[SIH 2026 Project Overview](./docs/SIH2026_Mailiac_Overview.md)** | Hackathon Presentation Highlights & Pitch Talking Points |
| **Hackathon Checklist** | **[SIH Hackathon Feature Checklist](./docs/SIH_HACKATHON_CHECKLIST.md)** | MVP Demo Strategy, Badges & Presentation Flow |

---

## 🏗️ Monorepo Architecture

```
mailiac/
├── apps/
│   ├── api/                 → Express REST Gateway (Upload, Gmail OAuth, Reports, PDF, SSE)
│   ├── worker/              → BullMQ Pipeline Consumer & Multi-Stage Orchestrator
│   └── web/                 → Next.js 14 SOC Analyst Evidence Console
├── packages/
│   ├── shared-types/        → Frozen TypeScript Interface Contract
│   ├── db/                  → Mongoose Schemas (AnalysisReport, GmailAccount, EmailAnalysisRecord)
│   ├── parsing/
│   │   ├── mime/            → RFC 822 / MIME Parser & SHA-256 Attachment Hasher
│   │   ├── decloak/         → HTML Glassworm & Zero-Width Unicode De-cloaking
│   │   ├── geoip/           → Geolocation & ASN Hop Enrichment
│   │   └── ai-intent/       → Hybrid Gemini 3.6-flash & Local Heuristics
│   ├── scoring/
│   │   ├── reverse-hop/     → Network Received Header Evidence Boundary Tracer
│   │   ├── auth/            → SPF, DKIM, DMARC, ARC Cryptographic Validator
│   │   ├── identity/        → Levenshtein, Jaro-Winkler & Homoglyph Spoof Detector
│   │   ├── ip-reputation/   → AbuseIPDB, Proxy/VPN & Timezone Anomaly Engine
│   │   └── risk-engine/     → Deterministic 4-Pillar Risk Aggregator (C1-C4 Rules)
│   ├── reporting/
│   │   └── pdf/             → Zero-Dependency Forensic PDF 1.4 Generator
│   └── webhooks/            → HMAC-SHA256 Payload Signer & Dispatcher
└── docs/                    → Centralized Documentation Suite
```

---

## ⚙️ 9-Step Forensics Pipeline

```
1. Ingestion         → Manual .EML upload (20MB) OR On-Demand Gmail OAuth 2.0
2. MIME Parse        → postal-mime extraction + SHA-256 attachment hashing
3. Parallel Phase 1  → • Reverse-Hop Trace (Evidence Boundary & PTR validation)
                       • Crypto Auth (SPF / DKIM / DMARC / Multi-Hop ARC)
                       • HTML De-cloak (Glassworm zero-width characters & hidden URLs)
4. Parallel Phase 2  → • Semantic AI Intent (Gemini 3.6-flash + local keyword fallback)
                       • GeoIP & ASN Enrichment (IP-API)
                       • IP Reputation (AbuseIPDB + Proxy/Tor detection)
                       • Identity Spoofing (Levenshtein & Homoglyph matching)
5. Risk Engine       → Deterministic 4-pillar corroboration & C1-C4 circuit breakers
6. Persist & Report  → MongoDB write (24h TTL) + PDF 1.4 export + SSE telemetry stream
```

---

## ⚖️ Deterministic 4-Pillar Risk Weighting

$$\text{BaseScore} = (0.35 \times S_{\text{identity}}) + (0.35 \times S_{\text{nlp}}) + (0.20 \times S_{\text{auth}}) + (0.10 \times S_{\text{ip}})$$

- **$C_1$ (Definite Phishing):** Identity Spoof $\ge 85 \land$ Crypto Fail $\ge 70 \implies \text{QUARANTINE}$
- **$C_2$ (Malicious Impersonation):** Identity Spoof $\ge 85 \land$ AI Intent $\ge 70 \implies \text{QUARANTINE}$
- **$C_3$ (Multi-Pillar Consensus):** $\ge 3$ strong signals $\ge 70 \implies \text{QUARANTINE}$
- **$C_4$ (AI Hallucination Immunity):** Auth, Identity, IP clean ($\le 20$) $\implies$ Final Score capped at 40 (**SAFE**/**FLAG**).

---

## 🚀 Quickstart & Setup

### Prerequisites
- **Node.js**: `v20+`
- **pnpm**: `v9+`
- **Docker & Docker Compose**

### 1. Clone & Install
```bash
git clone https://github.com/mayankjain92/mailiac.git
cd mailiac
pnpm install
```

### 2. Start Infrastructure (MongoDB + Redis)
```bash
docker compose up -d
```

### 3. Configure Environment
```bash
cp .env.example .env
# Fill in GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ABUSEIPDB_API_KEY, etc.
```

### 4. Run Development Cluster
```bash
pnpm dev
```
- **Next.js Web Console**: `http://localhost:3000`
- **Express REST API**: `http://localhost:4000`
- **Worker**: Listening on BullMQ queue `email-forensics`

---

## 🧪 Monorepo Quality Commands

| Command | Action |
|---|---|
| `pnpm dev` | Run all apps and packages in parallel watch mode |
| `pnpm build` | Compile all TypeScript packages and Next.js production build |
| `pnpm typecheck` | Run `tsc --noEmit` across all 11 packages and apps |
| `pnpm test` | Run Vitest unit and integration test suites |
| `pnpm lint` | Execute ESLint across entire monorepo |

---

## 🔒 Security & Privacy Invariants

- **Frozen Shared Contract:** No package alters `@mailiac/shared-types` without explicit consensus.
- **Queue Mechanics Isolation:** BullMQ `Queue` and `Worker` are strictly confined to `apps/api` and `apps/worker`.
- **Zero-Downtime Resilience:** Every external API has a strict timeout and a local deterministic fallback.
- **Privacy-First Gmail Ingestion:** Mailiac does not scan inboxes in the background or download unselected emails. Only the explicitly selected message is fetched and analyzed.