# Mailiac: Deep Dive Architecture & Deterministic Threat Engine

## 1. Executive Summary

**Mailiac** is an enterprise-grade, highly-scalable email forensics pipeline designed to dissect and neutralize advanced email threats such as Business Email Compromise (BEC), phishing, and display-name spoofing. Built as a strict Turborepo monorepo, Mailiac operates a robust, non-blocking asynchronous 9-step pipeline.

A core differentiator of Mailiac is its **Deterministic Risk Engine**. Unlike naive AI-based security products that simply forward an entire email payload to an LLM and blindly trust the result, Mailiac treats semantic AI analysis as just *one* input out of four independent data pillars. By fusing hard cryptographic validation with sandboxed, strongly-typed semantic intent scoring, Mailiac eliminates AI hallucinations, prevents prompt injection bypasses, and provides highly reliable, deterministic threat scores.

---

## 2. Monorepo Architecture Overview

Mailiac is built using a modern **Turborepo** structure, strictly separating concerns to ensure modularity, type-safety, and testability across the suite.

### Packages & Libraries
- **`packages/shared-types`**: The immutable, frozen data contract for the entire pipeline. It enforces strict TypeScript interfaces (e.g., `RiskMatrix`, `NLPResult`, `ForensicHop`) ensuring all modules speak the same language.
- **`packages/parsing/*`**: 
  - `mime`: Securely extracts headers, bodies, and attachments without data corruption.
  - `geoip`: Maps IPs to geographic locations.
  - `decloak`: Scans HTML bodies for zero-width characters and hidden tracking pixels.
  - `ai-intent`: Houses the hybrid semantic engine (Gemini API + Local Heuristics).
- **`packages/scoring/*`**:
  - `auth`: Cryptographically verifies SPF, DKIM, and DMARC.
  - `identity`: Uses Levenshtein and Jaro-Winkler distances to detect homoglyph attacks and display-name spoofing.
  - `ip-reputation`: Analyzes infrastructure and proxy usage.
  - `reverse-hop`: Traces email routing paths back to the true originating public IP.
  - `risk-engine`: The deterministic aggregator that calculates the final threat score.

### Applications
- **`apps/api`**: Express.js REST API handling inbound requests and BullMQ job enqueuing.
- **`apps/worker`**: The background BullMQ worker that robustly executes the 9-step pipeline independently.
- **`apps/web`**: The Next.js React frontend dashboard for visualizing the `AnalysisReport`.

---

## 3. The 9-Step Forensics Pipeline

1. **EML Upload / Ingestion**: Raw RFC 822 messages are ingested either via file upload or the Gmail API.
2. **MIME Parse**: Extracts metadata and separates attachments securely.
3. **Reverse-Hop Trace**: Parses `Received` headers from top to bottom to identify the exact evidence boundary (the handoff from a private internal network to a public relay) and extracts the true originating IP.
4. **Crypto Auth**: Mathematically validates the integrity of the email via DKIM signatures and SPF alignments.
5. **GeoIP Enrich & Reputation**: Evaluates the originating IP against threat intelligence for VPNs, proxies, and abuse reports.
6. **HTML De-cloak**: Exposes evasion tactics like "glassworm" attacks (using zero-width non-printing characters).
7. **NLP Intent Scoring**: Analyzes the semantic context of the email for urgency, coercion, and financial lures using a hybrid AI/Heuristic approach.
8. **4-Pillar Risk Score**: The Risk Engine deterministically aggregates the data.
9. **Persist + Notify**: The rich, JSON-structured report is persisted to MongoDB and rendered on the frontend.

---

## 4. Why Mailiac is Deterministic (And Better Than Pure LLM Solutions)

Many modern security tools mistakenly treat Large Language Models (LLMs) as "magic boxes", passing them an entire email and relying on their non-deterministic output to make a final security decision. This approach is highly vulnerable to hallucinations, inconsistency, and prompt-injection attacks.

Mailiac takes a strictly deterministic approach. Here is why Mailiac's architecture is vastly superior to pure LLM scanners:

### A. The Risk Engine is a Multi-Pillar Corroborator, Not an LLM
Mailiac distributes its trust across four distinct pillars, heavily weighting mathematical and cryptographic evidence:
- **Identity Authentication (35%)**: Hard algorithmic distance (Levenshtein, Jaro-Winkler).
- **Cryptographic Auth (20%)**: Binary signature validation (DKIM, SPF).
- **Infrastructure (10%)**: IP reputation and ASN analysis.
- **NLP Semantic Intent (35%)**: The only pillar that relies on an LLM.

Because the AI's weight is capped at 35%, an LLM hallucinating that a legitimate email is a threat *cannot* unilaterally quarantine an email if the cryptographic and identity pillars are pristine. 

### B. Strict Evidence-Based Circuit Breakers
Instead of brittle thresholding, the `risk-engine` evaluates explicit high-confidence evidence conditions (`C1-C4`). It explicitly counts "strong signals" (scores $\ge 70$) across independent pillars.
For an email to be quarantined, it must satisfy multi-variable conditions, such as:
- **C1 (Definite Phishing):** High Identity Spoofing (`$\ge 85$`) AND Cryptographic Failure (`$\ge 70$`).
- **C2 (Malicious Deception):** High Identity Spoofing (`$\ge 85$`) AND High Malicious Intent (`$\ge 70$`).
- **C3 (Multi-Pillar Consensus):** At least 3 independent pillars showing strong threat signals.

This deterministic logic completely removes the unpredictability of AI.

### C. The AI is Sandboxed and Constrained
When Mailiac does use Gemini 3.1 Flash-Lite, it tightly constraints the output format to a strict JSON interface (`RawGeminiNLPResponse`). It asks the AI to output individual scores (e.g., `urgency_score`, `financial_score`) rather than making a final decision. Mailiac's code then mathematically sanitizes, clamps, and parses these scores. 

### D. Graceful Degradation and Local Heuristics
If the Gemini API times out, fails, or is unavailable, Mailiac *never crashes*. The `ai-intent` package immediately falls back to a **Deterministic Local Heuristic Engine**. This heuristic engine scans for English-language urgency, financial coercion, and credential harvesting keywords, and applies rigid, predefined penalty scores. 

### E. Immune to AI Blindspots
LLMs are notoriously bad at correctly interpreting complex email routing paths (`Received` headers) and verifying digital signatures. An LLM might be tricked by a spoofed `From` header if it sounds convincing. Mailiac uses deterministic code (`packages/scoring/reverse-hop` and `auth`) for technical metadata, utilizing AI *only* for what it is good at: reading the human context of the email body.

---

## 5. Conclusion
By confining AI to a heavily sanitized, strictly-typed module within a wider ecosystem of cryptographic checks and deterministic math, Mailiac provides the best of both worlds: the semantic intelligence of an LLM, combined with the unerring consistency, security, and predictability of enterprise software engineering.
