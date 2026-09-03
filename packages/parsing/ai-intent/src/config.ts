import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CredentialEntry, ModelEntry, RouterConfig } from './types.js';

export function loadEnvFallback(): void {
  if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') return;
  if (process.env['GEMINI_API_KEY'] || process.env['GEMINI_API_KEYS']) return;
  try {
    let currentDir = process.cwd();
    while (currentDir && currentDir !== path.parse(currentDir).root) {
      const candidate = path.join(currentDir, '.env');
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch {
    // Ignore fallback loading errors
  }
}

export function parseCredentialsFromEnv(): CredentialEntry[] {
  loadEnvFallback();
  const rawKeys: string[] = [];

  // 1. Check GEMINI_API_KEYS (comma or newline separated list)
  const listVar = process.env['GEMINI_API_KEYS'];
  if (listVar) {
    const split = listVar.split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
    rawKeys.push(...split);
  }

  // 2. Check numbered GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
  for (let i = 1; i <= 10; i++) {
    const numKey = process.env[`GEMINI_API_KEY_${i}`];
    if (numKey && numKey.trim()) {
      rawKeys.push(numKey.trim());
    }
  }

  // 3. Fallback to legacy GEMINI_API_KEY if no keys found yet or add if not already present
  const singleKey = process.env['GEMINI_API_KEY'];
  if (singleKey && singleKey.trim()) {
    rawKeys.push(singleKey.trim());
  }

  // Deduplicate keys while preserving order
  const uniqueKeys = Array.from(new Set(rawKeys));

  return uniqueKeys.map((apiKey, idx) => {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 6);
    const id = `cred-${idx + 1}`;
    const maskedId = `${id}-${hash}`;
    return {
      id,
      apiKey,
      maskedId,
    };
  });
}

export function parseModelsFromEnv(): ModelEntry[] {
  loadEnvFallback();
  const rawModels: string[] = [];

  // 1. Check GEMINI_MODELS (comma-separated list)
  const modelsList = process.env['GEMINI_MODELS'];
  if (modelsList) {
    rawModels.push(...modelsList.split(',').map((m) => m.trim()).filter(Boolean));
  } else if (process.env['GEMINI_FALLBACK_MODELS']) {
    // 2. Primary model + fallback models
    const primary = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.1-flash-lite';
    rawModels.push(primary);
    rawModels.push(...process.env['GEMINI_FALLBACK_MODELS'].split(',').map((m) => m.trim()).filter(Boolean));
  } else if (process.env['GEMINI_MODEL']?.trim()) {
    // 3. Single model
    rawModels.push(process.env['GEMINI_MODEL'].trim());
  } else {
    // 4. Default primary model
    rawModels.push('gemini-3.1-flash-lite');
  }

  const uniqueModels = Array.from(new Set(rawModels));
  return uniqueModels.map((name, idx) => ({
    name,
    priority: idx + 1,
  }));
}

export function getRouterConfig(): RouterConfig {
  loadEnvFallback();

  const credentials = parseCredentialsFromEnv();
  const models = parseModelsFromEnv();

  const maxAttempts = Math.max(1, Math.min(6, Number(process.env['GEMINI_MAX_ATTEMPTS'] ?? 3)));
  const timeoutPerAttemptMs = Math.max(2000, Math.min(30000, Number(process.env['GEMINI_TIMEOUT_PER_ATTEMPT_MS'] ?? 8000)));
  const cooldown429Ms = Math.max(5000, Number(process.env['GEMINI_COOLDOWN_429_MS'] ?? 60000));
  const cooldown503Ms = Math.max(5000, Number(process.env['GEMINI_COOLDOWN_503_MS'] ?? 120000));

  return {
    credentials,
    models,
    maxAttempts,
    timeoutPerAttemptMs,
    cooldown429Ms,
    cooldown503Ms,
  };
}
