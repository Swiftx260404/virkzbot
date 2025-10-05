class CooldownManager {
  private store = new Map<string, number>();

  use(key: string, durationMs: number) {
    const now = Date.now();
    const expiresAt = this.store.get(key) ?? 0;
    if (expiresAt > now) {
      return { ok: false, remaining: expiresAt - now };
    }
    this.store.set(key, now + durationMs);
    return { ok: true, remaining: 0 };
  }

  peek(key: string) {
    const now = Date.now();
    const expiresAt = this.store.get(key) ?? 0;
    if (expiresAt <= now) {
      this.store.delete(key);
      return { active: false, remaining: 0 };
    }
    return { active: true, remaining: expiresAt - now };
  }

  clear(key: string) {
    this.store.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, expiresAt] of this.store.entries()) {
      if (expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

export const cooldownManager = new CooldownManager();

export function buildCooldownKey(scope: string, ...parts: (string | number | undefined)[]) {
  const suffix = parts.filter((p) => p !== undefined && p !== null).map(String).join(':');
  return suffix ? `${scope}:${suffix}` : scope;
}

export function useScopedCooldown(scope: string, identifier: string, durationMs: number) {
  const key = buildCooldownKey(scope, identifier);
  return cooldownManager.use(key, durationMs);
}

export function peekScopedCooldown(scope: string, identifier: string) {
  const key = buildCooldownKey(scope, identifier);
  return cooldownManager.peek(key);
}

export function clearScopedCooldown(scope: string, identifier: string) {
  const key = buildCooldownKey(scope, identifier);
  cooldownManager.clear(key);
}

export function onCooldown(key: string, ms: number) {
  return cooldownManager.use(key, ms);
}
