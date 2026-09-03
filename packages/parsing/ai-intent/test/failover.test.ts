import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scoreIntent, defaultHealthTracker, InMemoryHealthTracker } from '../src/index.js';
import { GoogleGenAI } from '@google/genai';

vi.mock('@google/genai', () => {
  const generateContentMock = vi.fn();
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: generateContentMock,
      },
    })),
  };
});

describe('AI Router Multi-Model & Multi-Credential Failover Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    defaultHealthTracker.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('1. Fails over to second API key when first key hits 429 RESOURCE_EXHAUSTED', async () => {
    process.env['GEMINI_API_KEYS'] = 'test-key-1,test-key-2';
    process.env['GEMINI_MODEL'] = 'gemini-2.5-flash';

    let callCount = 0;
    const capturedApiKeys: string[] = [];

    vi.mocked(GoogleGenAI).mockImplementation(((options: { apiKey: string }) => {
      capturedApiKeys.push(options.apiKey);
      return {
        models: {
          generateContent: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              const err = new Error('Resource has been exhausted (e.g. check quota) 429 RESOURCE_EXHAUSTED');
              (err as unknown as { status: number }).status = 429;
              throw err;
            }
            return {
              text: JSON.stringify({
                intentLabels: ['FINANCIAL_COERCION'],
                financialRequestScore: 90,
                nlpScore: 90,
              }),
            };
          }),
        },
      };
    }) as unknown as typeof GoogleGenAI);

    const result = await scoreIntent('Please wire $25,000 immediately.');

    expect(result.provider).toBe('gemini');
    expect(result.providerStatus).toBe('success');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.intentLabels).toEqual(['FINANCIAL_COERCION']);
    expect(capturedApiKeys).toEqual(['test-key-1', 'test-key-2']);
    expect(result.aiDiagnostics?.fallbackUsed).toBe(false);

    // Provenance finding recorded
    const failoverFinding = result.findings.find((f) => f.type === 'AI_ROUTER_FAILOVER');
    expect(failoverFinding).toBeDefined();
    expect(failoverFinding?.description).toContain('Analysis completed after 1 failover attempt(s)');
  });

  it('2. Fails over to fallback model when primary model hits 503 UNAVAILABLE / high demand', async () => {
    process.env['GEMINI_API_KEY'] = 'test-primary-key';
    process.env['GEMINI_MODEL'] = 'gemini-2.5-flash';
    process.env['GEMINI_FALLBACK_MODELS'] = 'gemini-2.5-flash-lite';

    const capturedModels: string[] = [];

    vi.mocked(GoogleGenAI).mockImplementation((() => ({
      models: {
        generateContent: vi.fn().mockImplementation(async (params: { model: string }) => {
          capturedModels.push(params.model);
          if (params.model === 'gemini-2.5-flash') {
            const err = new Error('503 UNAVAILABLE: This model is currently experiencing high demand.');
            (err as unknown as { status: number }).status = 503;
            throw err;
          }
          return {
            text: JSON.stringify({
              intentLabels: ['CREDENTIAL_HARVESTING'],
              credentialHarvestingScore: 88,
              nlpScore: 88,
            }),
          };
        }),
      },
    })) as unknown as typeof GoogleGenAI);

    const result = await scoreIntent('Sign in now to verify your account.');

    expect(result.provider).toBe('gemini');
    expect(result.providerStatus).toBe('success');
    expect(result.model).toBe('gemini-2.5-flash-lite');
    expect(capturedModels).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
    expect(result.aiDiagnostics?.fallbackUsed).toBe(false);
  });

  it('3. Permanently evicts invalid API key (401/403) and uses subsequent key', async () => {
    process.env['GEMINI_API_KEYS'] = 'revoked-key,healthy-key';
    process.env['GEMINI_MODEL'] = 'gemini-2.5-flash';

    const capturedKeys: string[] = [];

    vi.mocked(GoogleGenAI).mockImplementation(((options: { apiKey: string }) => {
      capturedKeys.push(options.apiKey);
      return {
        models: {
          generateContent: vi.fn().mockImplementation(async () => {
            if (options.apiKey === 'revoked-key') {
              const err = new Error('API key not valid. Please pass a valid API key. 400 API_KEY_INVALID');
              (err as unknown as { status: number }).status = 401;
              throw err;
            }
            return {
              text: JSON.stringify({
                intentLabels: ['BENIGN'],
                nlpScore: 10,
              }),
            };
          }),
        },
      };
    }) as unknown as typeof GoogleGenAI);

    // Call 1: fails on revoked-key, succeeds on healthy-key
    const result1 = await scoreIntent('Hello team meeting tomorrow.');
    expect(result1.provider).toBe('gemini');
    expect(capturedKeys).toEqual(['revoked-key', 'healthy-key']);

    // Call 2: revoked-key is dead, so it should directly attempt healthy-key
    capturedKeys.length = 0;
    const result2 = await scoreIntent('Second message.');
    expect(result2.provider).toBe('gemini');
    expect(capturedKeys).toEqual(['healthy-key']);
  });

  it('4. Falls back to deterministic local heuristics when all candidates fail', async () => {
    process.env['GEMINI_API_KEYS'] = 'key-1,key-2';
    process.env['GEMINI_MODEL'] = 'gemini-2.5-flash';

    vi.mocked(GoogleGenAI).mockImplementation((() => ({
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')),
      },
    })) as unknown as typeof GoogleGenAI);

    const result = await scoreIntent('URGENT: Your password has expired today. Sign in to confirm your identity.');

    expect(result.provider).toBe('heuristic');
    expect(result.providerStatus).toBe('fallback');
    expect(result.fallbackReason).toContain('Gemini failover exhausted');
    expect(result.fallbackReason).toContain('503 Service Unavailable');
    expect(result.aiDiagnostics?.fallbackUsed).toBe(true);
    // Heuristic still correctly flagged the phishing indicators
    expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
    expect(result.credentialHarvestingScore).toBeGreaterThan(0);

    const exhaustedFinding = result.findings.find((f) => f.type === 'AI_ROUTER_EXHAUSTED');
    expect(exhaustedFinding).toBeDefined();
  });

  it('5. Strictly caps maximum external attempts at config.maxAttempts', async () => {
    process.env['GEMINI_API_KEYS'] = 'k1,k2,k3,k4,k5';
    process.env['GEMINI_FALLBACK_MODELS'] = 'm1,m2,m3';
    process.env['GEMINI_MAX_ATTEMPTS'] = '3';

    let totalCalls = 0;
    vi.mocked(GoogleGenAI).mockImplementation((() => ({
      models: {
        generateContent: vi.fn().mockImplementation(async () => {
          totalCalls++;
          throw new Error('Connection reset');
        }),
      },
    })) as unknown as typeof GoogleGenAI);

    await scoreIntent('Sample payload');
    expect(totalCalls).toBe(3); // Capped at exactly 3 attempts
  });

  it('6. Cooldown recovery allows previously rate-limited credential to be probed again', async () => {
    const tracker = new InMemoryHealthTracker();
    tracker.markRateLimited('cred-1', 50); // 50ms cooldown

    expect(tracker.isCredentialAvailable('cred-1')).toBe(false);

    // Wait 60ms for cooldown to expire
    await new Promise((r) => setTimeout(r, 60));

    expect(tracker.isCredentialAvailable('cred-1')).toBe(true);
  });

  it('7. Never exposes raw API keys in findings or fallback reason', async () => {
    const secretKey = 'AIzaSySecretRawKeyDoNotExpose12345';
    process.env['GEMINI_API_KEY'] = secretKey;
    process.env['GEMINI_MODEL'] = 'gemini-2.5-flash';

    vi.mocked(GoogleGenAI).mockImplementation((() => ({
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('429 Resource Exhausted')),
      },
    })) as unknown as typeof GoogleGenAI);

    const result = await scoreIntent('Test email body');

    // Secret must never appear anywhere in the result
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secretKey);
    // Masked credential identifier should be present
    expect(serialized).toContain('cred-1');
  });
});
