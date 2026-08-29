# 🚀 Developer Onboarding Guide — Mailiac

Welcome to the **Mailiac** engineering team! This guide covers everything you need to clone, configure, run, and develop on the Mailiac monorepo.

---

## 1. Prerequisites

Ensure your development environment meets the following baseline requirements:
- **Node.js**: `v20.x` or higher (`node -v`)
- **pnpm**: `v9.x` or higher (`pnpm -v`)
- **Docker & Docker Compose**: For local MongoDB and Redis (`docker compose version`)
- **Git**: For version control and branch management

---

## 2. Initial Setup & Quickstart

### Step 1: Clone Repository & Checkout Develop
```bash
git clone https://github.com/mayankjain92/mailiac.git
cd mailiac
git checkout develop
git pull origin develop
```

### Step 2: Install Workspace Dependencies
```bash
pnpm install
```

### Step 3: Start Infrastructure (MongoDB & Redis)
```bash
docker compose up -d
```
*This launches:*
- **MongoDB**: `mongodb://localhost:27017/mailiac`
- **Redis**: `redis://localhost:6379`

### Step 4: Configure Environment Variables
```bash
cp .env.example .env
```

Edit your `.env` file with required API keys and connection strings:

```bash
# Infrastructure
PORT=4000
MONGODB_URI=mongodb://localhost:27017/mailiac
REDIS_URL=redis://localhost:6379

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000

# Threat Intelligence & AI APIs
GEMINI_API_KEY=your_gemini_api_key_here
ABUSEIPDB_API_KEY=your_abuseipdb_key_here
GEOIP_API_KEY=your_geoip_key_here

# Google Workspace / Gmail OAuth 2.0 (Dual Ingestion)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:4000/api/gmail/auth/callback

# Security & Webhooks
WEBHOOK_SIGNING_SECRET=your_hmac_signing_secret_here
PROTECTED_DOMAINS=target-corp.com,paypal.com,google.com,microsoft.com,apple.com
```

### Step 5: Start All Applications in Development Mode
```bash
pnpm dev
```
*This starts Turborepo in watch mode:*
- **Frontend Dashboard (`apps/web`)**: `http://localhost:3000`
- **Express API Gateway (`apps/api`)**: `http://localhost:4000`
- **BullMQ Pipeline Worker (`apps/worker`)**: Listening on `email-forensics` queue

---

## 3. Monorepo Scripts & Quality Checks

Run these scripts from the repository root:

| Command | Action |
|---|---|
| `pnpm dev` | Run all applications and packages in hot-reload watch mode |
| `pnpm build` | Compile all TypeScript packages and build Next.js frontend |
| `pnpm typecheck` | Run `tsc --noEmit` across all 11 monorepo packages |
| `pnpm test` | Execute Vitest unit and integration test suites |
| `pnpm lint` | Run ESLint across all codebase files |

To run commands for a single app or package:
```bash
# Example: Run tests only for the risk engine package
pnpm --filter @mailiac/scoring-risk-engine test

# Example: Run typecheck only for apps/api
pnpm --filter @mailiac/api typecheck
```

---

## 4. Antigravity AI Agent Rules & Workflows

Mailiac is optimized for AI-assisted pair programming using Antigravity coding agents.

### A. Installing Global & Workspace Workflows
Workflows live in `docs/workflows/` and `.agents/workflows/`:
```bash
mkdir -p ~/.gemini/antigravity-ide/global_workflows/ ~/.gemini/antigravity/global_workflows/ .agents/workflows/
cp docs/workflows/*.md ~/.gemini/antigravity-ide/global_workflows/
cp docs/workflows/*.md ~/.gemini/antigravity/global_workflows/
cp docs/workflows/*.md .agents/workflows/
```

### B. Standard Slash Commands
- **`/sync-contract`** — Verify local alignment against `@mailiac/shared-types`.
- **`/new-branch`** — Create a feature branch (`feat/<owner>/<module-name>`) off `develop`.
- **`/implement-module`** — Implement a package or module following strict contracts and tests.
- **`/pre-pr-check`** — Run full lint, typecheck, unit tests, and build check before pushing.
- **`/open-pr`** — Commit and open a PR targeting `develop`.
- **`/integration-check`** — Run full end-to-end pipeline validation against fixture emails.
- **`/wire-real-api`** — Connect frontend data layers to backend endpoints.

---

## 5. Golden Engineering Rules

1. **Frozen Interface Contract:** NEVER add, modify, or remove fields in `packages/shared-types/src/index.ts` without explicit team consensus.
2. **Queue Mechanics Isolation:** BullMQ `Queue` and `Worker` instances belong exclusively in `apps/api` and `apps/worker`. Packages under `packages/parsing/*` and `packages/scoring/*` must remain pure, side-effect-free functions.
3. **No Direct Internal Cross-Imports:** Always import from sibling packages using their published root entrypoints (e.g. `import { parseEmlToMdm } from '@mailiac/parsing-mime'`).
4. **Resilient Fallbacks:** Every async API call (Gemini, AbuseIPDB, GeoIP) must have a strict timeout and a local deterministic fallback. Flaky third-party network calls must never crash worker jobs.
5. **No Full PII Logging:** Never log raw email bodies or sensitive user tokens in production or worker logs.
