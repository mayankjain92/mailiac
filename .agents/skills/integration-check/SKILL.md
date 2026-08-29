---
name: integration-check
description: Validate end-to-end asynchronous email forensics pipeline execution across Docker dependencies (MongoDB, Redis), apps/api, apps/worker, and apps/web. Use when performing /integration-check.
---

# Integration Check Workflow

Perform end-to-end integration testing:

1. **Verify Unimplemented Stubs**: Check for any remaining `throw new Error('TODO')`.
2. **Start Infrastructure**:
   ```bash
   docker compose up -d
   ```
3. **Start Local Development Stack**:
   ```bash
   pnpm run dev
   ```
4. **Test Fixtures Against Ingestion Routes**:
   - Direct EML upload (`POST /api/upload`)
   - Gmail ingestion (`POST /api/gmail/messages/:id/analyze`)
5. **Verify 4-Pillar Scoring Output**:
   - Cryptographic Auth (SPF, DKIM, DMARC)
   - Identity & Spoof Analysis
   - Reverse-Hop & IP Reputation
   - NLP & AI Intent
6. **Verify Output Artifacts**:
   - Check MongoDB report document in `AnalysisReportModel`
   - Test PDF report generation endpoint: `GET /api/reports/:id/pdf`
