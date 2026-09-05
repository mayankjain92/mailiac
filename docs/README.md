# 📚 Mailiac Documentation Hub & System Overview

Welcome to the **Mailiac** documentation center. Mailiac is an asynchronous, enterprise-grade email forensics and threat-hunting platform built as a high-performance TypeScript Turborepo monorepo.

---

## 🧭 Master Documentation Index

| Category | Document | Description |
|---|---|---|
| **Architectural Design** | **[Architecture & Threat Engine Report](./Mailiac_Architecture_Report.md)** | Full System Architecture, Monorepo Boundaries & Data Flow |
| **Pipeline & Math** | **[Pipeline & Risk Engine Deep Dive](./PIPELINE_AND_RISK_ENGINE.md)** | 9-Stage Forensic Pipeline, Math Formulas & Evidence Rules ($C_1 - C_4$) |
| **Product Specification** | **[Master PRD & Team Execution Plan](./Backend_PRD_Team_Execution_Plan.md)** | Unified PRD, Message Data Model (MDM), Track Cards & Schedule |
| **API Reference** | **[API Reference Specification](./API_REFERENCE.md)** | REST Endpoints, EML Upload, Re-analysis, Feedback, PDF Export & SSE Streams |
| **Developer Guide** | **[Developer Onboarding Guide](./DEVELOPER_ONBOARDING.md)** | Setup, Docker Compose, Env Variables & Antigravity AI Workflows |
| **Future Vision & Roadmap** | **[Future Goals & Innovation Architecture](./FUTURE_ROADMAP.md)** | Active Learning, Fast-Path Hashes, Graph Threat Hunting & SOAR |
| **Hackathon & Pitch** | **[SIH 2026 Project Overview](./SIH2026_Mailiac_Overview.md)** | Hackathon Presentation Highlights & Pitch Talking Points |
| **Hackathon Checklist** | **[SIH Hackathon Feature Checklist](./SIH_HACKATHON_CHECKLIST.md)** | MVP Demo Strategy, Badges & Presentation Flow |

---

## 🏛️ Monorepo Architecture Overview

```
mailiac/
├── apps/
│   ├── api/                 → Express REST Gateway (Upload, Gmail OAuth, Reports, Re-Analysis, PDF, SSE)
│   ├── worker/              → BullMQ Pipeline Consumer & Multi-Stage Orchestrator
│   └── web/                 → Next.js 14 SOC Analyst Evidence Console
├── packages/
│   ├── shared-types/        → Frozen TypeScript Interface Contract
│   ├── db/                  → Mongoose Schemas (AnalysisReport, RawEmail, AnalystFeedback, GmailAccount)
│   ├── parsing/
│   │   ├── mime/            → RFC 822 / MIME Parser & SHA-256 Attachment Hasher
│   │   ├── decloak/         → HTML Glassworm & Zero-Width Unicode De-cloaking
│   │   ├── geoip/           → Geolocation & ASN Hop Enrichment
│   │   └── ai-intent/       → Multi-Model & Multi-Key Failover Router + Local Heuristics
│   ├── scoring/
│   │   ├── reverse-hop/     → Network Received Header Evidence Boundary Tracer
│   │   ├── auth/            → SPF, DKIM, DMARC, ARC Cryptographic Validator
│   │   ├── identity/        → Evidence-Gated Levenshtein, Jaro-Winkler & Homoglyph Spoof Detector
│   │   ├── ip-reputation/   → AbuseIPDB, Proxy/VPN & Timezone Anomaly Engine
│   │   └── risk-engine/     → Deterministic 4-Pillar Risk Aggregator (C1-C4 Rules)
│   ├── reporting/
│   │   └── pdf/             → Zero-Dependency Forensic PDF 1.4 Generator
│   └── webhooks/            → HMAC-SHA256 Payload Signer & Dispatcher
└── docs/                    → Centralized Documentation Suite
```

---

## ⚡ 9-Step Forensics Pipeline

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
