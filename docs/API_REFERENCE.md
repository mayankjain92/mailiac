# 🔌 Mailiac API Reference Specification

The **Mailiac REST API** provides endpoints for email ingestion (manual `.eml` upload and connected Gmail account), job status monitoring, full forensic reports, binary PDF export, Server-Sent Events (SSE) telemetry, and webhook dispatch.

- **Default Base URL:** `http://localhost:4000`
- **Response Format:** JSON (`application/json`) unless specified (e.g. PDF streams).
- **Authentication:** Dual mode: Public/Session-based for prototype demo; OAuth 2.0 Bearer tokens for connected Gmail sessions.

---

## 📑 Summary of Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a raw `.eml` file to trigger forensic analysis |
| `GET` | `/api/jobs/:id` | Poll processing status of an asynchronous forensic job |
| `GET` | `/api/reports/history` | List recent analysis records with pagination, source, and verdict filters |
| `GET` | `/api/reports/:id` | Fetch the full canonical forensic `AnalysisReport` JSON |
| `GET` | `/api/reports/:id/pdf` | Download the immutable binary forensic report (`%PDF-1.4`) |
| `POST` | `/api/reports/:id/reanalyze` | Re-run full forensic pipeline for an existing case in-place |
| `POST` | `/api/reports/:id/feedback` | Upsert human-in-the-loop analyst feedback and accuracy ratings |
| `GET` | `/api/reports/:id/feedback` | Retrieve previously submitted SOC analyst feedback |
| `GET` | `/api/notify/events/:jobId` | Stream real-time pipeline execution events via SSE |
| `POST` | `/api/notify/webhook` | Internal dispatch helper for HMAC-signed webhook delivery |
| `GET` | `/api/gmail/auth/url` | Generate Google OAuth 2.0 authorization URL |
| `GET` | `/api/gmail/auth/callback` | Handle OAuth 2.0 code exchange and redirect to frontend |
| `GET` | `/api/gmail/status` | Check if a Gmail account is connected for current session |
| `GET` | `/api/gmail/messages` | List recent Gmail messages with analysis badges |
| `POST` | `/api/gmail/messages/:messageId/analyze` | Fetch raw RFC 822 MIME from Gmail and trigger analysis |
| `DELETE` | `/api/gmail/disconnect` | Revoke Google OAuth tokens and clear session |

---

## 1. Email Ingestion & Job Management

### `POST /api/upload`
Uploads a raw RFC 822 `.eml` email file and enqueues it for asynchronous 9-step forensic analysis in BullMQ.

- **Content-Type:** `multipart/form-data`
- **Form Field:** `file` (Max size: 20MB, accepted extensions: `.eml`, `.msg`, `.txt`)

#### Request Example (cURL)
```bash
curl -X POST http://localhost:4000/api/upload \
  -F "file=@/path/to/suspicious_phish.eml"
```

#### Response (`202 Accepted`)
```json
{
  "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
  "status": "queued",
  "message": "EML uploaded successfully and queued for analysis."
}
```

#### Error Responses
- `400 Bad Request`: Missing file or unsupported MIME type.
- `413 Payload Too Large`: Uploaded file exceeds 20MB.

---

### `GET /api/jobs/:id`
Retrieves the execution status of an enqueued or running forensic job.

- **Parameters:** `id` (string) — The BullMQ `jobId` returned from upload/analyze.

#### Request Example
```bash
curl http://localhost:4000/api/jobs/3afe8fdf-8dc7-43a5-a26f-c339a7e34abb
```

#### Response (`200 OK`)
```json
{
  "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
  "status": "completed",
  "progress": 100,
  "result": {
    "reportId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
    "finalScore": 88,
    "verdict": "QUARANTINE"
  }
}
```
*Possible `status` values:* `'queued' | 'processing' | 'completed' | 'failed'`

---

## 2. Forensic Reports & PDF Export

### `GET /api/reports/:id`
Fetches the complete, strongly-typed `AnalysisReport` object including the 4-pillar risk matrix, reverse-hop path, cryptographic auth status, and NLP summary.

- **Parameters:** `id` (string) — The `messageId` / `jobId` of the analyzed email.

#### Request Example
```bash
curl http://localhost:4000/api/reports/3afe8fdf-8dc7-43a5-a26f-c339a7e34abb
```

#### Response (`200 OK`)
```json
{
  "messageId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
  "senderDomain": "paypa1-security.com",
  "timestamp": "2026-08-29T20:26:28.123Z",
  "executionTimeMs": 412,
  "forensicPath": [
    {
      "ip": "185.220.101.5",
      "hostnameClaimed": "mail.tor-exit.net",
      "ptrValid": true,
      "isPrivate": false,
      "city": "Frankfurt",
      "country": "Germany",
      "coordinates": [50.1109, 8.6821],
      "asn": "AS206238",
      "trusted": false
    }
  ],
  "authResults": {
    "spf": "fail",
    "dkim": "fail",
    "dmarcAlignment": "fail",
    "arcPass": false,
    "authScore": 90,
    "findings": [
      {
        "type": "AUTH_FAILURE",
        "severity": "HIGH",
        "description": "SPF and DKIM verification failed for paypa1-security.com"
      }
    ]
  },
  "riskMatrix": {
    "authScore": 90,
    "identityScore": 95,
    "ipScore": 80,
    "nlpScore": 85,
    "finalScore": 92,
    "pillars": {
      "authentication": { "score": 90, "weight": 0.20, "findings": [] },
      "identity": { "score": 95, "weight": 0.35, "findings": [] },
      "infrastructure": { "score": 80, "weight": 0.10, "findings": [] },
      "nlp": { "score": 85, "weight": 0.35, "findings": [] }
    }
  },
  "aiSummary": {
    "provider": "gemini",
    "providerStatus": "success",
    "model": "gemini-3.6-flash",
    "urgency": 85,
    "intent": ["CREDENTIAL_HARVESTING", "FINANCIAL_URGENCY"],
    "integrityHash": "9ef779764a1f87c1...",
    "confidence": 0.94,
    "findings": []
  }
}
```

---

### `GET /api/reports/history`
Returns a paginated list of recent email forensic analysis records with optional filtering by ingestion source and final verdict.

- **Query Parameters:**
  - `source` *(optional)*: Filter by origin (`eml` | `gmail`).
  - `verdict` *(optional)*: Filter by risk outcome (`QUARANTINE` | `FLAG` | `SAFE`).
  - `limit` *(optional, default: 50, max: 100)*: Number of records to return.

#### Request Example
```bash
curl "http://localhost:4000/api/reports/history?verdict=QUARANTINE&source=eml&limit=20"
```

#### Response (`200 OK`)
```json
{
  "records": [
    {
      "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
      "source": "eml",
      "subject": "Urgent: Your PayPal Account is Restricted",
      "sender": "PayPal Support <security@paypa1-security.com>",
      "senderDomain": "paypa1-security.com",
      "finalScore": 92,
      "verdict": "QUARANTINE",
      "createdAt": "2026-08-29T20:26:28.123Z"
    }
  ]
}
```

---

### `GET /api/reports/:id/pdf`
Generates and downloads an immutable, zero-dependency PDF 1.4 forensic report for legal, compliance, and SOC archiving purposes.

- **Parameters:** `id` (string) — `messageId` / `jobId`
- **Response Headers:**
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="forensic-report-[id].pdf"`

#### Request Example
```bash
curl -O -J http://localhost:4000/api/reports/3afe8fdf-8dc7-43a5-a26f-c339a7e34abb/pdf
```

---

### `POST /api/reports/:id/reanalyze`
Re-runs the full 9-step asynchronous forensic pipeline for an existing case in-place without generating duplicate database records.

- **Parameters:** `id` (string) — `messageId` / `jobId` of the existing analysis report.
- **Payload Recovery Strategy:**
  1. Checks `RawEmailModel` in MongoDB for the original MIME buffer.
  2. Falls back to Redis BullMQ job data payload if present.
  3. If sourced from Gmail and buffer is absent, automatically re-fetches the RFC 822 stream using saved OAuth credentials.
- **Concurrency Protection:** If re-analysis is already in-flight for this case, returns `409 Conflict`.

#### Request Example
```bash
curl -X POST http://localhost:4000/api/reports/3afe8fdf-8dc7-43a5-a26f-c339a7e34abb/reanalyze
```

#### Response (`202 Accepted`)
```json
{
  "success": true,
  "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
  "messageId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
  "status": "queued",
  "message": "Forensic re-analysis scheduled. Results will update in-place upon completion."
}
```

#### Error Responses
- `400 Bad Request`: Missing or invalid Report ID.
- `404 Not Found`: Case does not exist.
- `409 Conflict`: Case is already queued or actively being analyzed.
- `422 Unprocessable Entity`: Original email payload is no longer recoverable in storage.

---

### `POST /api/reports/:id/feedback`
Submits human-in-the-loop analyst feedback or end-user ground truth verification for active learning and classification audit.

- **Parameters:** `id` (string) — Case `jobId`.
- **Request Body (JSON):**
  - `feedbackMode` *(string, optional)*: `'expert'` (SOC analyst) or `'user'` (end-user). Default `'expert'`.
  - `analystVerdict` *(string, required)*:
    `'CONFIRMED_TRUE_POSITIVE' | 'CONFIRMED_TRUE_NEGATIVE' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'MISCLASSIFIED_SEVERITY' | 'USER_ACCURATE' | 'USER_FALSE_ALARM' | 'USER_MISSED_THREAT' | 'USER_UNSURE'`
  - `actualThreatCategory` *(string, optional)*: Ground-truth threat (e.g. `'CREDENTIAL_HARVESTING'`, `'BEC'`, `'BENIGN'`).
  - `pillarAccuracy` *(object, optional)*: Accuracy ratings per pillar (`{ auth: boolean, identity: boolean, ip: boolean, nlp: boolean }`).
  - `suggestedScore` *(number, optional)*: Analyst recommended score (0–100).
  - `notes` *(string, optional)*: Detailed investigation notes.

#### Request Example
```bash
curl -X POST http://localhost:4000/api/reports/3afe8fdf-8dc7-43a5-a26f-c339a7e34abb/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedbackMode": "expert",
    "analystVerdict": "CONFIRMED_TRUE_POSITIVE",
    "actualThreatCategory": "CREDENTIAL_HARVESTING",
    "suggestedScore": 95,
    "notes": "Verified homoglyph attack spoofing PayPal login page via lookalike domain."
  }'
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "feedback": {
    "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
    "feedbackMode": "expert",
    "analystVerdict": "CONFIRMED_TRUE_POSITIVE",
    "actualThreatCategory": "CREDENTIAL_HARVESTING",
    "suggestedScore": 95,
    "notes": "Verified homoglyph attack spoofing PayPal login page via lookalike domain."
  }
}
```

---

### `GET /api/reports/:id/feedback`
Retrieves previously submitted SOC analyst feedback for a specific forensic report.

- **Parameters:** `id` (string) — Case `jobId`.

#### Response (`200 OK`)
```json
{
  "feedback": {
    "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
    "analystVerdict": "CONFIRMED_TRUE_POSITIVE",
    "suggestedScore": 95,
    "updatedAt": "2026-08-29T20:45:00.000Z"
  }
}
```

---

## 3. Real-Time Telemetry & Webhooks

### `GET /api/notify/events/:jobId`
Server-Sent Events (SSE) stream delivering fine-grained progress updates as the worker advances through pipeline stages.

#### Stream Events
```text
event: progress
data: {"stage":"PARSING_MIME","progress":15}

event: progress
data: {"stage":"PHASE_1_CORE_FORENSICS","progress":45}

event: progress
data: {"stage":"PHASE_2_ENRICHMENT_AI","progress":80}

event: completed
data: {"jobId":"3afe8fdf-8dc7-43a5-a26f-c339a7e34abb","verdict":"QUARANTINE","finalScore":92}
```

---

## 4. Gmail Dual-Ingestion Integration

Mailiac enables secure Google Workspace / Gmail OAuth 2.0 integration to inspect inbox messages on-demand.

### `GET /api/gmail/auth/url`
Generates the Google OAuth 2.0 consent URL requesting least-privilege `gmail.readonly` scope.

#### Response (`200 OK`)
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly..."
}
```

---

### `GET /api/gmail/status`
Checks if the current session has an authenticated, connected Gmail account.

#### Response (`200 OK`)
```json
{
  "connected": true,
  "email": "analyst@target-corp.com"
}
```

---

### `GET /api/gmail/messages`
Retrieves a paginated list of recent Gmail messages from the user's inbox, enriched with analysis status if already scanned.

- **Query Parameters:**
  - `q` *(optional)*: Gmail search query (e.g. `is:unread`, `from:paypal`, `has:attachment`)
  - `pageToken` *(optional)*: Pagination token for next page

#### Response (`200 OK`)
```json
{
  "messages": [
    {
      "id": "18e19c92fa32b001",
      "threadId": "18e19c92fa32b001",
      "sender": "Security Alerts <alert@paypa1-security.com>",
      "subject": "Urgent: Unusual sign-in activity detected",
      "snippet": "Your account has been temporarily restricted. Please verify immediately...",
      "date": "2026-08-29T19:40:00.000Z",
      "analyzed": true,
      "jobId": "3afe8fdf-8dc7-43a5-a26f-c339a7e34abb",
      "finalScore": 92,
      "verdict": "QUARANTINE"
    }
  ],
  "nextPageToken": "CDA091244..."
}
```

---

### `POST /api/gmail/messages/:messageId/analyze`
Fetches the raw RFC 822 MIME byte stream (`format: 'raw'`) for the specified message ID and kicks off the 9-step analysis pipeline.

- **Parameters:** `messageId` (string) — Gmail Message ID.

#### Response (`202 Accepted`)
```json
{
  "jobId": "d9202417-29fa-4fd9-a514-9778eec0aef9",
  "gmailMessageId": "18e19c92fa32b001",
  "status": "queued"
}
```

---

### `DELETE /api/gmail/disconnect`
Revokes active Google tokens and removes the associated session record from MongoDB.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Gmail account disconnected successfully."
}
```

---

## 5. Multi-Model AI Router & Failover Configuration

The AI Intent Scoring stage (`@mailiac/parsing-ai-intent`) features an enterprise-grade failover router designed to handle Google GenAI quota limits, temporary demand spikes, and model deprecations without pipeline disruption.

### Environment Configuration Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | String | *(None)* | Primary Gemini API key. |
| `GEMINI_API_KEYS` | String (CSV) | *(None)* | Comma-separated list of fallback API keys for quota rotation. |
| `GEMINI_API_KEY_1` .. `_10` | String | *(None)* | Individual numbered credential slots. |
| `GEMINI_MODEL` | String | `gemini-3.1-flash-lite` | Primary LLM model used for intent scoring. |
| `GEMINI_FALLBACK_MODELS` | String (CSV) | `gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash` | Comma-separated list of fallback models tried in sequence. |
| `GEMINI_MODELS` | String (CSV) | *(None)* | Alternative single ordered priority list overriding `GEMINI_MODEL` + `GEMINI_FALLBACK_MODELS`. |
| `GEMINI_MAX_ATTEMPTS` | Number | `3` (Range: 1–6) | Total attempt cap across all (model, key) candidate pairs before falling back to heuristics. |
| `GEMINI_TIMEOUT_PER_ATTEMPT_MS` | Number | `8000` (Range: 2000–30000) | Per-call HTTP timeout before triggering next candidate route. |
| `GEMINI_COOLDOWN_429_MS` | Number | `60000` | Cooldown period applied to a credential that receives HTTP 429 quota exhaustion. |
| `GEMINI_COOLDOWN_503_MS` | Number | `120000` | Cooldown period applied to a model that receives HTTP 503 high-demand errors. |

### Telemetry Findings in Forensic Reports

When the AI router interacts with external Google APIs, it emits structured non-sensitive provenance findings in `AnalysisReport.aiSummary.findings`:

1. **`AI_ROUTER_FAILOVER`** (`severity: 'INFO'`):
   Appended whenever analysis succeeded after 1 or more failed attempts on prior models/keys:
   ```json
   {
     "type": "AI_ROUTER_FAILOVER",
     "severity": "INFO",
     "description": "Analysis completed after 1 failover attempt(s). Prior route failures: [gemini-3.5-flash (cred-1-48592f): 503 UNAVAILABLE]. Success route: gemini-3.1-flash-lite (cred-1-48592f).",
     "source": "gemini"
   }
   ```

2. **`AI_ROUTER_EXHAUSTED`** (`severity: 'INFO'`):
   Appended when all configured models/keys are rate-limited, unavailable, or timed out. The pipeline automatically falls back to local deterministic heuristic fusion:
   ```json
   {
     "type": "AI_ROUTER_EXHAUSTED",
     "severity": "INFO",
     "description": "Gemini failover exhausted (4 attempts): [gemini-3.1-flash-lite / cred-1: TIMEOUT -> gemini-3.5-flash / cred-1: 503 UNAVAILABLE...]",
     "source": "heuristic"
   }
   ```

