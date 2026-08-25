---
description: Swap mock data in lib/api.ts for real calls to the live backend
---
1. Open src/lib/api.ts. For each function, replace the mock return with a
   real fetch() call to the corresponding endpoint:
   - uploadEml → POST /api/upload (multipart form data)
   - getJobStatus → GET /api/jobs/:id
   - getReport → GET /api/reports/:id
2. Keep the exact same function signatures — components should need zero
   changes.
3. Confirm the API base URL comes from an environment variable
   (NEXT_PUBLIC_API_URL), not hardcoded.
// turbo
4. Run `pnpm --filter web typecheck`
5. Manually test all 3 pages against the real running backend and report
   anything that doesn't match what mock data assumed.
