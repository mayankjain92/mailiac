import type { AIHealthTracker } from './types.js';

export class InMemoryHealthTracker implements AIHealthTracker {
  private credentialCooldowns = new Map<string, number>();
  private modelCooldowns = new Map<string, number>();
  private revokedCredentials = new Set<string>();
  private invalidModels = new Set<string>();
  private consecutiveFailures = new Map<string, number>();

  isCredentialAvailable(id: string): boolean {
    if (this.revokedCredentials.has(id)) {
      return false;
    }
    const cooldownUntil = this.credentialCooldowns.get(id);
    if (!cooldownUntil) {
      return true;
    }
    if (Date.now() >= cooldownUntil) {
      // Cooldown expired: allow a probe attempt
      this.credentialCooldowns.delete(id);
      return true;
    }
    return false;
  }

  isModelAvailable(modelName: string): boolean {
    if (this.invalidModels.has(modelName)) {
      return false;
    }
    const cooldownUntil = this.modelCooldowns.get(modelName);
    if (!cooldownUntil) {
      return true;
    }
    if (Date.now() >= cooldownUntil) {
      // Cooldown expired: allow a probe attempt
      this.modelCooldowns.delete(modelName);
      return true;
    }
    return false;
  }

  markRateLimited(id: string, cooldownMs: number = 60000): void {
    const cooldownUntil = Date.now() + Math.max(1, cooldownMs);
    this.credentialCooldowns.set(id, cooldownUntil);
    const count = (this.consecutiveFailures.get(id) ?? 0) + 1;
    this.consecutiveFailures.set(id, count);
  }

  markModelUnavailable(modelName: string, cooldownMs: number = 120000): void {
    const cooldownUntil = Date.now() + Math.max(1, cooldownMs);
    this.modelCooldowns.set(modelName, cooldownUntil);
  }

  markCredentialRevoked(id: string): void {
    this.revokedCredentials.add(id);
    this.credentialCooldowns.delete(id);
  }

  markModelNotFound(modelName: string): void {
    this.invalidModels.add(modelName);
    this.modelCooldowns.delete(modelName);
  }

  recordSuccess(credentialId: string, modelName: string): void {
    this.consecutiveFailures.delete(credentialId);
    this.credentialCooldowns.delete(credentialId);
    this.modelCooldowns.delete(modelName);
  }

  reset(): void {
    this.credentialCooldowns.clear();
    this.modelCooldowns.clear();
    this.revokedCredentials.clear();
    this.invalidModels.clear();
    this.consecutiveFailures.clear();
  }
}

export const defaultHealthTracker = new InMemoryHealthTracker();
