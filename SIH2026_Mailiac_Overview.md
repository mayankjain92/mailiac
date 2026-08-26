# Mailiac: Advanced Email Forensics Pipeline
**Smart India Hackathon (SIH) 2026 - Project Overview**

## 🎯 What is Mailiac?
**Mailiac** is a high-performance, asynchronous email forensics and threat-hunting platform. It is designed to automatically ingest raw `.eml` files (or connect directly via Gmail API) and dissect them to detect sophisticated phishing, Business Email Compromise (BEC), and display-name spoofing attacks. 

Instead of relying on simple keyword matching, Mailiac fuses **hard cryptographic validation** with **advanced semantic NLP analysis**.

---

## ⚙️ The 9-Step Forensics Pipeline
Mailiac operates on a robust, non-blocking asynchronous pipeline. When an email is uploaded, it passes through 9 distinct analysis stages:

1. **EML Upload / Ingestion:** Secure ingestion of raw `.eml` files or via direct Gmail API integration.
2. **MIME Parse:** Deep structural extraction of headers, body content, and attachments without data corruption.
3. **Reverse-Hop Trace:** Network forensics that parses `Received` headers to trace the email back to its *true* originating public IP, exposing hidden proxies.
4. **Crypto Auth:** Strict validation of email authentication protocols (SPF, DKIM, DMARC, and Multi-Hop ARC).
5. **GeoIP Enrich & Reputation:** Mapping the origin IP geographically and checking it against threat intelligence databases for bad reputation.
6. **HTML De-cloak:** Scanning the email body for hidden tracking pixels, obfuscated links, and zero-font text designed to trick spam filters.
7. **NLP Intent Scoring:** Leveraging a **semantic Natural Language Processing (NLP) pipeline** to read the email's context and detect psychological manipulation, urgency, or financial fraud intent.
8. **4-Pillar Risk Score:** An evidence-based aggregation engine that calculates a final, deterministic Threat/Risk Score based on the previous steps.
9. **Persist + Notify:** Securely saving the forensic report to the database and streaming the status back to the frontend dashboard.

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
