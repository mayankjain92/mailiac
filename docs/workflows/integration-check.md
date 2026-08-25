---
description: Verify apps/worker runs the full pipeline end-to-end against fixture EMLs
---

1. Grep across packages/ for any remaining `throw new Error('TODO` stubs and report
   which modules still aren't implemented.
   // turbo
2. Run `docker compose up -d`
3. Start the worker and API locally.
4. Run each fixture EML (benign, bec-phishing, spoofed-domain,
   forwarded-mailing-list) through the pipeline and report the resulting risk score
   against the expected direction — e.g. bec-phishing should score high, the
   forwarded mailing-list one should NOT false-positive on the auth pillar.
5. Report any stage that throws or produces an unexpected result, with the stage
   name and package path.
