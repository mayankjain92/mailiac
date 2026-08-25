# mailiac

An asynchronous email forensics pipeline implemented as a Turborepo monorepo.

## Folder Structure

```
mailiac/
├── apps/
│   ├── api/          → Express HTTP gateway (upload, job status, reports)
│   └── worker/       → BullMQ consumer / pipeline orchestrator
├── packages/
│   ├── shared-types/ → Frozen TypeScript interface contract (never edit without team consensus)
│   ├── db/           → Mongoose connection helper + AnalysisReport model
│   ├── parsing/
│   │   ├── mime/         → EML → MDM parser
│   │   ├── decloak/      → HTML de-obfuscation
│   │   ├── geoip/        → GeoIP hop enrichment
│   │   └── ai-intent/    → Gemini AI intent scoring
│   ├── scoring/
│   │   ├── reverse-hop/  → Received-header hop trace
│   │   ├── auth/         → SPF / DKIM / DMARC / ARC verification
│   │   ├── identity/     → Sender identity scoring (Levenshtein, homoglyphs)
│   │   ├── ip-reputation/→ AbuseIPDB + VPN/proxy detection
│   │   └── risk-engine/  → 4-pillar risk score aggregator
│   ├── webhooks/     → HMAC payload signing
│   └── reporting/
│       └── pdf/      → PDF forensic report generation
└── docs/
```

## Prerequisites

- Node 20+
- pnpm 9+
- Docker + Docker Compose

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure (Redis + MongoDB)

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in your API keys and connection strings
```

### 4. Run in development mode

```bash
pnpm dev
```

This runs `turbo run dev` which starts `apps/api` and `apps/worker` concurrently.

## Available Scripts

| Script          | Description                          |
|-----------------|--------------------------------------|
| `pnpm dev`      | Start all apps in watch mode         |
| `pnpm build`    | Build all packages and apps          |
| `pnpm typecheck`| TypeScript type-check across monorepo|
| `pnpm lint`     | ESLint across all packages           |
| `pnpm test`     | Run vitest across all packages       |

## Pipeline Stages

1. **MIME Parse** — EML → MDM (structured email object)
2. **Reverse-Hop Trace** — Received headers → forensic hop path
3. **Crypto Auth** — SPF / DKIM / DMARC / ARC verification
4. **GeoIP Enrich** — IP hops → city/country/ASN annotations
5. **HTML De-cloak** — Remove obfuscation, count zero-width chars
6. **AI Intent Score** — Gemini-powered NLP classification
7. **4-Pillar Risk Score** — auth + identity + IP + NLP → finalScore
8. **Persist + Notify** — MongoDB write + webhook dispatch
9. **PDF Report** — Forensic PDF generation