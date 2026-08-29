# 🏆 Mailiac: Advanced AI Email Forensics & Threat Hunting Pipeline
**Smart India Hackathon (SIH) 2026 — Project Overview & Pitch Guide**

---

## 🎯 1. What is Mailiac?

**Mailiac** is a high-performance, asynchronous email forensics and threat-hunting platform. It is engineered to automatically ingest raw `.eml` files or connect directly to Google Workspace via on-demand Gmail OAuth 2.0, dissecting messages to detect sophisticated phishing, Business Email Compromise (BEC), lookalike domain spoofing, and zero-width evasion attacks.

Instead of relying on naive keyword filters or blindly trusting non-deterministic LLMs, Mailiac fuses **hard cryptographic validation** with a **deterministic 4-pillar risk corroboration engine**.

---

## ⚙️ 2. The 9-Step Forensics Pipeline

Mailiac runs an optimized, non-blocking asynchronous pipeline driven by BullMQ and Redis:

1. **Dual Ingestion Layer:** Manual `.eml` file upload (20MB buffer) or 1-click on-demand Gmail API message fetch.
2. **MIME Deconstruction:** Secure structural extraction of headers, body content, and SHA-256 attachment hashes via `postal-mime`.
3. **Parallel Phase 1 (Core Forensics):**
   - **Reverse-Hop Trace:** Parses `Received` headers to identify the true evidence boundary and reveal hidden proxy relays.
   - **Crypto Auth:** Mathematical validation of SPF, DKIM (RSA/Ed25519), DMARC alignment, and Multi-Hop ARC chains.
   - **HTML Glassworm De-cloak:** Unmasks zero-width Unicode characters, hidden font-size:0 text, and obfuscated URLs.
4. **Parallel Phase 2 (Enrichment & Semantic Intelligence):**
   - **Semantic AI Intent:** Leverages **Google Gemini 3.6-flash** with strict JSON schemas and deterministic local keyword regex fallback for psychological urgency and financial coercion detection.
   - **GeoIP & ASN Enrichment:** Maps originating IP hops geographically and annotates network trust.
   - **IP Threat Reputation:** Evaluates AbuseIPDB threat confidence scores, Tor exit nodes, and timezone drift.
   - **Identity Spoofing Defense:** Calculates Levenshtein, Damerau-Levenshtein, and Jaro-Winkler distances against protected domain watchlists.
5. **Deterministic 4-Pillar Risk Corroboration:** Fuses the 4 pillars (Identity 35%, AI Intent 35%, Crypto 20%, Infrastructure 10%) enforcing rigid evidence rules ($C_1 - C_4$).
6. **Persist & Telemetry:** Saves canonical reports to MongoDB (with 24h TTL), streams real-time SSE updates, and generates an immutable binary PDF 1.4 report.

---

## 🛠️ 3. Enterprise Technical Architecture

The project is built as a highly scalable **Turborepo monorepo** with strict separation of concerns:

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Recharts risk breakdown, Leaflet geographic hop map, and Gmail inbox drawer.
- **Backend API:** Express.js, TypeScript strict mode, Multer multipart handling, Google OAuth 2.0 client.
- **Asynchronous Queue:** BullMQ + Redis for non-blocking forensic job execution.
- **Database:** MongoDB Atlas + Mongoose with automated 24h TTL index pruning and re-analysis deduplication.
- **Quality Assurance:** 100% Vitest coverage across 28 test suites, 0 TypeScript compilation errors.

---

## 💡 4. Key Pitch Highlights & Selling Points (For Hackathon Judges)

1. **Deterministic Over Pure LLMs:** LLMs hallucinate and can be bypassed via prompt injection. Mailiac treats AI as only one sandboxed input (capped at 35%), mathematically corroborated by cryptographic signatures and string distance algorithms.
2. **Dual-Ingestion Coexistence:** Users can drag-and-drop raw `.eml` files or connect their Gmail account to scan suspicious inbox messages in 1 click without downloading full inboxes.
3. **Evidence Boundary Network Forensics:** Traces multi-hop email routing headers backwards to distinguish trusted internal corporate networks from untrusted public relays.
4. **Zero-Downtime Resilience:** Every external API call (Gemini, GeoIP, AbuseIPDB) is wrapped with strict timeouts and local deterministic fallbacks—the pipeline never hangs.
5. **SOC-Ready PDF Generation:** Built-in zero-dependency PDF 1.4 binary stream generator producing immutable forensic evidence documentation.
