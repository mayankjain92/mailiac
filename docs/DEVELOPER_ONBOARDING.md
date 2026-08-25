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

This makes the 6 slash commands available directly in your AI assistant:
- `/sync-contract`
- `/new-branch`
- `/implement-module`
- `/pre-pr-check`
- `/open-pr`
- `/integration-check`

### B. Configure Global Rules
Paste the contents of `RULE[user_global]` into **Antigravity Settings → Rules → Workspace Rules**.

---

## 3. Daily Workflow for Developers

When you are ready to implement a module:

1. **Start your session by telling the AI:**
   > `"I'm [Name], Day [X]"`  
   *(e.g., `"I'm Praneet, Day 1-2"` or `"I'm Vivek, Day 1-2"`)*

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
