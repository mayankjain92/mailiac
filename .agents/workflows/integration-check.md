---
description: Verify apps/worker and apps/api run the full pipeline end-to-end against fixtures
---

1. Grep across `packages/` and `apps/` for any remaining `throw new Error('TODO` stubs
   and report modules or features still pending.
   // turbo
2. Run `docker compose up -d` to ensure MongoDB and Redis instances are running.
3. Verify worker and API start cleanly in local dev mode.
4. Run sample fixtures through the pipeline:
   - Benign email (low risk score, verified auth)
   - BEC / Phishing email (high NLP/urgency, spoofed or compromised auth)
   - Spoofed domain email (DMARC/SPF failure, identity penalty)
   - Forwarded mailing list (no false-positive on auth pillar)
5. Verify parity across ingestion channels:
   - Standalone `.eml` upload (`POST /api/upload`)
   - Gmail ingestion (`POST /api/gmail/messages/:id/analyze`)
6. Verify output artifacts:
   - MongoDB `AnalysisReport` persistence
   - Forensic PDF report generation (`GET /api/reports/:id/pdf`)
7. Report any stage that throws or produces an unexpected score, with the stage
   name and package/app path.
