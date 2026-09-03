import crypto from 'node:crypto';
import type { NLPResult, Finding } from '@mailiac/shared-types';
import type { ScoreIntentOptions } from './types.js';
import { getRouterConfig } from './config.js';
import { defaultHealthTracker } from './health-tracker.js';
import { routeGeminiRequest } from './router.js';
import { normalizeScore, VALID_INTENTS } from './adapter.js';

export * from './types.js';
export * from './config.js';
export * from './health-tracker.js';
export * from './adapter.js';
export * from './router.js';

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2060-\u2064\u180E]/g;

/**
 * Deterministic local heuristic analysis for English email bodies.
 * Used exclusively as a fallback when Gemini AI is unavailable or fails.
 */
export function heuristicFallback(
  options: ScoreIntentOptions,
  zeroWidthCount: number,
  glassworm: boolean,
  defaultModelName: string = 'gemini-2.5-flash'
): NLPResult {
  const text = options.text || '';
  const subject = options.subject || '';
  const senderDomain = (options.senderDomain || '').toLowerCase();
  const urls = options.urls || [];
  const lower = `${subject} ${text}`.toLowerCase();

  const intents: string[] = [];
  const findings: Finding[] = [];

  let finScore = 0;
  let credScore = 0;
  let urgencyScore = 0;
  let authorityScore = 0;

  // English Urgency & Scarcity Indicators
  const urgencyKeywords = [
    'expiring today',
    'expires today',
    'expiring soon',
    'action required immediately',
    'immediate action',
    'urgent action required',
    'account suspended in 24 hours',
    '24 hours to respond',
    '48 hours to respond',
    'final notice',
    'act now',
    'immediate response required',
  ];

  // English Financial & Reward Lure Indicators
  const finKeywords = [
    'wire transfer',
    'bank account',
    'invoice payment',
    'remittance',
    'bitcoin',
    'gift card',
    'payroll direct deposit',
    'swift code',
    'routing number',
    'points reward',
    'claim reward',
    'unclaimed funds',
  ];

  // English Credential & Harvesting Indicators
  const credKeywords = [
    'password',
    'password reset',
    'verify your account',
    'account suspended',
    'login',
    'login immediately',
    'confirm your identity',
    'sign in',
    'sign in to review',
    'update your credentials',
    'credentials',
    'authentication information',
    'one-time passcode',
    'otp',
  ];

  // English Call-To-Action Keywords
  const ctaKeywords = [
    'click here',
    'redeem now',
    'access portal',
    'click below',
    'sign in now',
    'verify now',
  ];

  // English Authority / Brand Trap Indicators
  const authorityKeywords = [
    'academic cell',
    'placement cell',
    'cfo',
    'dean',
    'director',
    'official notice',
    'human resources',
    'it helpdesk',
    'helpdesk',
    'security team',
  ];

  // Strip full URLs so link query parameters (e.g. ?otpToken=... or &midToken=...) do not false-trigger body keywords
  const proseOnly = lower.replace(/https?:\/\/[^\s]+/gi, ' ');

  const matchesKeyword = (content: string, kw: string): boolean => {
    // For short keywords (<= 4 chars, e.g. 'otp'), require strict word boundaries to prevent false substring collisions
    if (kw.length <= 4) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(content);
    }
    return content.includes(kw);
  };

  const hasUrgency = urgencyKeywords.some((kw) => matchesKeyword(proseOnly, kw));
  if (hasUrgency) {
    intents.push('URGENCY');
    urgencyScore = 80;
    findings.push({
      type: 'HEURISTIC_URGENCY',
      severity: 'HIGH',
      description: 'Urgency detected: message claims immediate action or deadline is required',
    });
  }

  const hasFinancial = finKeywords.some((kw) => matchesKeyword(proseOnly, kw));
  if (hasFinancial) {
    intents.push('FINANCIAL_COERCION');
    finScore = 85;
    findings.push({
      type: 'HEURISTIC_FINANCIAL',
      severity: 'HIGH',
      description: 'Reward or financial lure detected in email text',
    });
  }

  const hasCred = credKeywords.some((kw) => matchesKeyword(proseOnly, kw));
  if (hasCred) {
    intents.push('CREDENTIAL_HARVESTING');
    credScore = 85;
    findings.push({
      type: 'HEURISTIC_CREDENTIAL',
      severity: 'HIGH',
      description: 'Explicit credential harvesting or account verification keywords detected',
    });
  }

  const matchedCta = ctaKeywords.filter((kw) => matchesKeyword(proseOnly, kw));
  if (matchedCta.length > 0 && !hasCred) {
    findings.push({
      type: 'SUSPICIOUS_CALL_TO_ACTION',
      severity: 'MEDIUM',
      description: 'Generic high-risk call-to-action detected in email payload',
    });
  }

  const hasAuthority = authorityKeywords.some((kw) => matchesKeyword(proseOnly, kw));
  if (hasAuthority) {
    intents.push('AUTHORITY_TRAP');
    authorityScore = 75;
    findings.push({
      type: 'HEURISTIC_AUTHORITY',
      severity: 'HIGH',
      description: 'Authority or executive impersonation keywords detected',
    });
  }

  // URL Domain Mismatch / Suspicious External Link Detection (deduplicated per destination domain)
  const domainUrlMap = new Map<string, { domain: string; href: string; anchorTexts: Set<string> }>();
  for (const u of urls) {
    const domain = (u.domain || '').toLowerCase();
    const key = domain || u.href;
    if (!key) continue;

    if (!domainUrlMap.has(key)) {
      domainUrlMap.set(key, { domain, href: u.href, anchorTexts: new Set<string>() });
    }
    if (u.text) {
      domainUrlMap.get(key)!.anchorTexts.add(u.text.trim());
    }
  }

  let linkScore = 0;
  for (const [, urlInfo] of domainUrlMap) {
    const domain = urlInfo.domain;
    if (domain) {
      const isSenderDomainMatch = senderDomain && (domain.endsWith(senderDomain) || senderDomain.endsWith(domain));
      if (!isSenderDomainMatch) {
        if (!intents.includes('SUSPICIOUS_LINK') && !intents.includes('CREDENTIAL_HARVESTING')) {
          intents.push('SUSPICIOUS_LINK');
        }
        linkScore = Math.max(linkScore, 90);
        const anchorList = Array.from(urlInfo.anchorTexts).filter(Boolean);
        const anchorLabel = anchorList.length > 0 ? ` [Anchors: "${anchorList.join('", "')}"]` : '';
        findings.push({
          type: 'SUSPICIOUS_EXTERNAL_LINK',
          severity: 'HIGH',
          description: `Redemption link points to an unrelated external domain (${domain})${anchorLabel}`,
        });
      }
    }
  }

  if (intents.length === 0) {
    intents.push('UNKNOWN');
    findings.push({ type: 'HEURISTIC_UNKNOWN', severity: 'INFO', description: 'No heuristic intent detected' });
  }

  const baseNlp = Math.max(finScore, credScore, urgencyScore, authorityScore, linkScore);
  const nlpScore = Math.min(100, Math.max(0, baseNlp + (glassworm ? 20 : 0)));

  const taggedFindings: Finding[] = findings.map((f) => ({
    ...f,
    source: f.source || 'heuristic',
  }));

  return {
    provider: 'heuristic',
    providerStatus: 'fallback',
    model: defaultModelName,
    fallbackReason: 'Gemini API not invoked (heuristic baseline)',
    intentLabels: intents,
    financialRequestScore: finScore,
    credentialHarvestingScore: credScore,
    glasswormFlag: glassworm,
    zeroWidthCharCount: zeroWidthCount,
    nlpScore,
    confidence: 0.85,
    findings: taggedFindings,
    aiDiagnostics: {
      provider: 'heuristic',
      model: defaultModelName,
      requestAttempted: false,
      requestSucceeded: false,
      responseParsed: false,
      latencyMs: 0,
      fallbackUsed: true,
    },
  };
}

/**
 * Evaluates the intent and risk score of email body text and metadata using Google Gemini AI and/or Heuristic Engine.
 * Multi-Model and Multi-Credential Router with graceful failover:
 * Primary Model -> Alternate Credential -> Fallback Models -> Deterministic Local Heuristics
 */
export async function scoreIntent(
  textOrOptions: string | ScoreIntentOptions,
  timeoutMsOverride?: number
): Promise<NLPResult> {
  const options: ScoreIntentOptions =
    textOrOptions && typeof textOrOptions === 'object' && !Array.isArray(textOrOptions)
      ? (textOrOptions as ScoreIntentOptions)
      : { text: typeof textOrOptions === 'string' ? textOrOptions : '', timeoutMs: timeoutMsOverride };

  const config = getRouterConfig();
  if (options.timeoutMs ?? timeoutMsOverride) {
    config.timeoutPerAttemptMs = options.timeoutMs ?? timeoutMsOverride!;
  }

  const primaryModel = config.models[0]?.name || 'gemini-2.5-flash';
  const text = typeof options.text === 'string' ? options.text : '';
  const subject = options.subject || '';
  const urls = options.urls || [];

  const combinedInput = [subject, text, urls.map((u) => `${u.text || ''} ${u.href}`).join(' ')].join('\n\n').trim();

  const zeroWidthMatches = combinedInput.match(ZERO_WIDTH_REGEX);
  const zeroWidthCharCount = zeroWidthMatches ? zeroWidthMatches.length : 0;
  const glasswormFlag = zeroWidthCharCount > 50;

  const intentInputHash = crypto.createHash('sha256').update(combinedInput).digest('hex').slice(0, 12);

  // Safe Diagnostic Logging (NO body text or PII logged)
  console.info(
    `[ai-intent] Safe Diagnostic: intentInputLength=${combinedInput.length}, intentInputHash=${intentInputHash}, subjectLength=${subject.length}, urlCount=${urls.length}`
  );

  // 1. ALWAYS calculate baseline deterministic local heuristics
  const heuristicResult = heuristicFallback(options, zeroWidthCharCount, glasswormFlag, primaryModel);

  if (!combinedInput) {
    return {
      provider: 'heuristic',
      providerStatus: 'fallback',
      fallbackReason: 'Empty payload provided',
      model: primaryModel,
      intentLabels: ['UNKNOWN'],
      financialRequestScore: 0,
      credentialHarvestingScore: 0,
      glasswormFlag,
      zeroWidthCharCount,
      nlpScore: 0,
      confidence: 1.0,
      findings: [
        { type: 'EMPTY_PAYLOAD', severity: 'INFO', description: 'Email body text was empty', source: 'heuristic' },
      ],
      aiDiagnostics: {
        provider: 'heuristic',
        model: primaryModel,
        requestAttempted: false,
        requestSucceeded: false,
        responseParsed: false,
        latencyMs: 0,
        fallbackUsed: true,
      },
    };
  }

  // 2. Check if any credentials are configured in environment
  if (config.credentials.length === 0) {
    console.warn('[ai-intent] GEMINI_API_KEY missing from process.env, falling back to heuristic classification');
    return {
      ...heuristicResult,
      provider: 'heuristic',
      providerStatus: 'fallback',
      fallbackReason: 'GEMINI_API_KEY missing from process.env',
      aiDiagnostics: {
        provider: 'heuristic',
        model: primaryModel,
        requestAttempted: false,
        requestSucceeded: false,
        responseParsed: false,
        latencyMs: 0,
        fallbackUsed: true,
      },
    };
  }

  // 3. Build Prompt for Gemini
  const prompt = `You are a Lead Cybersecurity Forensic Linguist and threat intelligence analyst. Perform a deep semantic audit on this email (multilingual, including Portuguese/English) to detect Business Email Compromise (BEC), phishing, financial coercion, urgency, reward scams, or credential harvesting.

Subject: ${subject}
Sender Claim: ${options.sender || 'Unknown'}
Sender Domain: ${options.senderDomain || 'Unknown'}
Extracted URLs: ${JSON.stringify(urls)}

Analyze against:
1. URGENCY & SCARCITY (urgency_score): Deadlines, points expiring ("expiram hoje", 24-48h).
2. FINANCIAL COERCION & REWARD LURE (financial_score): Points, miles, wire transfers, discounts ("pontos Livelo", "resgatar").
3. AUTHORITY TRAP & IMPERSONATION (authority_score): Claiming brands (Bradesco, Livelo) from unrelated sender domains.
4. HARVESTING RISK & SUSPICIOUS LINKS (harvesting_score): External links pointing to unrelated third-party domains.

NOTE ON MARKETING: If the intent is clearly "MARKETING" or promotional, standard promotional phrases (e.g., "limited-time", "free rewards") MUST NOT inflate urgency_score or financial_score into the moderate/high tier.

Respond with a single JSON object strictly matching:
{
  "intentLabels": string[], // Applicable from: "FINANCIAL_COERCION", "CREDENTIAL_HARVESTING", "URGENCY", "AUTHORITY_TRAP", "EXTORTION", "MALWARE_LURE", "BENIGN", "MARKETING", "UNKNOWN"
  "urgency_score": number, // 0 to 100
  "financial_score": number, // 0 to 100
  "authority_score": number, // 0 to 100
  "harvesting_score": number, // 0 to 100
  "nlpScore": number, // 0 to 100 composite risk score
  "confidence": number, // 0.0 to 1.0 AI confidence score
  "findings": [{"type": string, "severity": "INFO" | "LOW" | "MEDIUM" | "HIGH", "description": string}]
}

<EMAIL_BODY>
${text.slice(0, 8000)}
</EMAIL_BODY>`;

  const healthTracker = options.healthTracker ?? defaultHealthTracker;

  // 4. Execute Multi-Model, Multi-Key Failover Router
  const routerResult = await routeGeminiRequest(prompt, config, healthTracker);

  if (routerResult.success) {
    const parsed = routerResult.rawResponse;

    const rawLabels =
      Array.isArray(parsed.intentLabels) && parsed.intentLabels.length > 0
        ? parsed.intentLabels.map(String)
        : ['UNKNOWN'];

    let geminiLabels = Array.from(
      new Set(rawLabels.map((label) => (VALID_INTENTS.has(label) ? label : 'UNKNOWN')))
    );
    if (geminiLabels.length > 1) {
      geminiLabels = geminiLabels.filter((label) => label !== 'UNKNOWN');
    }

    const urgencyScore = normalizeScore(parsed.urgency_score);
    const financialScore = normalizeScore(parsed.financial_score ?? parsed.financialRequestScore);
    const authorityScore = normalizeScore(parsed.authority_score);
    const harvestingScore = normalizeScore(parsed.harvesting_score ?? parsed.credentialHarvestingScore);

    let calculatedGeminiNlpScore =
      typeof parsed.nlpScore !== 'undefined'
        ? normalizeScore(parsed.nlpScore)
        : Math.max(urgencyScore, financialScore, authorityScore, harvestingScore);

    calculatedGeminiNlpScore = Math.max(
      calculatedGeminiNlpScore,
      urgencyScore,
      financialScore,
      authorityScore,
      harvestingScore
    );

    const geminiConfidence =
      typeof parsed.confidence === 'number' ? Math.min(1.0, Math.max(0.0, parsed.confidence)) : 0.85;

    const geminiRawFindings: Finding[] = Array.isArray(parsed.findings)
      ? parsed.findings
      : [
          {
            type: 'AI_INTENT_EVALUATION',
            severity: calculatedGeminiNlpScore > 50 ? 'HIGH' : 'LOW',
            description: `AI intent classified as ${geminiLabels.join(', ')}`,
          },
        ];

    const geminiFindings: Finding[] = geminiRawFindings.map((f) => ({
      ...f,
      source: 'gemini',
    }));

    // If failover occurred across routes, append non-sensitive provenance finding
    if (routerResult.trail.length > 1) {
      const priorAttempts = routerResult.trail.slice(0, -1);
      const trailSummary = priorAttempts
        .map((a) => `${a.model} (${a.credentialId}): ${a.error || 'FAILED'}`)
        .join(', ');
      geminiFindings.push({
        type: 'AI_ROUTER_FAILOVER',
        severity: 'INFO',
        description: `Analysis completed after ${priorAttempts.length} failover attempt(s). Prior route failures: [${trailSummary}]. Success route: ${routerResult.model} (${routerResult.credentialId}).`,
        source: 'gemini',
      });
    }

    const finalNlpScore = glasswormFlag ? normalizeScore(calculatedGeminiNlpScore + 20) : calculatedGeminiNlpScore;

    return {
      provider: 'gemini',
      providerStatus: 'success',
      model: routerResult.model,
      intentLabels: geminiLabels,
      financialRequestScore: financialScore,
      credentialHarvestingScore: harvestingScore,
      glasswormFlag,
      zeroWidthCharCount,
      nlpScore: finalNlpScore,
      confidence: geminiConfidence,
      findings: geminiFindings,
      aiDiagnostics: {
        provider: 'gemini',
        model: routerResult.model,
        requestAttempted: true,
        requestSucceeded: true,
        responseParsed: true,
        latencyMs: routerResult.latencyMs,
        fallbackUsed: false,
      },
    };
  }

  // 5. Router exhausted all candidates -> Deterministic Heuristic Fallback
  console.warn(
    `[ai-intent] Gemini failover exhausted (${routerResult.trail.length} attempt(s)), falling back to heuristic fusion: ${routerResult.fallbackReason}`
  );

  const fallbackFindings: Finding[] = [...heuristicResult.findings];
  if (routerResult.trail.length > 0) {
    fallbackFindings.push({
      type: 'AI_ROUTER_EXHAUSTED',
      severity: 'INFO',
      description: routerResult.fallbackReason,
      source: 'heuristic',
    });
  }

  return {
    ...heuristicResult,
    provider: 'heuristic',
    providerStatus: 'fallback',
    model: primaryModel,
    fallbackReason: routerResult.fallbackReason,
    findings: fallbackFindings,
    aiDiagnostics: {
      provider: 'heuristic',
      model: primaryModel,
      requestAttempted: routerResult.trail.length > 0,
      requestSucceeded: false,
      responseParsed: false,
      latencyMs: routerResult.latencyMs,
      fallbackUsed: true,
    },
  };
}
