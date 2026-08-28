# Mailiac: Advanced Email Forensics Pipeline
**Smart India Hackathon (SIH) 2026 - Project Overview**

## 🎯 What is Mailiac?
**Mailiac** is a high-performance, asynchronous email forensics and threat-hunting platform. It is designed to automatically ingest raw `.eml` files (or connect directly via Gmail API) and dissect them to detect sophisticated phishing, Business Email Compromise (BEC), and display-name spoofing attacks. 

Instead of relying on simple keyword matching, Mailiac fuses **hard cryptographic validation** with **advanced semantic NLP analysis**.

---

## ⚙️ The Forensics Pipeline (Parallel Execution Architecture)
Mailiac operates on a robust, non-blocking asynchronous pipeline. When an email is uploaded, it passes through highly optimized, parallelized analysis phases:

1. **EML Upload / Ingestion:** Secure ingestion of raw `.eml` files or via direct Gmail API integration.
2. **MIME Parse:** Deep structural extraction of headers, body content, and attachments without data corruption.
3. **Parallel Phase 1 (Core Forensics):**
   - **Reverse-Hop Trace:** Network forensics that parses `Received` headers to trace the email back to its *true* originating public IP, exposing hidden proxies.
   - **Crypto Auth:** Strict validation of email authentication protocols (SPF, DKIM, DMARC, and Multi-Hop ARC).
   - **HTML De-cloak:** Scanning the email body for hidden tracking pixels, obfuscated links, and zero-font text designed to trick spam filters.
4. **Parallel Phase 2 (Enrichment & AI):**
   - **NLP Intent Scoring:** Leveraging a **hybrid semantic Natural Language Processing (NLP) pipeline** (Gemini 3.6-flash + heuristics) to read the email's context and detect psychological manipulation, urgency, or financial fraud intent.
   - **GeoIP Enrich & Reputation:** Mapping the origin IP geographically and checking it against threat intelligence databases for bad reputation.
   - **Identity Scoring:** Levenshtein and Jaro-Winkler distances to detect homoglyph attacks and display-name spoofing.
5. **Deterministic Risk Score:** An evidence-based aggregation engine that calculates a final, deterministic Threat/Risk Score based on the previous steps, avoiding brittle AI circuit-breakers.
6. **Persist + Notify + PDF Report:** Securely saving the forensic report to MongoDB, streaming the status back to the frontend dashboard, and generating an immutable forensic PDF report.

---

## 🛠️ Technical Architecture (The Stack)
The project is built as a highly scalable **Turborepo Monorepo** ensuring strict separation of concerns between packages.

- **Frontend:** Next.js (React) Dashboard
- **Backend API & Orchestration:** Node.js, Express (TypeScript Strict Mode)
- **Asynchronous Processing:** BullMQ + Redis (ioredis) for handling heavy forensic jobs without blocking the API.
- **Database:** MongoDB (with Mongoose)
- **Semantic Engine:** Custom NLP module for deep context and intent analysis.
- **Quality Assurance:** Vitest for comprehensive unit testing across all modules.

---

## 💡 Key Selling Points for the Pitch (PPT Highlights)
- **Scalable by Design:** The use of **BullMQ** means the system can handle thousands of emails concurrently without crashing.
- **Hybrid Threat Detection:** It doesn’t just look at code; it reads the email. By combining **Reverse-Hop tracing** with **NLP Intent Scoring**, Mailiac catches advanced BEC attacks that traditional filters miss.
- **Enterprise-Grade Architecture:** Built using a monorepo structure with strict TypeScript contracts (`packages/shared-types`), mimicking how top-tier tech companies structure their codebases. 
- **Evidence-Based:** The risk engine avoids brittle "circuit breakers" in favor of deterministic, evidence-based corroboration (e.g., a bad IP + manipulative semantic intent = High Risk).
