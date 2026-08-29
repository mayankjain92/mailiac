---
name: wire-real-api
description: Connect apps/web frontend services in src/lib/api.ts to real backend Express endpoints. Use when migrating from mock fixtures to live API or running /wire-real-api.
---

# Wire Real API Workflow

1. Open `apps/web/src/lib/api.ts`.
2. Connect endpoints to Express backend (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000`):
   - `uploadEml(file: File)` → `POST /api/upload`
   - `getJobStatus(jobId: string)` → `GET /api/jobs/:id` (or SSE `/api/jobs/:id/events`)
   - `getReport(jobId: string)` → `GET /api/reports/:id`
   - `downloadPdfReport(jobId: string)` → `GET /api/reports/:id/pdf`
   - Gmail endpoints:
     - `GET /api/gmail/auth/url`
     - `GET /api/gmail/status`
     - `DELETE /api/gmail/disconnect`
     - `GET /api/gmail/messages`
     - `POST /api/gmail/messages/:messageId/analyze`
3. Verify type correctness:
   ```bash
   pnpm --filter @mailiac/web typecheck
   ```
