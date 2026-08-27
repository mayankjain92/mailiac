# SIH 2026 Hackathon Implementation Overview & Checklist

> **Prototype Strategy for SIH 2026**:
> Prioritize **High Visual & Demo Impact** features over complex backend infrastructure. Focus on completing working end-to-end flows that impress judges during live presentations.

---

## 📋 Execution Checklist

- [ ] **1. Sender Attribution Badges** `[Frontend]` `[~20 mins]`
- [ ] **2. Attachment Hazard Analysis** `[Backend]` `[~30 mins]`
- [x] **3. Forensic PDF Report Export** `[Fullstack]` `[COMPLETED ✅]`
- [ ] **4. Threat Campaign Grouping (Case Management)** `[Fullstack]` `[~45 mins]`
- [ ] **5. Domain MX & Record Check** `[Backend]` `[~30 mins]`
- [ ] **6. Graph Attribution Slide (Future Scope)** `[Presentation]` `[~15 mins]`

---

## 🛠️ Feature Implementation Overviews

### 1. Sender Attribution Badges `[Frontend]`
* **Type**: `Frontend`
* **Status**: 🔲 Pending (Assigned to Frontend Developer)
* **Goal**: Convert raw forensic risk scores into a clean, human-readable status badge on the UI dashboard.
* **Target Location**: `apps/web/lib/attribution.ts` (or UI header component).
* **Key Logic & Rules**:
  * **Spoofed Domain** 🔴: Triggers if SPF or DMARC fails while display names mismatch.
  * **Compromised Account (BEC)** 🔴: Triggers if SPF passes but AI urgency and financial intent scores are high.
  * **Anonymized Proxy Infra** 🟧: Triggers if hop trace detects injection or proxy relays.
  * **Malicious Payload** 🟣: Triggers if high-risk attachments are present.
  * **Verified Sender** 🟢: Triggers if total risk score is low (< 30) and auth checks pass.

---

### 2. Attachment Hazard Analysis `[Backend]`
* **Type**: `Backend`
* **Status**: 🔲 Next in Queue
* **Goal**: Evaluate attachment risk deterministically without relying on third-party API rate limits.
* **Target Location**: `packages/scoring/risk-engine`.
* **Key Logic & Rules**:
  * Flag high-risk executable/script extensions (`.exe`, `.vbs`, `.js`, `.xlsm`, `.scr`, `.iso`, `.bat`, `.ps1`).
  * Detect suspicious double extensions (e.g., `invoice.pdf.exe` or `document.doc.js`).
  * Calculate an attachment threat score (0–100) and append high-risk findings to the report.

---

### 3. Forensic PDF Report Export `[Fullstack]` ✅ COMPLETED

> [!NOTE]
> **Implementation Complete (`2026-08-27`)**:
> - **Backend Generator**: Implemented zero-dependency PDF 1.4 binary stream generator in `packages/reporting/pdf/src/index.ts`.
> - **API Endpoint**: Added `GET /api/reports/:id/pdf` binary download route in `apps/api/src/routes/reports.ts`.
> - **Tests**: 100% test coverage with Vitest suite passed cleanly.

* **Type**: `Fullstack` (Backend PDF Generator + API Route)
* **Goal**: Enable generating and downloading a clean 1-page forensic evidence PDF report.
* **Target Locations**:
  * **Backend**: `packages/reporting/pdf/src/index.ts` and `apps/api/src/routes/reports.ts`
  * **Frontend**: `apps/web/components/PdfExportButton.tsx`
* **Completed Output**:
  * Returns binary `%PDF-1.4` header document with `Content-Type: application/pdf`.
  * Layout includes executive summary header, Case ID, 4-pillar risk breakdown, SPF/DKIM/DMARC status, reverse-hop path table, key findings, and cryptographic integrity signature.

---

### 4. Threat Campaign Grouping (Case Management Lite) `[Fullstack]`
* **Type**: `Fullstack` (Express Endpoint + Next.js UI)
* **Status**: 🔲 Scheduled
* **Goal**: Demonstrate SIEM case management by grouping individual phishing emails into unified campaigns.
* **Target Location**: 
  * **Backend**: `apps/api/src/routes/campaigns.ts`
  * **Frontend**: `apps/web/app/campaigns` (or Dashboard Tab)
* **Key Logic & Rules**:
  * **Backend**: Aggregate stored MongoDB reports using `$group` on `senderDomain` or normalized `subject`. Calculate metrics (total emails, max risk score, affected targets).
  * **Frontend**: Render a "Threat Campaigns" view on the Next.js dashboard listing all aggregated threat groups.

---

### 5. Domain MX & Record Check `[Backend]`
* **Type**: `Backend`
* **Status**: 🔲 Scheduled
* **Goal**: Detect lookalike or fake domains that lack active mail server (MX) infrastructure.
* **Target Location**: `packages/scoring/ip-reputation` (or domain check helper).
* **Key Logic & Rules**:
  * Perform a quick `node:dns` lookup (`dns.resolveMx`) for the sender domain.
  * If zero MX records exist or lookup fails, add a domain risk penalty (+25) and flag invalid MX infrastructure.

---

### 6. Graph Attribution (Presentation Strategy) `[Presentation]`
* **Type**: `Presentation / Pitch Slide`
* **Status**: 🔲 Scheduled (Deck preparation)
* **Goal**: Address campaign correlation requirements without building complex Neo4j graph storage during the hackathon.
* **Target Location**: Hackathon Presentation Slides ("Future Roadmap").
* **Key Talking Point**:
  * Explain that v1 performs real-time single-email 4-pillar risk extraction, while v2 is designed to feed findings into a Neo4j graph DB to link threat actors across historical campaigns by IP, domain, and file hashes.

---

## 🚀 Recommended Work Sequence

1. **`[Frontend]` Sender Attribution Badges** — Instant visual upgrade on the dashboard.
2. **`[Backend]` Attachment Threat Scoring** — Fills the malware payload detection gap.
3. **`[Backend]` Domain MX Check** — Adds live domain intelligence.
4. **`[Fullstack]` Threat Campaign Grouping** — Demonstrates enterprise SOC utility.
5. **`[Fullstack]` PDF Report Generation** — ✅ **COMPLETED** (`packages/reporting/pdf` & `GET /api/reports/:id/pdf`).
