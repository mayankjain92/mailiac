---
description: Wire frontend data layer in apps/web/src/lib/api.ts to live backend endpoints
---

1. Open `apps/web/src/lib/api.ts`. Ensure all mock responses are replaced with real `fetch()` calls to the corresponding backend endpoints:
   - `uploadEml(file: File)` → `POST /api/upload` (multipart/form-data)
   - `getJobStatus(jobId: string)` → `GET /api/jobs/:id` (or SSE `/api/jobs/:id/events`)
   - `getReport(jobId: string)` → `GET /api/reports/:id`
   - `downloadPdfReport(jobId: string)` → `GET /api/reports/:id/pdf`
   - Gmail Integration:
     - `getGmailAuthUrl()` → `GET /api/gmail/auth/url`
     - `getGmailStatus()` → `GET /api/gmail/status`
     - `disconnectGmail()` → `DELETE /api/gmail/disconnect`
     - `listGmailMessages(query?: string)` → `GET /api/gmail/messages`
     - `analyzeGmailMessage(messageId: string)` → `POST /api/gmail/messages/:messageId/analyze`
2. Keep identical function signatures so UI components require zero changes.
3. Confirm API base URL is driven by `NEXT_PUBLIC_API_URL` (defaulting to `http://localhost:4000`).
   // turbo
4. Run `pnpm --filter @mailiac/web typecheck`
5. Test all core screens (`/`, `/forensic-analysis`, `/analysis-console/[caseId]`, `/analysis-console/[caseId]/evidence`, `/analysis-console/[caseId]/report`) against the running backend and report any schema or response discrepancies.
