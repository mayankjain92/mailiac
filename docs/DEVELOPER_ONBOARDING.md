# 🚀 Developer Onboarding Guide — mailiac

Welcome to **mailiac**! Follow this quick setup guide to pull the codebase, configure your AI agent environment, and start working on your assigned modules.

---

## 1. Initial Local Setup

Open your terminal and run:

```bash
# 1. Clone the repository (if not already cloned)
git clone https://github.com/mayankjain92/mailiac.git
cd mailiac

# 2. Checkout the develop branch & pull latest
git checkout develop
git pull origin develop

# 3. Install workspace dependencies
pnpm install

# 4. Copy environment variables file
cp .env.example .env
```

---

## 2. Setting Up Antigravity AI Rules & Workflows

To ensure all developers follow the frozen contracts, code conventions, and workflows:

### A. Add Workspace Workflows
Copy the workflow files from `docs/workflows/` into your local Antigravity workflow folder (`~/.gemini/antigravity/global_workflows/`):

```bash
mkdir -p ~/.gemini/antigravity/global_workflows/
cp docs/workflows/*.md ~/.gemini/antigravity/global_workflows/
```

This makes the 7 slash commands available directly in your AI assistant:
- `/sync-contract`
- `/new-branch`
- `/implement-module`
- `/pre-pr-check`
- `/open-pr`
- `/integration-check`
- `/wire-real-api`

### B. Configure Global Rules
Paste the contents of `RULE[user_global]` into **Antigravity Settings → Rules → Workspace Rules**.

---

## 3. Daily Workflow for Developers

When you are ready to implement a module:

1. **Start your session by telling the AI:**
   > `"I'm [Name], Day [X]"`  
   *(e.g., `"I'm Praneet, Day 1-2"`, `"I'm Vivek, Day 1-2"`, or `"I'm Harshita, Day 1-2"`)*

2. **Execute steps using Slash Commands:**
   - Run `/sync-contract` — Verify shared interfaces
   - Run `/new-branch` — Create your feature branch (`feat/<owner>/<module-name>`) off `develop`
   - Implement code & test cases with AI assistance
   - Run `/pre-pr-check` — Verify linting, typechecking, vitest tests, and builds pass 100%
   - Run `/open-pr` — Open a Pull Request targeting the `develop` branch!

---

## 4. Track & Package Responsibilities

Refer to [`docs/10_Day_Checklist.md`](./10_Day_Checklist.md) for the exact module breakdown, file locations, and task cards for each developer:

- **Mayank**: API Ingestion gateway, MongoDB persistence, SSE/WebSockets, PDF reporting.
- **Praneet**: MIME parsing (`packages/parsing/mime`), HTML de-cloaking, GeoIP enrichment, AI Intent.
- **Vivek**: Reverse-hop trace (`packages/scoring/reverse-hop`), Crypto Auth, Identity scoring, IP Reputation, Risk Engine, Webhook signing.
- **Harshita**: Frontend application (`apps/web`), mock fixture, `src/lib/api.ts` abstraction, 3 core pages (`/upload`, `/status/[jobId]`, `/report/[jobId]`), recharts breakdown & Leaflet hop map.

---

## 5. Harshita Setup Guide (Track D — Frontend)

### A. Scaffold Prompt for Harshita (Paste into AI assistant in workspace)

```text
Add a new app `apps/web` to the existing `mailiac` Turborepo monorepo.
Do NOT touch apps/api, apps/worker, or any packages/ folder — only add apps/web
and register it in the workspace.

STACK
- Next.js 14 (App Router), TypeScript strict mode
- Tailwind CSS + shadcn/ui
- recharts (for the 4-pillar risk breakdown)
- react-leaflet + leaflet (for the forensic hop-path map)
- Depends on `@mailiac/shared-types` for all data types — do not
  redefine AnalysisReport or any pillar types locally.

IMPORTANT: Build everything against MOCK DATA first. The real backend isn't
ready yet. Create `apps/web/src/lib/mock-data.ts` exporting one hand-written
object of type `AnalysisReport` (import the type from shared-types) with
realistic-looking values across all fields (risk score, pillar breakdown,
forensic path with 3-4 hops, aiSummary).

Create `apps/web/src/lib/api.ts` as the ONLY place that "talks to the backend."
For now, every function in this file should just return the mock data
(with an artificial delay via setTimeout to simulate a real request):
  - uploadEml(file: File): Promise<{ jobId: string }>
  - getJobStatus(jobId: string): Promise<{ status: 'queued'|'processing'|'completed'|'failed' }>
  - getReport(jobId: string): Promise<AnalysisReport>
This is the ONLY file that will need to change later when the real backend
is ready — no component should ever import mock-data.ts directly, only api.ts.

PAGES
- `/upload` — drag-and-drop or file-picker for a .eml file, calls uploadEml(),
  shows the returned jobId, then redirects to /status/[jobId]
- `/status/[jobId]` — polls getJobStatus() every 2s, shows a simple state
  indicator (queued/processing/completed/failed), redirects to /report/[jobId]
  once completed
- `/report/[jobId]` — calls getReport(), and renders:
    - a big risk score number/gauge (0-100, color-coded: green <40, yellow
      40-70, red >70)
    - a bar chart (recharts) of the 4 pillar scores (auth/identity/ip/nlp)
    - a table of the forensic hop path (ip, city, country, trusted y/n)
    - a leaflet map plotting each hop's coordinates
    - the aiSummary section (urgency, intent labels)

DESIGN
- Dark theme, clean SOC-analyst-dashboard feel — not a marketing site.
- Use shadcn/ui components (Card, Table, Badge, Button) rather than raw
  Tailwind everywhere.

Do not implement real fetch() calls to any URL yet. Do not add authentication.
This is a 10-day prototype — keep scope to exactly the 3 pages above.
```

### B. Harshita Individual Rules

```markdown
# AGENTS.md — Track D (Harshita): Frontend

## Your app
apps/web only. Never touch apps/api, apps/worker, or packages/.

## Context
- All data types come from `@mailiac/shared-types` — import them,
  never redefine AnalysisReport/RiskMatrix/etc. locally.
- ALL data fetching goes through `src/lib/api.ts`. No component should ever
  call fetch() directly or import mock-data.ts directly — this is what makes
  the Day 9 swap to the real backend a one-file change instead of a rewrite.
- Build and test every screen against the mock fixture first. Don't wait for
  the real backend to be ready to build UI.
- Risk score color bands: green <40, yellow 40-70, red >70.

## Non-goals
No auth/login. No settings/admin pages. Just the 3 screens: upload, status,
report. If it's not one of those 3, it's out of scope for this sprint.
```

